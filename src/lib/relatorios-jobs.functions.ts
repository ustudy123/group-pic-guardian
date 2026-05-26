import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
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

const WORKER_ROUTE = "/api/public/hooks/processar-relatorios";
const DIAG_PREFIX = "[worker] ";

function fmtDiag(message: string) {
  return `${DIAG_PREFIX}${message}`.slice(0, 500);
}

async function salvarMensagemJob(supabase: any, jobId: string, mensagem: string | null) {
  const { error } = await supabase
    .from("vistoria_relatorio_jobs")
    .update({ mensagem_erro: mensagem })
    .eq("id", jobId);
  if (error) console.error("Falha ao salvar diagnóstico do job:", error.message);
}

async function dispararGithub(jobId: string) {
  const ghToken = process.env.GITHUB_DISPATCH_TOKEN;
  const ghRepo = process.env.GITHUB_DISPATCH_REPO;

  if (!ghToken || !ghRepo) {
    return { ok: false as const, message: "GitHub dispatch não configurado neste ambiente." };
  }

  try {
    const resp = await fetch(`https://api.github.com/repos/${ghRepo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "processar-relatorio",
        client_payload: { jobId },
      }),
    });

    if (!resp.ok) {
      const body = (await resp.text()).slice(0, 200);
      return {
        ok: false as const,
        message: `GitHub Actions recusou o dispatch (${resp.status})${body ? `: ${body}` : "."}`,
      };
    }

    return { ok: true as const };
  } catch (error: any) {
    return {
      ok: false as const,
      message: `Erro ao acionar GitHub Actions: ${String(error?.message ?? error)}`,
    };
  }
}

async function processarChunkDireto(jobId: string) {
  const secret = process.env.RELATORIOS_WORKER_SECRET;
  if (!secret) {
    return { ok: false as const, message: "RELATORIOS_WORKER_SECRET não configurado no servidor." };
  }

  try {
    const request = getRequest();
    const origin = new URL(request.url).origin;
    const resp = await fetch(`${origin}${WORKER_ROUTE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-relatorios-secret": secret,
      },
      body: JSON.stringify({ jobId }),
    });

    const raw = await resp.text();
    let payload: any = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }

    if (!resp.ok) {
      const detalhe = payload?.error ?? raw?.slice(0, 200) ?? resp.statusText;
      return {
        ok: false as const,
        message: `Worker interno falhou (${resp.status})${detalhe ? `: ${detalhe}` : ""}`,
      };
    }

    return {
      ok: true as const,
      done: Boolean(payload?.done),
      idle: Boolean(payload?.idle),
    };
  } catch (error: any) {
    return {
      ok: false as const,
      message: `Falha ao chamar o worker interno: ${String(error?.message ?? error)}`,
    };
  }
}

function isJobTravado(job: any) {
  if (!job || (job.status !== "na_fila" && job.status !== "processando")) return false;
  const base = job.updated_at ?? job.iniciado_em ?? job.solicitado_em;
  const elapsed = Date.now() - new Date(base).getTime();
  return elapsed >= 2_500;
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
