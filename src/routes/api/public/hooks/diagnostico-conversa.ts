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

/** Credenciais da instância do Macro I.A (as mesmas do webhook do bot). */
function credsMacroIa() {
  const baseUrl = (
    process.env.UAZAPI_MACRO_IA_BASE_URL ||
    process.env.UAZAPI_BASE_URL ||
    "https://ipazua.uazapi.com"
  ).replace(/\/+$/, "");
  const token = process.env.UAZAPI_MACRO_IA_TOKEN || process.env.UAZAPI_INSTANCE_TOKEN || "";
  return { baseUrl, token };
}

/** Timestamp da UazAPI (s ou ms) em horário de Brasília. */
function horaDeTimestamp(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return horaBrt(new Date(n < 1e12 ? n * 1000 : n).toISOString());
}

/** Esconde trechos longos (tokens) de uma URL, mantendo host e rota. */
function mascararUrl(u: unknown): string | null {
  if (typeof u !== "string" || !u) return null;
  try {
    const url = new URL(u);
    const rota = url.pathname
      .split("/")
      .map((seg) => (seg.length > 20 ? `${seg.slice(0, 4)}…` : seg))
      .join("/");
    return `${url.host}${rota}${url.search ? "?…" : ""}`;
  } catch {
    return "(url inválida)";
  }
}

/**
 * O que a própria UazAPI sabe da conversa: se a instância está conectada, para
 * onde o webhook aponta e as últimas mensagens do chat (com status de entrega).
 * Não devolve texto — só tipo, direção, status e tamanho.
 */
async function consultarUazapi(telefones: string[]): Promise<Record<string, unknown>> {
  const { baseUrl, token } = credsMacroIa();
  if (!token) return { erro: "token da instância ausente" };
  const h = { "Content-Type": "application/json", token };
  const saida: Record<string, unknown> = {};

  try {
    const r = await fetch(`${baseUrl}/instance/status`, { headers: { token } });
    const j = (await r.json().catch(() => null)) as Record<string, any> | null;
    saida.instancia = {
      http: r.status,
      conectada: Boolean(j?.status?.connected ?? j?.connected),
      logada: Boolean(j?.status?.loggedIn ?? j?.loggedIn),
      situacao: j?.instance?.status ?? null,
    };
  } catch (e) {
    saida.instancia = { erro: String(e).slice(0, 120) };
  }

  try {
    const r = await fetch(`${baseUrl}/webhook`, { headers: { token } });
    const j = (await r.json().catch(() => null)) as unknown;
    const lista = (Array.isArray(j) ? j : j ? [j] : []) as Array<Record<string, any>>;
    saida.webhook = {
      http: r.status,
      itens: lista.map((w) => ({
        ativo: w.enabled ?? null,
        url: mascararUrl(w.url),
        eventos: w.events ?? null,
        exclui: w.excludeMessages ?? null,
      })),
    };
  } catch (e) {
    saida.webhook = { erro: String(e).slice(0, 120) };
  }

  const chats: Record<string, unknown> = {};
  for (const tel of telefones) {
    const chatid = `${tel}@s.whatsapp.net`;
    try {
      const r = await fetch(`${baseUrl}/message/find`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ chatid, limit: 12 }),
      });
      const txt = await r.text();
      if (!r.ok) {
        chats[mascarar(tel)] = { http: r.status, erro: txt.slice(0, 150) };
        continue;
      }
      const j = JSON.parse(txt) as unknown;
      const msgs = (
        Array.isArray(j)
          ? j
          : ((j as Record<string, any>)?.messages ?? (j as Record<string, any>)?.data ?? [])
      ) as Array<Record<string, any>>;
      chats[mascarar(tel)] = {
        http: r.status,
        total: msgs.length,
        chaves: msgs[0] ? Object.keys(msgs[0]).slice(0, 40) : [],
        mensagens: msgs.map((m) => ({
          quando: horaDeTimestamp(m.messageTimestamp ?? m.timestamp ?? m.moment),
          do_bot: m.fromMe ?? null,
          pela_api: m.wasSentByApi ?? null,
          tipo: m.messageType ?? m.type ?? null,
          status: m.status ?? m.ack ?? null,
          tamanho: String(m.text ?? m.content ?? "").length,
        })),
      };
    } catch (e) {
      chats[mascarar(tel)] = { erro: String(e).slice(0, 120) };
    }
  }
  saida.chats = chats;
  return saida;
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

        let body: { telefone?: string; horas?: number; uazapi?: boolean } = {};
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

        // Formatos com e sem o 9 (o WhatsApp de alguns DDDs usa o antigo).
        const telsUazapi = new Set<string>();
        for (const a of (auts ?? []) as Array<{ telefone: string }>) {
          const d = a.telefone.replace(/\D/g, "");
          telsUazapi.add(d);
          if (d.length === 13 && d.startsWith("55") && d[4] === "9") {
            telsUazapi.add(d.slice(0, 4) + d.slice(5));
          }
        }
        const uazapi = body.uazapi === false ? null : await consultarUazapi([...telsUazapi]);

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
          uazapi,
          erros: {
            conversas: errConv?.message ?? null,
            fila: errFila?.message ?? null,
          },
        });
      },
    },
  },
});
