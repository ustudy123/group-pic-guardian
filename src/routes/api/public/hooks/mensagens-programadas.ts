// Hook de mensagens programadas (check-in proativo dos encarregados).
// Chamado pelo cron do GitHub Actions a cada 5 min dentro das janelas:
//   - manhã: 07:15–08:15 (America/Sao_Paulo)
//   - noite: 18:00–19:00 (America/Sao_Paulo)
// A cada chamada envia para um LOTE pequeno de encarregados ainda não contatados
// no período do dia — assim os envios saem intercalados, evitando bloqueio por spam.
//
// Autenticação: header `X-Bot-Secret` = AI_BOT_WEBHOOK_SECRET (mesmo do ai-bot).
// Body opcional: { periodo?: "manha"|"noite", batch?: number, dryRun?: boolean }
//   - periodo: força um período (útil para teste fora da janela)
//   - batch: quantos envios por chamada (padrão 2)
//   - dryRun: não envia nem grava, só mostra quem seria contatado

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

type Periodo = "manha" | "noite";

/** Hora/minuto e data atuais em America/Sao_Paulo (sem depender do TZ do servidor). */
function agoraSaoPaulo(): { hhmm: number; dataRef: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return {
    hhmm: Number(parts.hour) * 100 + Number(parts.minute),
    dataRef: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function periodoAtual(hhmm: number): Periodo | null {
  if (hhmm >= 715 && hhmm <= 815) return "manha";
  if (hhmm >= 1800 && hhmm <= 1900) return "noite";
  return null;
}

/** Substitui {nome} / FULANO pelo primeiro nome; sem nome, remove o placeholder com naturalidade. */
function personalizar(template: string, nome: string | null): string {
  const primeiro = (nome || "").trim().split(/\s+/)[0] || "";
  if (primeiro) {
    return template.replace(/\{nome\}|FULANO/gi, primeiro);
  }
  // sem nome cadastrado: "Bom dia {nome}," -> "Bom dia,"
  return template.replace(/\s*(\{nome\}|FULANO)\s*([,!]?)/gi, "$2");
}

async function enviarUazapi(numero: string, mensagem: string): Promise<boolean> {
  const baseUrl = (process.env.UAZAPI_BASE_URL || "https://api.uazapi.com").replace(/\/+$/, "");
  const token = process.env.UAZAPI_INSTANCE_TOKEN;
  if (!token || !numero || !mensagem) return false;
  try {
    const r = await fetch(`${baseUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: numero, text: mensagem }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error(`[msg-programadas] send/text falhou ${r.status}: ${txt.slice(0, 300)}`);
    }
    return r.ok;
  } catch (e) {
    console.error("[msg-programadas] erro send/text:", e);
    return false;
  }
}

function embaralhar<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const Route = createFileRoute("/api/public/hooks/mensagens-programadas")({
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

        let body: { periodo?: Periodo; batch?: number; dryRun?: boolean } = {};
        try {
          body = await request.json();
        } catch {
          /* body vazio é ok */
        }

        const { hhmm, dataRef } = agoraSaoPaulo();
        const periodo: Periodo | null =
          body.periodo === "manha" || body.periodo === "noite"
            ? body.periodo
            : periodoAtual(hhmm);

        if (!periodo) {
          return json({ idle: true, motivo: "fora_da_janela", hhmm });
        }

        const { data: config } = await supabaseAdmin
          .from("ai_bot_config")
          .select("ativo, msg_programadas_ativas, msg_manha, msg_noite")
          .eq("id", "default")
          .maybeSingle();

        if (!config?.ativo) return json({ idle: true, motivo: "bot_inativo" });
        if (!config.msg_programadas_ativas) {
          return json({ idle: true, motivo: "programadas_desativadas" });
        }

        const template = (periodo === "manha" ? config.msg_manha : config.msg_noite)?.trim();
        if (!template) return json({ idle: true, motivo: "template_vazio" });

        // Encarregados autorizados e ativos
        const { data: autorizados, error: errAut } = await supabaseAdmin
          .from("ai_bot_autorizados")
          .select("telefone, nome")
          .eq("ativo", true);
        if (errAut) return json({ error: errAut.message }, 500);

        // Quem já recebeu hoje neste período (idempotência)
        const { data: jaEnviados } = await supabaseAdmin
          .from("ai_bot_envios_programados")
          .select("telefone")
          .eq("data_ref", dataRef)
          .eq("periodo", periodo);

        const enviadosSet = new Set((jaEnviados ?? []).map((e) => e.telefone));
        const pendentes = (autorizados ?? []).filter((a) => !enviadosSet.has(a.telefone));

        if (pendentes.length === 0) {
          return json({ idle: true, motivo: "todos_contatados", periodo, dataRef });
        }

        const batch = Math.min(Math.max(Number(body.batch) || 2, 1), 10);
        const lote = embaralhar(pendentes).slice(0, batch);

        if (body.dryRun) {
          return json({
            dryRun: true,
            periodo,
            dataRef,
            lote: lote.map((c) => ({
              telefone: c.telefone,
              mensagem: personalizar(template, c.nome),
            })),
            restantes: pendentes.length,
          });
        }

        const resultados: Array<{ telefone: string; sucesso: boolean }> = [];

        for (const contato of lote) {
          const mensagem = personalizar(template, contato.nome);

          // Reserva a vaga ANTES de enviar (unique constraint evita duplicado
          // se duas execuções do cron rodarem ao mesmo tempo)
          const { error: errIns } = await supabaseAdmin
            .from("ai_bot_envios_programados")
            .insert({
              telefone: contato.telefone,
              nome: contato.nome,
              periodo,
              data_ref: dataRef,
              mensagem,
              sucesso: false,
            });
          if (errIns) {
            // 23505 = unique_violation: outra execução já pegou este contato
            console.log(`[msg-programadas] pulando ${contato.telefone}: ${errIns.message}`);
            continue;
          }

          const ok = await enviarUazapi(contato.telefone, mensagem);

          if (ok) {
            await supabaseAdmin
              .from("ai_bot_envios_programados")
              .update({ sucesso: true, enviado_em: new Date().toISOString() })
              .eq("telefone", contato.telefone)
              .eq("periodo", periodo)
              .eq("data_ref", dataRef);

            // Registra no histórico para o bot ter contexto quando o encarregado responder
            await supabaseAdmin.from("ai_bot_conversas").insert({
              telefone: contato.telefone,
              nome: contato.nome,
              role: "assistant",
              conteudo: mensagem,
            });
          } else {
            // Libera a vaga para nova tentativa na próxima execução do cron
            await supabaseAdmin
              .from("ai_bot_envios_programados")
              .delete()
              .eq("telefone", contato.telefone)
              .eq("periodo", periodo)
              .eq("data_ref", dataRef)
              .eq("sucesso", false);
          }

          resultados.push({ telefone: contato.telefone, sucesso: ok });
        }

        return json({
          periodo,
          dataRef,
          enviados: resultados,
          restantes: pendentes.length - resultados.filter((r) => r.sucesso).length,
        });
      },
    },
  },
});
