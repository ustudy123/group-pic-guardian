import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PayloadSchema = z.object({
  connection_status: z.enum(["idle", "starting", "qr_ready", "connected", "disconnected", "error"]),
  qr_text: z.string().max(4096).nullable().optional(),
  last_error: z.string().max(2000).nullable().optional(),
  phone_jid: z.string().max(255).nullable().optional(),
  last_event_at: z.string().datetime().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/whatsapp/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.WHATSAPP_BOT_SECRET;
        if (!expected) {
          return new Response("Server not configured", { status: 500 });
        }

        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
          console.error("WhatsApp status misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
          return new Response("Server not configured: missing Supabase admin access", { status: 500 });
        }

        const provided = request.headers.get("x-bot-secret") ?? "";
        if (!provided || !safeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: z.infer<typeof PayloadSchema>;
        try {
          payload = PayloadSchema.parse(await request.json());
        } catch {
          return new Response("Invalid JSON payload", { status: 400 });
        }

        const { error } = await supabaseAdmin.from("whatsapp_bot_status").upsert(
          {
            id: "main",
            connection_status: payload.connection_status,
            qr_text: payload.qr_text ?? null,
            last_error: payload.last_error ?? null,
            phone_jid: payload.phone_jid ?? null,
            meta: payload.meta ?? {},
            last_event_at: payload.last_event_at ?? new Date().toISOString(),
          },
          { onConflict: "id" }
        );

        if (error) {
          console.error("Erro salvando status do bot:", error);
          return new Response("Erro salvando status do bot", { status: 500 });
        }

        return Response.json({ ok: true });
      },
    },
  },
});