// Hook público chamado pelo worker externo (GitHub Action, cron, etc).
// Processa 1 chunk por chamada de forma idempotente:
//   - capa.pdf primeiro
//   - depois rua-000.pdf, rua-001.pdf...
//   - quando todas as ruas terminam, concatena tudo em 1 PDF final e finaliza
//
// Autenticação: header `x-relatorios-secret` deve bater com RELATORIOS_WORKER_SECRET.
// Body opcional: { jobId?: string }. Sem jobId, pega o próximo da fila.

import { createFileRoute } from "@tanstack/react-router";
import { processarRelatoriosJob } from "@/lib/processar-relatorios.server";

export const Route = createFileRoute("/api/public/hooks/processar-relatorios")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-relatorios-secret");
        if (!process.env.RELATORIOS_WORKER_SECRET) {
          return new Response("Worker secret não configurado.", { status: 500 });
        }
        if (secret !== process.env.RELATORIOS_WORKER_SECRET) {
          return new Response("Não autorizado.", { status: 401 });
        }

        let body: any = {};
        try { body = await request.json(); } catch {}
        const result = await processarRelatoriosJob(body.jobId);
        return Response.json(result, { status: result.error ? 500 : 200 });
      },
    },
  },
});
