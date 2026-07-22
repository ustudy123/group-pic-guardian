// Hook chamado 1x por dia (via pg_cron) para consolidar os alertas do dia e
// enviar UM único resumo aos coordenadores, em vez de várias mensagens soltas.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization, X-Bot-Secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function normalizarTelefone(tel: string): string {
  let t = (tel || "").replace(/\D/g, "");
  if (t.length >= 10 && t.length <= 11 && !t.startsWith("55")) t = "55" + t;
  return t;
}

async function enviarUazapi(numero: string, mensagem: string): Promise<boolean> {
  const baseUrl = (
    process.env.UAZAPI_MACRO_IA_BASE_URL ||
    process.env.UAZAPI_BASE_URL ||
    "https://ipazua.uazapi.com"
  ).replace(/\/+$/, "");
  const token = process.env.UAZAPI_MACRO_IA_TOKEN || process.env.UAZAPI_INSTANCE_TOKEN;
  if (!token || !numero || !mensagem) return false;
  const r = await fetch(`${baseUrl}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({ number: numero, text: mensagem }),
  });
  return r.ok;
}

/** Data de hoje em America/Sao_Paulo, formato YYYY-MM-DD. */
/** Formata um horário em HH:MM no fuso America/Sao_Paulo (para o cabeçalho). */
function hhmmBRT(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Data de hoje (YYYY-MM-DD) no fuso America/Sao_Paulo. */
function dataHojeBRT(): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

const EMOJI_CRIT: Record<string, string> = {
  baixa: "🟢",
  media: "🟡",
  alta: "🟠",
  critica: "🔴",
};

const ORDEM_CRIT: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };

type AlertaRow = { categoria: string; criticidade: string; resumo: string };
type ItemConsolidado = { criticidade: string; texto: string };

/**
 * Consolida os alertas de UM encarregado num conjunto curto de problemas distintos,
 * sem repetição (o bot gera um alerta por mensagem, então o mesmo assunto vira
 * vários alertas quase iguais). Usa a IA; devolve null se falhar (aí cai no fallback).
 */
async function consolidarAlertas(
  openaiKey: string,
  nome: string,
  alertas: AlertaRow[],
): Promise<ItemConsolidado[] | null> {
  try {
    const lista = alertas
      .map((a, i) => `${i + 1}. [${a.categoria}/${a.criticidade}] ${a.resumo}`)
      .join("\n");
    const sys =
      "Você consolida alertas de obra de um mesmo encarregado para um resumo diário ao coordenador. " +
      "Junte os alertas que tratam do MESMO assunto em um único item, sem repetir a mesma informação. " +
      "Cada item deve ser uma frase curta, clara e objetiva. Use a maior criticidade entre os alertas do grupo. " +
      "Não invente nada além do que está nos alertas. " +
      'Responda SOMENTE JSON no formato: {"itens":[{"criticidade":"baixa|media|alta|critica","texto":"..."}]}';
    const user = `Encarregado: ${nome}\nAlertas do dia:\n${lista}`;
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(txt);
    const arr = Array.isArray(parsed)
      ? parsed
      : parsed.itens || parsed.alertas || parsed.problemas || Object.values(parsed).find(Array.isArray);
    if (!Array.isArray(arr)) return null;
    const itens = arr
      .map((x: any) => ({
        criticidade: String(x?.criticidade || "media"),
        texto: String(x?.texto || "").trim(),
      }))
      .filter((x: ItemConsolidado) => x.texto);
    return itens.length ? itens : null;
  } catch {
    return null;
  }
}

/** Fallback sem IA: 1 alerta por categoria, mantendo a maior criticidade. */
function dedupePorCategoria(alertas: AlertaRow[]): AlertaRow[] {
  const porCat = new Map<string, AlertaRow>();
  for (const a of alertas) {
    const ex = porCat.get(a.categoria);
    if (!ex || (ORDEM_CRIT[a.criticidade] ?? 9) < (ORDEM_CRIT[ex.criticidade] ?? 9)) {
      porCat.set(a.categoria, a);
    }
  }
  return [...porCat.values()];
}

export const Route = createFileRoute("/api/public/hooks/resumo-alertas-diario")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const expectedKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided =
          request.headers.get("apikey") ||
          request.headers.get("x-bot-secret") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
          "";
        if (
          provided !== expectedKey &&
          provided !== process.env.AI_BOT_WEBHOOK_SECRET
        ) {
          return json({ error: "Unauthorized" }, 401);
        }

        let body: { forcar?: boolean; horas?: number; janela_ini?: string; janela_fim?: string } = {};
        try {
          body = await request.json();
        } catch { /* vazio ok */ }

        const { data: config } = await supabaseAdmin
          .from("ai_bot_config")
          .select("ativo, alertas_ativos, resumo_alertas_diario, coordenador_telefone, coordenador_telefone_2, coordenador_telefone_3, coordenador_telefone_4")
          .eq("id", "default")
          .maybeSingle();
        if (!config?.ativo || config.alertas_ativos === false) {
          return json({ idle: true, motivo: "bot_ou_alertas_desativados" });
        }
        if (config.resumo_alertas_diario === false && !body.forcar) {
          return json({ idle: true, motivo: "resumo_desativado" });
        }

        // Dois modos:
        // 1) Janela FIXA por horário BRT (janela_ini/janela_fim, "HH:MM") no dia de hoje.
        //    Usado pelo resumo das 08:30, que cobre só a manhã (ex.: 07:00–08:00).
        // 2) Janela DESLIZANTE das últimas N horas (padrão 2). Usado pelo ciclo de 2 em 2h.
        // O cron de 2h não se sobrepõe entre execuções; a janela fixa da manhã termina
        // antes da 1ª janela cheia do ciclo (07:15–09:15), então não há duplicação.
        const hhmmParaUtc = (hhmm: string): Date | null => {
          const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
          if (!m) return null;
          const hoje = dataHojeBRT(); // YYYY-MM-DD em BRT
          // BRT = UTC-3 (sem horário de verão no Brasil desde 2019)
          const hUtc = Number(m[1]) + 3;
          return new Date(`${hoje}T${String(hUtc).padStart(2, "0")}:${m[2]}:00Z`);
        };

        let inicio: Date;
        let fim: Date;
        let rotulo: string;
        if (body.janela_ini && body.janela_fim) {
          const ini = hhmmParaUtc(body.janela_ini);
          const f = hhmmParaUtc(body.janela_fim);
          if (!ini || !f) return json({ error: "janela invalida (use HH:MM)" }, 400);
          inicio = ini;
          fim = f;
          rotulo = `Alertas da manhã (${body.janela_ini}–${body.janela_fim})`;
        } else {
          const horas = Number(body.horas) > 0 ? Number(body.horas) : 2;
          fim = new Date();
          inicio = new Date(fim.getTime() - horas * 60 * 60 * 1000);
          rotulo = `Alertas das últimas ${horas}h (${hhmmBRT(inicio)}–${hhmmBRT(fim)})`;
        }
        const inicioUtc = inicio.toISOString();
        const fimUtc = fim.toISOString();

        const { data: alertas } = await supabaseAdmin
          .from("ai_bot_alertas")
          .select("nome, telefone, categoria, criticidade, resumo, created_at")
          .gte("created_at", inicioUtc)
          .lt("created_at", fimUtc)
          .order("created_at", { ascending: true });

        if (!alertas || alertas.length === 0) {
          return json({ idle: true, motivo: "sem_alertas", inicio: inicioUtc, fim: fimUtc });
        }

        // Agrupa por encarregado (nome + telefone)
        const porEncarregado = new Map<string, typeof alertas>();
        for (const a of alertas) {
          const chave = `${a.nome || ""}|${a.telefone}`;
          const arr = porEncarregado.get(chave) ?? [];
          arr.push(a);
          porEncarregado.set(chave, arr);
        }

        const linhas: string[] = [];
        linhas.push(`📋 *${rotulo}*`);
        linhas.push(`*${porEncarregado.size}* encarregado(s) com ocorrências.`);
        linhas.push("");

        const openaiKey = process.env.OPENAI_API_KEY;

        for (const [chave, lista] of porEncarregado) {
          const [nome, tel] = chave.split("|");
          linhas.push(`👷 *${nome || tel}*`);
          linhas.push("");

          const alertasEnc: AlertaRow[] = lista.map((a) => ({
            categoria: a.categoria,
            criticidade: a.criticidade,
            resumo: a.resumo,
          }));

          // Consolida com IA (quando há mais de 1 alerta); senão, dedupe por categoria.
          let itens: { emoji: string; texto: string }[] | null = null;
          if (openaiKey && alertasEnc.length > 1) {
            const cons = await consolidarAlertas(openaiKey, nome || tel, alertasEnc);
            if (cons) {
              itens = cons.map((c) => ({ emoji: EMOJI_CRIT[c.criticidade] || "⚪", texto: c.texto }));
            }
          }
          if (!itens) {
            itens = dedupePorCategoria(alertasEnc)
              .sort((a, b) => (ORDEM_CRIT[a.criticidade] ?? 9) - (ORDEM_CRIT[b.criticidade] ?? 9))
              .map((a) => ({ emoji: EMOJI_CRIT[a.criticidade] || "⚪", texto: a.resumo }));
          }

          itens.forEach((it, idx) => {
            linhas.push(`  ${it.emoji} ${it.texto}`);
            if (idx < itens!.length - 1) linhas.push(""); // espaço entre um alerta e outro
          });
          linhas.push("");
        }

        const msg = linhas.join("\n").trim();
        const coordTels = [
          config.coordenador_telefone,
          config.coordenador_telefone_2,
          config.coordenador_telefone_3,
          config.coordenador_telefone_4,
        ]
          .map((t) => normalizarTelefone(String(t || "")))
          .filter((t, i, arr) => t && arr.indexOf(t) === i);

        if (coordTels.length === 0) {
          return json({ error: "sem_coordenadores" }, 400);
        }

        let ok = 0;
        for (const tel of coordTels) {
          try {
            if (await enviarUazapi(tel, msg)) ok++;
          } catch (e) {
            console.error("[resumo-alertas] erro:", e);
          }
        }

        if (ok > 0) {
          await supabaseAdmin
            .from("ai_bot_alertas")
            .update({ enviado_coordenador: true, enviado_em: new Date().toISOString() })
            .gte("created_at", inicioUtc)
            .lt("created_at", fimUtc)
            .eq("enviado_coordenador", false);
        }

        return json({
          janela: { inicio: inicioUtc, fim: fimUtc },
          total: alertas.length,
          coordenadores: coordTels.length,
          sucesso: ok,
        });
      },
    },
  },
});
