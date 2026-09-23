// Endpoint das mensagens programadas (check-in proativo dos encarregados).
//
// O envio automático do dia a dia NÃO depende mais deste endpoint: ele roda a
// cada minuto dentro do job de respostas pendentes (ver
// src/lib/mensagens-programadas.server.ts). Este endpoint continua servindo
// para o GitHub Actions (rede de segurança), disparo manual e diagnóstico.
//
// Autenticação: header `X-Bot-Secret` = AI_BOT_WEBHOOK_SECRET (mesmo do ai-bot).
// Body opcional: { periodo?: "manha"|"noite", batch?: number, dryRun?: boolean,
//                  diagnostico?: boolean, testNumero?: string }
//   - periodo: força um período (útil para teste fora da janela)
//   - batch: quantos envios por chamada (padrão 2)
//   - dryRun: não envia nem grava, só mostra quem seria contatado
//   - diagnostico: explica quem recebe hoje e por quê, sem enviar
//   - testNumero: manda 1 mensagem de teste direto para o número

import { createFileRoute } from "@tanstack/react-router";
import {
  enviarUazapi,
  processarMensagensProgramadas,
  type Periodo,
} from "@/lib/mensagens-programadas.server";

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

        let body: {
          periodo?: Periodo;
          batch?: number;
          dryRun?: boolean;
          testNumero?: string;
          diagnostico?: boolean;
        } = {};
        try {
          body = await request.json();
        } catch {
          /* body vazio é ok */
        }

        // --- DIAGNÓSTICO: envia 1 mensagem de teste direto para um número e
        // devolve a resposta crua do uazapi (sem tabela, sem checar autorizados).
        // Use: { "testNumero": "5544999596898" }
        if (body.testNumero) {
          const numero = String(body.testNumero).replace(/\D/g, "");
          const envio = await enviarUazapi(
            numero,
            "🔧 Teste de entrega do bot. Se você recebeu esta mensagem, este número está OK para receber alertas.",
          );
          return json({
            test: true,
            numero,
            ok: envio.ok,
            status: envio.status,
            detalhe: envio.detail,
          });
        }

        const { status, body: resultado } = await processarMensagensProgramadas({
          periodo: body.periodo,
          batch: body.batch,
          dryRun: body.dryRun,
          diagnostico: body.diagnostico,
        });
        return json(resultado, status);
      },
    },
  },
});
