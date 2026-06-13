import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const EMOJI_CRIT: Record<string, string> = {
  baixa: "🟢",
  media: "🟡",
  alta: "🟠",
  critica: "🔴",
};

async function enviarUazapi(telefone: string, mensagem: string): Promise<{ ok: boolean; status: number; detail: string }> {
  const baseUrl = (process.env.UAZAPI_BASE_URL || "https://api.uazapi.com").replace(/\/+$/, "");
  const token = process.env.UAZAPI_INSTANCE_TOKEN;
  if (!token) return { ok: false, status: 0, detail: "sem token" };
  try {
    const r = await fetch(`${baseUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: telefone, text: mensagem }),
    });
    const txt = await r.text().catch(() => "");
    return { ok: r.ok, status: r.status, detail: txt.slice(0, 300) };
  } catch (e) {
    return { ok: false, status: 0, detail: String(e).slice(0, 300) };
  }
}

export const Route = createFileRoute("/api/public/hooks/reenviar-alertas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.AI_BOT_WEBHOOK_SECRET;
        const provided = request.headers.get("x-bot-secret");
        if (!expected || provided !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        const { data: config } = await supabaseAdmin
          .from("ai_bot_config")
          .select("coordenador_telefone")
          .eq("id", "default")
          .maybeSingle();

        const coord = (config?.coordenador_telefone || "").replace(/\D/g, "");
        if (!coord) {
          return new Response(JSON.stringify({ error: "coordenador nao configurado" }), { status: 400 });
        }

        const { data: pendentes } = await supabaseAdmin
          .from("ai_bot_alertas")
          .select("id, nome, telefone, categoria, criticidade, resumo, mensagem_origem")
          .eq("enviado_coordenador", false)
          .order("created_at", { ascending: true });

        const resultados: Array<{ id: string; ok: boolean }> = [];
        for (const a of pendentes ?? []) {
          const emoji = EMOJI_CRIT[a.criticidade] || "⚠️";
          const msg = `${emoji} *Alerta de obra* (${String(a.criticidade).toUpperCase()})\n*Categoria:* ${a.categoria}\n*Encarregado:* ${a.nome || a.telefone}\n\n${a.resumo}\n\n_Mensagem original:_\n"${a.mensagem_origem}"`;
          const ok = await enviarUazapi(coord, msg);
          if (ok) {
            await supabaseAdmin
              .from("ai_bot_alertas")
              .update({ enviado_coordenador: true, enviado_em: new Date().toISOString() })
              .eq("id", a.id);
          }
          resultados.push({ id: a.id, ok });
          await new Promise((r) => setTimeout(r, 800));
        }

        return new Response(
          JSON.stringify({ total: resultados.length, enviados: resultados.filter((r) => r.ok).length, resultados }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
