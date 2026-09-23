// Diagnóstico de uma conversa do Macro I.A: mostra, passo a passo, o que
// aconteceu com as mensagens de um contato nas últimas horas — se o webhook
// recebeu, se foi para o histórico, se uma resposta entrou na fila e como ela
// terminou (enviada, cancelada, falhou).
//
// A saída vai para o log público do GitHub Actions, então NÃO devolve o texto
// das mensagens nem telefones completos: só quantidade de dígitos, os 4
// últimos, horários, tamanhos e como as regras do bot classificam cada fala.
//
// Autenticação: header `X-Bot-Secret` = AI_BOT_WEBHOOK_SECRET.
// Body: { "telefone": "5544999596898", "horas"?: 6 }

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ehCumprimento,
  ehDespedidaCurta,
  ehNegativaDeContinuidade,
} from "@/lib/ai-bot-continuidade";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** "13 díg. …6898" — o suficiente para comparar formatos sem expor o número. */
function mascarar(tel: string | null | undefined): string {
  const d = String(tel ?? "").replace(/\D/g, "");
  return d ? `${d.length} díg. …${d.slice(-4)}` : "(vazio)";
}

function horaBrt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export const Route = createFileRoute("/api/public/hooks/diagnostico-conversa")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.AI_BOT_WEBHOOK_SECRET;
        if (!expected) return json({ error: "AI_BOT_WEBHOOK_SECRET não configurado." }, 503);
        const provided =
          request.headers.get("x-bot-secret") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (provided !== expected) return json({ error: "Unauthorized" }, 401);

        let body: { telefone?: string; horas?: number } = {};
        try {
          body = await request.json();
        } catch {
          /* sem body */
        }
        const telefone = String(body.telefone ?? "").replace(/\D/g, "");
        if (telefone.length < 8) return json({ error: "informe telefone (com DDD)" }, 400);
        const final8 = telefone.slice(-8);
        const horas = Math.min(Math.max(Number(body.horas) || 6, 1), 48);
        const desde = new Date(Date.now() - horas * 3600_000).toISOString();
        const sbAny = supabaseAdmin as unknown as { from: (t: string) => any };

        // Configuração que decide se o bot responde e com quanto atraso.
        const { data: cfg } = await sbAny
          .from("ai_bot_config")
          .select("*")
          .eq("id", "default")
          .maybeSingle();
        const persona = String(cfg?.persona ?? "");
        const config = cfg
          ? {
              ativo: cfg.ativo,
              somente_autorizados: cfg.somente_autorizados,
              delay_resposta_seg: [cfg.delay_resposta_min_seg, cfg.delay_resposta_max_seg],
              max_historico: cfg.max_historico,
              persona_tamanho: persona.length,
              persona_fala_de_silencio: /sil[eê]ncio|n[ãa]o\s+respond/i.test(persona),
            }
          : null;

        // Cadastro em Autorizados (casando pelos 8 últimos dígitos, como o bot).
        const { data: auts } = await sbAny
          .from("ai_bot_autorizados")
          .select("telefone, nome, ativo")
          .ilike("telefone", `%${final8}%`);
        const autorizados = (auts ?? []).map(
          (a: { telefone: string; nome: string | null; ativo: boolean }) => ({
            telefone: mascarar(a.telefone),
            ativo: a.ativo,
            tem_nome: Boolean((a.nome ?? "").trim()),
          }),
        );

        // Histórico do contato: cada fala com a classificação que o bot aplica.
        const { data: conv, error: errConv } = await sbAny
          .from("ai_bot_conversas")
          .select("telefone, role, conteudo, created_at")
          .ilike("telefone", `%${final8}%`)
          .gte("created_at", desde)
          .order("created_at", { ascending: true })
          .limit(80);
        let ultimaDoBot: string | null = null;
        const conversa = ((conv ?? []) as Array<{
          telefone: string;
          role: string;
          conteudo: string;
          created_at: string;
        }>).map((m) => {
          const texto = m.conteudo ?? "";
          const linha: Record<string, unknown> = {
            quando: horaBrt(m.created_at),
            quem: m.role === "assistant" ? "bot" : m.role === "user" ? "encarregado" : m.role,
            telefone: mascarar(m.telefone),
            tamanho: texto.length,
          };
          if (m.role === "user") {
            linha.despedida = ehDespedidaCurta(texto);
            linha.negativa = ehNegativaDeContinuidade(texto, ultimaDoBot);
            linha.cumprimento = ehCumprimento(texto);
          } else if (m.role === "assistant") {
            linha.termina_com_pergunta = /\?\s*$/.test(texto.trim());
            ultimaDoBot = texto;
          }
          return linha;
        });

        // Respostas que entraram na fila de envio com atraso.
        const { data: fila, error: errFila } = await sbAny
          .from("ai_bot_respostas_pendentes")
          .select("*")
          .ilike("telefone", `%${final8}%`)
          .gte("created_at", desde)
          .order("created_at", { ascending: true })
          .limit(40);
        const respostas = ((fila ?? []) as Array<Record<string, unknown>>).map((r) => ({
          criada: horaBrt(r.created_at as string),
          enviar_em: horaBrt(r.enviar_em as string),
          enviado: r.enviado,
          enviado_em: horaBrt((r.enviado_em as string) ?? null),
          cancelado: r.cancelado ?? "(coluna ausente)",
          tentativas: r.tentativas,
          telefone: mascarar(r.telefone as string),
          tamanho: String(r.resposta ?? "").length,
        }));

        // Tudo o que o webhook recebeu na janela (qualquer contato), para
        // descobrir se a mensagem chegou com outro identificador.
        const { data: proc, error: errProc } = await sbAny
          .from("ai_bot_mensagens_processadas")
          .select("telefone, created_at")
          .gte("created_at", desde)
          .order("created_at", { ascending: false })
          .limit(40);
        const recebidas = ((proc ?? []) as Array<{ telefone: string; created_at: string }>).map(
          (p) => ({ quando: horaBrt(p.created_at), telefone: mascarar(p.telefone) }),
        );

        // Movimento geral do histórico na janela (qualquer contato), idem.
        const { data: todas } = await sbAny
          .from("ai_bot_conversas")
          .select("telefone, role, created_at")
          .gte("created_at", desde)
          .order("created_at", { ascending: false })
          .limit(40);
        const historicoGeral = ((todas ?? []) as Array<{
          telefone: string;
          role: string;
          created_at: string;
        }>).map((m) => ({
          quando: horaBrt(m.created_at),
          quem: m.role === "assistant" ? "bot" : "encarregado",
          telefone: mascarar(m.telefone),
        }));

        return json({
          consultado: mascarar(telefone),
          janela_horas: horas,
          agora: horaBrt(new Date().toISOString()),
          config,
          autorizados,
          conversa,
          respostas_na_fila: respostas,
          webhook_recebidas_geral: errProc ? { erro: errProc.message } : recebidas,
          historico_geral: historicoGeral,
          erros: {
            conversas: errConv?.message ?? null,
            fila: errFila?.message ?? null,
          },
        });
      },
    },
  },
});
