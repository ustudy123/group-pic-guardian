import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  PASTA_CHECKLIST,
  TIPOS_PADRAO,
  caminhoDia,
  caminhoTipos,
  caminhoUltimoTipo,
  checklistNovo,
  jidParaEnvio,
  type ChecklistDia,
  type StatusItem,
  type TipoChecklist,
} from "@/lib/checklist-fotos";

// Checklist de fotos: só administradores marcam, editam e enviam (pedido da
// equipe de RFO). Os arquivos ficam no bucket fotos-obras (ver checklist-fotos.ts).

const BUCKET = "fotos-obras";
const dataValida = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const status = z.enum(["enviado", "pendente", "na"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exigirAdmin(context: { supabase: any; userId: string; claims?: any }) {
  const { data: roles } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(roles ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Só administradores podem usar o checklist de fotos.");
  }
  const { data: perfil } = await supabaseAdmin
    .from("profiles")
    .select("display_name, email")
    .eq("id", context.userId)
    .maybeSingle();
  return perfil?.display_name || perfil?.email || context.claims?.email || null;
}

async function lerJson<T>(caminho: string): Promise<T | null> {
  try {
    const { data } = await supabaseAdmin.storage.from(BUCKET).download(caminho);
    if (!data) return null;
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}

async function gravarJson(caminho: string, valor: unknown) {
  const corpo = new Blob([JSON.stringify(valor)], { type: "application/json" });
  const bucket = supabaseAdmin.storage.from(BUCKET);
  const { error } = await bucket.upload(caminho, corpo, {
    contentType: "application/json",
    upsert: true,
  });
  if (!error) return;
  // Se o bucket recusar sobrescrever, apaga e grava de novo.
  await bucket.remove([caminho]);
  const { error: e2 } = await bucket.upload(caminho, corpo, { contentType: "application/json" });
  if (e2) throw new Error(`Não foi possível salvar o checklist: ${e2.message}`);
}

async function lerTipos(): Promise<TipoChecklist[]> {
  const salvos = await lerJson<{ tipos: TipoChecklist[] }>(caminhoTipos());
  return salvos?.tipos?.length ? salvos.tipos : TIPOS_PADRAO;
}

async function encarregado(id: string) {
  const { data } = await supabaseAdmin
    .from("encarregados")
    .select("id, nome, grupo_whatsapp_id, grupo_whatsapp_nome")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("Encarregado não encontrado.");
  return data;
}

// ---------- Tipos ----------

export const obterTiposChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context);
    const salvos = await lerJson<{ tipos: TipoChecklist[] }>(caminhoTipos());
    return { tipos: await lerTipos(), personalizado: Boolean(salvos?.tipos?.length) };
  });

const esquemaTipos = z
  .array(
    z.object({
      id: z.string().min(1).max(80),
      nome: z.string().trim().min(1).max(80),
      itens: z
        .array(z.object({ id: z.string().min(1).max(120), nome: z.string().trim().min(1).max(120) }))
        .min(1)
        .max(80),
    }),
  )
  .min(1)
  .max(30);

export const salvarTiposChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tipos: esquemaTipos }).parse(i))
  .handler(async ({ data, context }) => {
    const quem = await exigirAdmin(context);
    await gravarJson(caminhoTipos(), {
      tipos: data.tipos,
      atualizado_em: new Date().toISOString(),
      atualizado_por: quem,
    });
    return { ok: true };
  });

// ---------- Checklist do dia ----------

export const obterChecklistDia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ encarregadoId: z.string().uuid(), data: dataValida }).parse(i))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const [checklist, ultimo, tipos, enc] = await Promise.all([
      lerJson<ChecklistDia>(caminhoDia(data.data, data.encarregadoId)),
      lerJson<{ tipo_id: string }>(caminhoUltimoTipo(data.encarregadoId)),
      lerTipos(),
      encarregado(data.encarregadoId),
    ]);
    return {
      checklist,
      tipos,
      tipoSugerido: ultimo?.tipo_id ?? null,
      temGrupo: Boolean(jidParaEnvio(enc.grupo_whatsapp_id)),
    };
  });

/** Escolhe (ou troca) o tipo de serviço do dia. */
export const definirTipoChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ encarregadoId: z.string().uuid(), data: dataValida, tipoId: z.string().min(1) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const quem = await exigirAdmin(context);
    const [tipos, enc, anterior] = await Promise.all([
      lerTipos(),
      encarregado(data.encarregadoId),
      lerJson<ChecklistDia>(caminhoDia(data.data, data.encarregadoId)),
    ]);
    const tipo = tipos.find((t) => t.id === data.tipoId);
    if (!tipo) throw new Error("Tipo de checklist não encontrado.");
    const novo = checklistNovo(tipo, { id: enc.id, nome: enc.nome }, data.data, anterior);
    novo.atualizado_por = quem;
    await Promise.all([
      gravarJson(caminhoDia(data.data, enc.id), novo),
      gravarJson(caminhoUltimoTipo(enc.id), { tipo_id: tipo.id }),
    ]);
    return novo;
  });

/**
 * Marca um ou mais itens. Lê o arquivo na hora e muda só esses itens: duas
 * pessoas marcando itens diferentes não apagam a marcação uma da outra.
 */
export const marcarItensChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        encarregadoId: z.string().uuid(),
        data: dataValida,
        itens: z.array(z.object({ id: z.string().min(1), status })).min(1).max(100),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const quem = await exigirAdmin(context);
    const caminho = caminhoDia(data.data, data.encarregadoId);
    const atual = await lerJson<ChecklistDia>(caminho);
    if (!atual) throw new Error("Escolha o tipo de serviço do dia antes de marcar.");
    const novos = new Map(data.itens.map((i) => [i.id, i.status as StatusItem]));
    atual.itens = atual.itens.map((i) => (novos.has(i.id) ? { ...i, status: novos.get(i.id)! } : i));
    atual.atualizado_em = new Date().toISOString();
    atual.atualizado_por = quem;
    await gravarJson(caminho, atual);
    return atual;
  });

/** Manda a imagem do checklist no grupo de WhatsApp do encarregado (instância de fotos). */
export const enviarChecklistNoGrupo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        encarregadoId: z.string().uuid(),
        data: dataValida,
        imagemBase64: z.string().min(100).max(8_000_000),
        legenda: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const quem = await exigirAdmin(context);
    const enc = await encarregado(data.encarregadoId);
    const jid = jidParaEnvio(enc.grupo_whatsapp_id);
    if (!jid) throw new Error("Este encarregado não tem grupo de WhatsApp cadastrado.");

    const baseUrl = (process.env.UAZAPI_BASE_URL || "https://api.uazapi.com").replace(/\/+$/, "");
    const token = process.env.UAZAPI_INSTANCE_TOKEN;
    if (!token) throw new Error("WhatsApp de fotos não configurado no servidor.");

    const puro = data.imagemBase64.replace(/^data:[^;]+;base64,/, "");
    let erro = "";
    let ok = false;
    // A UazAPI aceita o arquivo em base64; algumas versões pedem o prefixo data:.
    for (const file of [puro, `data:image/png;base64,${puro}`]) {
      const r = await fetch(`${baseUrl}/send/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({ number: jid, type: "image", file, text: data.legenda ?? "" }),
      });
      if (r.ok) {
        ok = true;
        break;
      }
      erro = `${r.status} ${(await r.text().catch(() => "")).slice(0, 160)}`;
    }
    if (!ok) throw new Error(`O WhatsApp não aceitou o envio (${erro}).`);

    const caminho = caminhoDia(data.data, enc.id);
    const atual = await lerJson<ChecklistDia>(caminho);
    if (atual) {
      atual.enviado_grupo_em = new Date().toISOString();
      atual.atualizado_por = atual.atualizado_por ?? quem;
      await gravarJson(caminho, atual);
    }
    return { ok: true, grupo: enc.grupo_whatsapp_nome ?? null };
  });

// ---------- Visão geral e exportação ----------

/** Todos os checklists de um dia + encarregados ativos com grupo (para mostrar quem falta). */
export const checklistsDoDia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ data: dataValida }).parse(i))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { data: arquivos } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(`${PASTA_CHECKLIST}/dias/${data.data}`, { limit: 500 });
    const nomes = (arquivos ?? []).filter((a) => a.name.endsWith(".json")).map((a) => a.name);
    const checklists = (
      await Promise.all(nomes.map((n) => lerJson<ChecklistDia>(`${PASTA_CHECKLIST}/dias/${data.data}/${n}`)))
    ).filter((c): c is ChecklistDia => Boolean(c));
    const { data: encs } = await supabaseAdmin
      .from("encarregados")
      .select("id, nome, grupo_whatsapp_id")
      .eq("ativo", true)
      .order("nome");
    return {
      checklists,
      encarregados: (encs ?? [])
        .filter((e) => Boolean(jidParaEnvio(e.grupo_whatsapp_id)))
        .map((e) => ({ id: e.id, nome: e.nome })),
    };
  });

/** Dias de um mês que têm algum checklist (para a exportação do mês). */
export const diasComChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ anoMes: z.string().regex(/^\d{4}-\d{2}$/) }).parse(i))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { data: pastas } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(`${PASTA_CHECKLIST}/dias`, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    return {
      dias: (pastas ?? [])
        .map((p) => p.name)
        .filter((n) => n.startsWith(`${data.anoMes}-`) && /^\d{4}-\d{2}-\d{2}$/.test(n)),
    };
  });
