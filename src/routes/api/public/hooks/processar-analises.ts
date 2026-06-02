// Hook público — chamado pelo cron do GitHub Actions a cada 1 min.
// Auth: header x-visao-secret = VISAO_WORKER_SECRET.
import { createFileRoute } from "@tanstack/react-router";
import { processarFila } from "@/lib/visao-analyzer.server";

export const Route = createFileRoute("/api/public/hooks/processar-analises")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.VISAO_WORKER_SECRET;
        if (!expected) {
          return new Response("VISAO_WORKER_SECRET não configurado.", { status: 503 });
        }
        const provided = request.headers.get("x-visao-secret");
        if (provided !== expected) {
          return new Response("Não autorizado.", { status: 401 });
        }

        let max = 5;
        try {
          const body = (await request.json()) as { max?: number };
          if (typeof body?.max === "number" && body.max > 0 && body.max <= 20) {
            max = body.max;
          }
        } catch {
          // body opcional
        }

        const r = await processarFila(max);
        return Response.json({ ...r, idle: r.processados === 0 });
      },
    },
  },
});
