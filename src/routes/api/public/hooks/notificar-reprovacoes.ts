// Aviso de fotos reprovadas ao encarregado, via WhatsApp (instância Macro I.A —
// a MESMA do bot de conversa/alertas; nada a ver com a instância de fotos).
// Chamado por cron do GitHub Actions. Anti-spam: agrupa TODAS as reprovações
// pendentes de aviso em UMA mensagem por encarregado, com pausa entre envios.
//
// Autenticação: header `X-Bot-Secret` = AI_BOT_WEBHOOK_SECRET.
// Body opcional: { dryRun?: boolean, batch?: number }

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bot-Secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function enviarUazapi(numero: string, mensagem: string) {
  const baseUrl = (
    process.env.UAZAPI_MACRO_IA_BASE_URL ||
    process.env.UAZAPI_BASE_URL ||
    "https://ipazua.uazapi.com"
  ).replace(/\/+$/, "");
  const token = process.env.UAZAPI_MACRO_IA_TOKEN || process.env.UAZAPI_INSTANCE_TOKEN;
  if (!token || !numero || !mensagem) {
    return { ok: false, status: 0, detail: "token/numero/mensagem ausente" };
  }
  try {
    const r = await fetch(`${baseUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: numero, text: mensagem }),
    });
    const txt = await r.text().catch(() => "");
    if (!r.ok) {
      console.error(`[notif-reprovacoes] send/text falhou ${r.status}: ${txt.slice(0, 300)}`);
    }
    return { ok: r.ok, status: r.status, detail: txt.slice(0, 400) };
  } catch (e) {
    console.error("[notif-reprovacoes] erro send/text:", e);
    return { ok: false, status: 0, detail: String(e).slice(0, 400) };
  }
}

function montarMensagem(
  primeiroNome: string,
  porMotivo: Map<string, number>,
  total: number,
  portalUrl: string,
): string {
  const linhas = [...porMotivo.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([motivo, qtd]) => `- ${motivo}${qtd > 1 ? ` (${qtd} fotos)` : ""}`);
  const plural = total > 1;
  return (
    `Opa${primeiroNome ? ` ${primeiroNome}` : ""}! Aqui é da qualidade da Macro. ` +
    `${plural ? `${total} fotos suas não passaram` : `1 foto sua não passou`} na avaliação:\n` +
    `${linhas.join("\n")}\n` +
    `Dá uma olhada no seu portal pra ver quais são e mandar a correção: ${portalUrl}`
  );
}

export const Route = createFileRoute("/api/public/hooks/notificar-reprovacoes")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const expected = process.env.AI_BOT_WEBHOOK_SECRET;
        if (!expected) {
          return json({ error: "AI_BOT_WEBHOOK_SECRET não configurado no servidor." }, 503);
        }
        const provided =
          request.headers.get("x-bot-secret") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (provided !== expected) return json({ error: "Unauthorized" }, 401);

        let body: { dryRun?: boolean; batch?: number } = {};
        try {
          body = await request.json();
        } catch {
          /* body vazio é ok */
        }

        const portalUrl =
          process.env.APP_PUBLIC_URL?.replace(/\/+$/, "").concat("/portal") ||
          "https://macroambiental-botgrupos.lovable.app/portal";

        // Reprovações ainda não avisadas
        const { data: pendentes, error: errPend } = await supabaseAdmin
          .from("foto_avaliacoes")
          .select("id, foto_id, motivo_id")
          .eq("status", "reprovada")
          .eq("notificado", false)
          .limit(500);
        if (errPend) return json({ error: errPend.message }, 500);
        if (!pendentes?.length) return json({ idle: true, motivo: "nada_pendente" });

        // Junta foto → encarregado e nomes de motivo
        const fotoIds = pendentes.map((p) => p.foto_id);
        const [{ data: fotos }, { data: motivos }, { data: encarregados }] = await Promise.all([
          supabaseAdmin.from("fotos").select("id, encarregado_id").in("id", fotoIds),
          supabaseAdmin.from("motivos_reprovacao").select("id, nome"),
          supabaseAdmin.from("encarregados").select("id, nome, telefone").eq("ativo", true),
        ]);
        const encDaFoto = new Map((fotos ?? []).map((f) => [f.id, f.encarregado_id]));
        const nomeMotivo = new Map((motivos ?? []).map((m) => [m.id, m.nome]));
        const encPorId = new Map((encarregados ?? []).map((e) => [e.id, e]));

        // Agrupa por encarregado
        const grupos = new Map<string, { avaliacaoIds: string[]; porMotivo: Map<string, number> }>();
        for (const p of pendentes) {
          const encId = encDaFoto.get(p.foto_id);
          if (!encId) continue;
          if (!grupos.has(encId)) grupos.set(encId, { avaliacaoIds: [], porMotivo: new Map() });
          const g = grupos.get(encId)!;
          g.avaliacaoIds.push(p.id);
          const motivo = nomeMotivo.get(p.motivo_id ?? "") ?? "Motivo não informado";
          g.porMotivo.set(motivo, (g.porMotivo.get(motivo) ?? 0) + 1);
        }

        const batch = Math.min(Math.max(Number(body.batch) || 5, 1), 15);
        const resultados: Array<{
          encarregado: string;
          telefone: string | null;
          fotos: number;
          enviado: boolean;
          detalhe?: string;
        }> = [];

        let enviados = 0;
        for (const [encId, g] of grupos) {
          if (enviados >= batch) break;
          const enc = encPorId.get(encId);
          const nome = enc?.nome ?? "";
          const telefone = (enc?.telefone ?? "").replace(/\D/g, "") || null;
          const total = g.avaliacaoIds.length;
          const mensagem = montarMensagem(nome.trim().split(/\s+/)[0] ?? "", g.porMotivo, total, portalUrl);

          if (body.dryRun) {
            resultados.push({ encarregado: nome, telefone, fotos: total, enviado: false, detalhe: mensagem });
            continue;
          }

          if (!telefone) {
            // Sem telefone: o aviso fica só no portal; marca para não reprocessar sempre
            await supabaseAdmin
              .from("foto_avaliacoes")
              .update({ notificado: true })
              .in("id", g.avaliacaoIds);
            resultados.push({ encarregado: nome, telefone: null, fotos: total, enviado: false, detalhe: "sem_telefone" });
            continue;
          }

          if (enviados > 0) await sleep(2000 + Math.floor(Math.random() * 2000));
          const envio = await enviarUazapi(telefone, mensagem);
          if (envio.ok) {
            await supabaseAdmin
              .from("foto_avaliacoes")
              .update({ notificado: true })
              .in("id", g.avaliacaoIds);
            // Contexto para o bot Macro I.A se o encarregado responder
            await supabaseAdmin.from("ai_bot_conversas").insert({
              telefone,
              nome,
              role: "assistant",
              conteudo: mensagem,
            });
          }
          enviados++;
          resultados.push({
            encarregado: nome,
            telefone,
            fotos: total,
            enviado: envio.ok,
            detalhe: envio.ok ? undefined : envio.detail,
          });
        }

        return json({
          dryRun: !!body.dryRun,
          encarregadosPendentes: grupos.size,
          resultados,
        });
      },
    },
  },
});
