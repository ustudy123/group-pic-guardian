// Recuperação automática de fotos de grupo que chegaram pelo webhook mas não
// foram salvas (falha ao baixar/subir). Chamado pelo cron do GitHub Actions
// (recuperar-fotos.yml).
//
// Antes rodava dentro de processar-analises, cujo cron nunca funcionou (o
// secret VISAO_WORKER_SECRET não existe no repositório) — por isso ganhou
// endpoint próprio, com o mesmo secret dos outros crons.
//
// Autenticação: header `X-Bot-Secret` = AI_BOT_WEBHOOK_SECRET.
// Body opcional: { limite?: number } (1–10 fotos por chamada; padrão 5)

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recuperarFotosFalhas } from "@/lib/recuperar-fotos.server";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/public/hooks/recuperar-fotos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.AI_BOT_WEBHOOK_SECRET;
        if (!expected) {
          return json({ error: "AI_BOT_WEBHOOK_SECRET não configurado no servidor." }, 503);
        }
        const provided =
          request.headers.get("x-bot-secret") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (provided !== expected) return json({ error: "Unauthorized" }, 401);

        let limite = 5;
        try {
          const body = (await request.json()) as { limite?: number };
          if (typeof body?.limite === "number" && body.limite >= 1 && body.limite <= 10) {
            limite = Math.floor(body.limite);
          }
        } catch {
          /* body vazio é ok */
        }

        try {
          const r = await recuperarFotosFalhas(
            supabaseAdmin as unknown as { from: (t: string) => any },
            new URL(request.url).origin,
            limite,
          );
          return json({ ok: true, ...r });
        } catch (e) {
          console.error("[recuperar-fotos] falhou:", e);
          return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
        }
      },
    },
  },
});
