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
function hojeBRT(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const EMOJI_CRIT: Record<string, string> = {
  baixa: "🟢",
  media: "🟡",
  alta: "🟠",
  critica: "🔴",
};

const ORDEM_CRIT: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };

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

        let body: { forcar?: boolean; dataRef?: string } = {};
        try {
          body = await request.json();
        } catch { /* vazio ok */ }

        const dataRef = body.dataRef || hojeBRT();

        const { data: config } = await supabaseAdmin
          .from("ai_bot_config")
          .select("ativo, alertas_ativos, coordenador_telefone, coordenador_telefone_2, coordenador_telefone_3, coordenador_telefone_4")
          .eq("id", "default")
          .maybeSingle();
        if (!config?.ativo || config.alertas_ativos === false) {
          return json({ idle: true, motivo: "bot_ou_alertas_desativados" });
        }

        if (!body.forcar) {
          const { data: ja } = await supabaseAdmin
            .from("ai_bot_resumos_diarios")
            .select("data_ref")
            .eq("data_ref", dataRef)
            .maybeSingle();
          if (ja) return json({ idle: true, motivo: "ja_enviado", dataRef });
        }

        // Alertas do dia (em BRT: das 03:00 UTC de hoje até agora)
        const inicioUtc = new Date(`${dataRef}T03:00:00Z`).toISOString();
        const { data: alertas } = await supabaseAdmin
          .from("ai_bot_alertas")
          .select("nome, telefone, categoria, criticidade, resumo, created_at")
          .gte("created_at", inicioUtc)
          .order("created_at", { ascending: true });

        if (!alertas || alertas.length === 0) {
          await supabaseAdmin
            .from("ai_bot_resumos_diarios")
            .upsert({ data_ref: dataRef, total_alertas: 0 });
          return json({ idle: true, motivo: "sem_alertas", dataRef });
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
        linhas.push(`📋 *Resumo diário de alertas — ${dataRef.split("-").reverse().join("/")}*`);
        linhas.push(`Total: *${alertas.length}* alerta(s) de *${porEncarregado.size}* encarregado(s).`);
        linhas.push("");

        for (const [chave, lista] of porEncarregado) {
          const [nome, tel] = chave.split("|");
          linhas.push(`👷 *${nome || tel}*`);
          const ordenada = [...lista].sort(
            (a, b) => (ORDEM_CRIT[a.criticidade] ?? 9) - (ORDEM_CRIT[b.criticidade] ?? 9),
          );
          for (const a of ordenada) {
            const emoji = EMOJI_CRIT[a.criticidade] || "⚪";
            linhas.push(`  ${emoji} [${a.categoria}] ${a.resumo}`);
          }
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
            .from("ai_bot_resumos_diarios")
            .upsert({ data_ref: dataRef, total_alertas: alertas.length });
          await supabaseAdmin
            .from("ai_bot_alertas")
            .update({ enviado_coordenador: true, enviado_em: new Date().toISOString() })
            .gte("created_at", inicioUtc)
            .eq("enviado_coordenador", false);
        }

        return json({ dataRef, total: alertas.length, coordenadores: coordTels.length, sucesso: ok });
      },
    },
  },
});
