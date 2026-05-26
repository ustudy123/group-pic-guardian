import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertPriv(supabase: any, userId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const ok = (roles ?? []).some(
    (r: any) => r.role === "admin" || r.role === "analista",
  );
  if (!ok) throw new Error("Sem permissão.");
}

// ============ Enfileirar ============
export const enfileirarRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        bairroId: z.string().uuid(),
        tipo: z.enum(["pre", "pos"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPriv(supabase, userId);

    // pega o contrato do bairro
    const { data: bairro, error: be } = await supabase
      .from("bairros")
      .select("id, contrato_id")
      .eq("id", data.bairroId)
      .single();
    if (be || !bairro) throw new Error(be?.message ?? "Bairro não encontrado.");

    // total de ruas (pra calcular progresso)
    const { count: totalRuas } = await supabase
      .from("ruas")
      .select("id", { count: "exact", head: true })
      .eq("bairro_id", data.bairroId);

    const { data: job, error: ie } = await supabase
      .from("vistoria_relatorio_jobs")
      .insert({
        bairro_id: data.bairroId,
        contrato_id: (bairro as any).contrato_id,
        tipo: data.tipo,
        status: "na_fila",
        progresso_total: totalRuas ?? 0,
        solicitado_por: userId,
      })
      .select("id")
      .single();
    if (ie) throw new Error(ie.message);

    // dispara o worker externo (best-effort; se falhar, o cron pega depois)
    try {
      const ghToken = process.env.GITHUB_DISPATCH_TOKEN;
      const ghRepo = process.env.GITHUB_DISPATCH_REPO; // ex: "usuario/repo"
      if (ghToken && ghRepo) {
        await fetch(`https://api.github.com/repos/${ghRepo}/dispatches`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event_type: "processar-relatorio",
            client_payload: { jobId: (job as any).id },
          }),
        });
      }
    } catch {
      // silencioso: o cron eventualmente processa
    }

    return { jobId: (job as any).id };
  });

// ============ Status de 1 job ============
export const getJobStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ jobId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPriv(supabase, userId);
    const { data: job, error } = await supabase
      .from("vistoria_relatorio_jobs")
      .select("*")
      .eq("id", data.jobId)
      .single();
    if (error) throw new Error(error.message);

    let url: string | null = null;
    if ((job as any).pdf_path) {
      const { data: signed } = await supabase.storage
        .from("vistorias-fotos")
        .createSignedUrl((job as any).pdf_path, 3600);
      url = signed?.signedUrl ?? null;
    }
    return { job, url };
  });

// ============ Listar jobs de 1 bairro ============
export const listJobsBairro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ bairroId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPriv(supabase, userId);

    const { data: jobs, error } = await supabase
      .from("vistoria_relatorio_jobs")
      .select("*")
      .eq("bairro_id", data.bairroId)
      .order("solicitado_em", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    const withUrls = await Promise.all(
      (jobs ?? []).map(async (j: any) => {
        if (!j.pdf_path) return { ...j, url: null };
        const { data: signed } = await supabase.storage
          .from("vistorias-fotos")
          .createSignedUrl(j.pdf_path, 3600);
        return { ...j, url: signed?.signedUrl ?? null };
      }),
    );
    return { jobs: withUrls };
  });

// ============ Cancelar/retry ============
export const retryJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ jobId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPriv(supabase, userId);
    const { error } = await supabase
      .from("vistoria_relatorio_jobs")
      .update({
        status: "na_fila",
        mensagem_erro: null,
        progresso_atual: 0,
        fotos_processadas: 0,
        iniciado_em: null,
        concluido_em: null,
      })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
