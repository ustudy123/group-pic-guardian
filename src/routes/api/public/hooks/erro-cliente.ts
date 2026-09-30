// Recebe erros do navegador (ver src/lib/erro-cliente.ts) e guarda cada um
// como um JSON no storage (fotos-obras/diagnostico/erros-cliente/AAAA-MM-DD/),
// sem precisar de tabela nova. O diagnóstico do bot lê esses arquivos.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ERROS_CLIENTE_PASTA } from "@/lib/erro-cliente";

export const Route = createFileRoute("/api/public/hooks/erro-cliente")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const texto = await request.text().catch(() => "");
        // Tamanho máximo pequeno: é só para diagnóstico e o endpoint é público.
        if (!texto || texto.length > 8000) return new Response(null, { status: 204 });
        let corpo: Record<string, unknown>;
        try {
          corpo = JSON.parse(texto) as Record<string, unknown>;
        } catch {
          return new Response(null, { status: 204 });
        }
        const agora = new Date();
        const dia = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        const registro = {
          ...corpo,
          recebido_em: agora.toISOString(),
          pais: request.headers.get("cf-ipcountry") ?? null,
        };
        const caminho = `${ERROS_CLIENTE_PASTA}/${dia}/${agora.getTime()}-${Math.random().toString(36).slice(2, 8)}.json`;
        const { error } = await supabaseAdmin.storage
          .from("fotos-obras")
          .upload(caminho, JSON.stringify(registro), { contentType: "application/json" });
        if (error) {
          console.error("[erro-cliente] falha ao gravar:", error.message);
          return new Response(JSON.stringify({ ok: false, erro: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
