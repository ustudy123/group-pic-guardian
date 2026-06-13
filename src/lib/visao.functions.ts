import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ListarSchema = z.object({
  conformidade: z
    .enum(["conforme", "atencao", "nao_conforme", "critico", "inconclusivo", "todas"])
    .default("todas"),
  etapa: z.string().default("todas"),
  encarregadoId: z.string().uuid().nullable().optional(),
  dias: z.number().int().min(1).max(180).default(7),
  limit: z.number().int().min(1).max(100).default(60),
});

export const listarAnalises = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ListarSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const desde = new Date(Date.now() - data.dias * 86400_000).toISOString();

    let q = supabase
      .from("foto_analises")
      .select(
        `
        id, etapa, etapa_confianca, conformidade_geral,
        epi_detectado, sinalizacao, pv_qualidade, problemas, resumo,
        modelo, analisado_em,
        foto:foto_id!inner ( id, storage_path, storage_url, data_envio,
                       remetente_nome, remetente_telefone, caption,
                       encarregado_id, encarregados ( id, nome, foto_url ) )
      `,
      )
      .gte("foto.data_envio", desde)
      .order("data_envio", { referencedTable: "foto", ascending: false })
      .limit(data.limit);

    if (data.conformidade !== "todas") q = q.eq("conformidade_geral", data.conformidade);
    if (data.etapa !== "todas") q = q.eq("etapa", data.etapa);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let filtradas = rows ?? [];
    if (data.encarregadoId) {
      filtradas = filtradas.filter(
        (r: any) => r.foto?.encarregado_id === data.encarregadoId,
      );
    }

    // Gera signed URLs para thumbnails
    const items = await Promise.all(
      filtradas.map(async (r: any) => {
        let signedUrl: string | null = null;
        const path = r.foto?.storage_path;
        if (path) {
          const { data: s } = await supabase.storage
            .from("fotos-obras")
            .createSignedUrl(path, 3600);
          signedUrl = s?.signedUrl ?? null;
        }
        return { ...r, signed_url: signedUrl };
      }),
    );

    return { items };
  });

export const getEstatisticas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const desde24h = new Date(Date.now() - 86400_000).toISOString();

    const [analisesRes, jobsPendRes, jobsErroRes, criticosRes] = await Promise.all([
      supabase
        .from("foto_analises")
        .select("conformidade_geral", { count: "exact" })
        .gte("analisado_em", desde24h),
      supabase
        .from("foto_analise_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente"),
      supabase
        .from("foto_analise_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "erro"),
      supabase
        .from("foto_analises")
        .select("id", { count: "exact", head: true })
        .eq("conformidade_geral", "critico")
        .gte("analisado_em", desde24h),
    ]);

    const todas = analisesRes.data ?? [];
    const conforme = todas.filter((a: any) => a.conformidade_geral === "conforme").length;
    const total = todas.length;

    return {
      hoje: total,
      percentual_conforme: total > 0 ? Math.round((conforme / total) * 100) : 0,
      criticos_24h: criticosRes.count ?? 0,
      fila_pendente: jobsPendRes.count ?? 0,
      fila_erro: jobsErroRes.count ?? 0,
    };
  });

export const reprocessarFoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ fotoId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Apenas admin pode reprocessar.");

    const { error } = await supabase
      .from("foto_analise_jobs")
      .insert({ foto_id: data.fotoId, status: "pendente", tentativas: 0 });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listarEncarregadosAnalise = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("encarregados")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome");
    if (error) throw new Error(error.message);
    return { encarregados: data ?? [] };
  });

const MODELOS_VISAO = ["gpt-4o", "gpt-4o-mini"] as const;

export const getVisaoConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("visao_config" as any)
      .select("modelo, aprendizado, manual_fotos")
      .eq("id", "default")
      .maybeSingle();
    return {
      modelo: ((data as any)?.modelo as string) || "gpt-4o",
      aprendizado: ((data as any)?.aprendizado as string) || "",
      manual_fotos: ((data as any)?.manual_fotos as string) || "",
    };
  });

export const setVisaoModelo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ modelo: z.enum(MODELOS_VISAO) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Apenas admin pode trocar o modelo.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("visao_config" as any)
      .upsert(
        { id: "default", modelo: data.modelo, updated_at: new Date().toISOString() },
        { onConflict: "id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, modelo: data.modelo };
  });

export const setVisaoTextos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        aprendizado: z.string().max(50_000).optional(),
        manual_fotos: z.string().max(50_000).optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Apenas admin pode editar os textos da IA.");

    const patch: Record<string, any> = {
      id: "default",
      updated_at: new Date().toISOString(),
    };
    if (typeof data.aprendizado === "string") patch.aprendizado = data.aprendizado;
    if (typeof data.manual_fotos === "string") patch.manual_fotos = data.manual_fotos;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("visao_config" as any)
      .upsert(patch, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reprocessarFilaCompleta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Apenas admin pode reprocessar a fila.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, count } = await supabaseAdmin
      .from("foto_analise_jobs")
      .update({ status: "pendente", tentativas: 0, erro: null }, { count: "exact" })
      .in("status", ["pendente", "erro", "processando"]);
    if (error) throw new Error(error.message);
    return { ok: true, reenfileirados: count ?? 0 };
  });

// Drena N jobs da fila DIRETO do servidor da app (sem depender de cron externo).
export const processarAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        max: z.number().int().min(1).max(5).default(3),
        encarregadoId: z.string().uuid().nullable().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Apenas admin pode processar a fila.");

    const { processarFila } = await import("@/lib/visao-analyzer.server");
    return processarFila(data.max, { encarregadoId: data.encarregadoId ?? null });
  });


