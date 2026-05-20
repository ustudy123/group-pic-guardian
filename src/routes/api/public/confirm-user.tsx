import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/confirm-user")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { id } = await request.json();
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
          id,
          { email_confirm: true }
        );
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ success: true, user: data.user }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }
  }
});

