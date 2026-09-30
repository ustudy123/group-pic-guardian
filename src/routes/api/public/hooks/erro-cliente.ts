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
        await supabaseAdmin.storage
          .from("fotos-obras")
          .upload(caminho, new Blob([JSON.stringify(registro)], { type: "application/json" }), {
            contentType: "application/json",
          })
          .catch(() => null);
        return new Response(null, { status: 204 });
      },
    },
  },
});
