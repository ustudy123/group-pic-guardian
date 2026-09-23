// Hook chamado a cada 1 minuto (via pg_cron) para enviar as respostas do bot
// que estavam aguardando o atraso humanizado (2-3 min por padrão).
// De carona, roda também o check-in programado (mensagens da manhã e da noite).
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processarMensagensProgramadas } from "@/lib/mensagens-programadas.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function enviarUazapi(numero: string, mensagem: string): Promise<boolean> {
  const baseUrl = (
    process.env.UAZAPI_MACRO_IA_BASE_URL ||
    process.env.UAZAPI_BASE_URL ||
    "https://ipazua.uazapi.com"
  ).replace(/\/+$/, "");
  const token = process.env.UAZAPI_MACRO_IA_TOKEN || process.env.UAZAPI_INSTANCE_TOKEN;
  if (!token || !numero || !mensagem) return false;
  try {
    const r = await fetch(`${baseUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: numero, text: mensagem }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error(`[respostas-pendentes] envio falhou ${r.status}: ${txt.slice(0, 200)}`);
    }
    return r.ok;
  } catch (e) {
    console.error("[respostas-pendentes] erro envio:", e);
    return false;
  }
}

/**
 * Até quando (desde o início da chamada) o check-in programado pode começar um
 * envio. O banco espera poucos segundos pela resposta; se a chamada passar
 * disso a conexão cai e o Worker pode ser cancelado no meio de um envio.
 */
const PRAZO_ENVIO_PROGRAMADAS_MS = 2000;

/**
 * Check-in programado pega carona neste job: é o agendador do banco que
 * comprovadamente chega ao servidor a cada minuto, o dia todo — as respostas do
 * bot saem por ele. O job próprio das mensagens programadas nunca entregou nada
 * (o GitHub, que roda uma vez por dia no fim da manhã, encontrava todo mundo
 * ainda sem mensagem) e só cobria 07:00–08:55, então a noite nunca saía.
 * Falha aqui não pode atrapalhar as respostas: erro vira só um campo no retorno.
 */
async function tickMensagensProgramadas(inicioMs: number): Promise<Record<string, unknown>> {
  try {
    const { body } = await processarMensagensProgramadas({
      prazoEnvioMs: inicioMs + PRAZO_ENVIO_PROGRAMADAS_MS,
    });
    return body;
  } catch (e) {
    console.error("[respostas-pendentes] erro nas mensagens programadas:", e);
    return { erro: String(e).slice(0, 200) };
  }
}

export const Route = createFileRoute("/api/public/hooks/enviar-respostas-pendentes")({
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

        const inicio = Date.now();
        const agora = new Date(inicio).toISOString();
        const sbAny = supabaseAdmin as unknown as { from: (t: string) => any };
        const { data: pendentes, error } = await sbAny
          .from("ai_bot_respostas_pendentes")
          .select("id, telefone, nome, resposta, tentativas")
          .eq("enviado", false)
          .eq("cancelado", false)
          .lte("enviar_em", agora)
          .lt("tentativas", 5)
          .order("enviar_em", { ascending: true })
          .limit(50);

        if (error) {
          return json(
            { error: error.message, programadas: await tickMensagensProgramadas(inicio) },
            500,
          );
        }
        if (!pendentes || pendentes.length === 0) {
          return json({ idle: true, programadas: await tickMensagensProgramadas(inicio) });
        }

        // Um contato recebe no máximo UMA mensagem por rodada: a mais antiga
        // pendente. As demais do mesmo telefone são canceladas — era isso que
        // fazia o robô disparar mensagens repetidas uma atrás da outra.
        type Pend = { id: string; telefone: string; nome: string | null; resposta: string; tentativas: number };
        const porTelefone = new Map<string, Pend>();
        const cancelar: string[] = [];
        for (const p of pendentes as Pend[]) {
          if (porTelefone.has(p.telefone)) cancelar.push(p.id);
          else porTelefone.set(p.telefone, p);
        }
        if (cancelar.length > 0) {
          await sbAny
            .from("ai_bot_respostas_pendentes")
            .update({ cancelado: true })
            .in("id", cancelar);
        }

        const resultados: Array<{ id: string; ok: boolean }> = [];
        for (const p of porTelefone.values()) {
          // Guarda final: se a última fala do bot para esse contato já é essa
          // mesma mensagem, não reenvia.
          const { data: ultima } = await sbAny
            .from("ai_bot_conversas")
            .select("conteudo")
            .eq("telefone", p.telefone)
            .eq("role", "assistant")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const norm = (t: string) => (t || "").trim().toLowerCase().replace(/\s+/g, " ");
          if (ultima && norm(ultima.conteudo) === norm(p.resposta)) {
            await sbAny
              .from("ai_bot_respostas_pendentes")
              .update({ cancelado: true })
              .eq("id", p.id);
            continue;
          }

          const ok = await enviarUazapi(p.telefone, p.resposta);
          if (ok) {
            await sbAny
              .from("ai_bot_respostas_pendentes")
              .update({ enviado: true, enviado_em: new Date().toISOString() })
              .eq("id", p.id);
            // Só grava no histórico agora, quando realmente foi entregue
            await supabaseAdmin.from("ai_bot_conversas").insert({
              telefone: p.telefone,
              nome: p.nome,
              role: "assistant",
              conteudo: p.resposta,
            });
          } else {
            await sbAny
              .from("ai_bot_respostas_pendentes")
              .update({ tentativas: (p.tentativas ?? 0) + 1 })
              .eq("id", p.id);
          }
          resultados.push({ id: p.id, ok });
        }


        return json({
          processados: resultados.length,
          sucesso: resultados.filter((r) => r.ok).length,
          programadas: await tickMensagensProgramadas(inicio),
        });
      },
    },
  },
});
