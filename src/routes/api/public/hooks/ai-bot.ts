import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

function normalizarTelefone(tel: string): string {
  return (tel || "").replace(/\D/g, "");
}

export const Route = createFileRoute("/api/public/hooks/ai-bot")({
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
        if (provided !== expected) {
          return json({ error: "Unauthorized" }, 401);
        }

        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!lovableKey) return json({ error: "LOVABLE_API_KEY ausente" }, 503);

        let body: { telefone?: string; mensagem?: string; nome?: string };
        try {
          body = await request.json();
        } catch {
          return json({ error: "JSON inválido" }, 400);
        }

        const telefone = normalizarTelefone(body.telefone || "");
        const mensagem = (body.mensagem || "").trim();
        const nome = body.nome?.trim() || null;
        if (!telefone || !mensagem) {
          return json({ error: "Campos obrigatórios: telefone, mensagem" }, 400);
        }

        // Config
        const { data: config } = await supabaseAdmin
          .from("ai_bot_config")
          .select("*")
          .eq("id", "default")
          .maybeSingle();

        if (!config || !config.ativo) {
          return json({ resposta: null, motivo: "bot_inativo" });
        }

        // Autorização
        if (config.somente_autorizados) {
          const { data: aut } = await supabaseAdmin
            .from("ai_bot_autorizados")
            .select("telefone, ativo")
            .eq("telefone", telefone)
            .eq("ativo", true)
            .maybeSingle();
          if (!aut) return json({ resposta: null, motivo: "nao_autorizado" });
        }

        // KB + Exemplos
        const [{ data: kb }, { data: exemplos }] = await Promise.all([
          supabaseAdmin.from("ai_bot_kb").select("titulo,conteudo").eq("ativo", true).order("ordem"),
          supabaseAdmin
            .from("ai_bot_exemplos")
            .select("pergunta,resposta")
            .eq("ativo", true)
            .order("ordem"),
        ]);

        // Histórico
        const { data: hist } = await supabaseAdmin
          .from("ai_bot_conversas")
          .select("role,conteudo")
          .eq("telefone", telefone)
          .order("created_at", { ascending: false })
          .limit(config.max_historico ?? 20);

        const historico = (hist ?? []).reverse();

        // Monta system prompt
        const kbBlock =
          (kb ?? []).length > 0
            ? "\n\n## Base de conhecimento\n" +
              (kb ?? []).map((k) => `### ${k.titulo}\n${k.conteudo}`).join("\n\n")
            : "";

        const systemPrompt = `${config.persona || "Você é um assistente útil."}${kbBlock}\n\nResponda de forma clara, curta e direta. Se não souber, diga que vai verificar com a equipe.`;

        const messages: Array<{ role: string; content: string }> = [
          { role: "system", content: systemPrompt },
        ];
        for (const ex of exemplos ?? []) {
          messages.push({ role: "user", content: ex.pergunta });
          messages.push({ role: "assistant", content: ex.resposta });
        }
        for (const m of historico) {
          messages.push({ role: m.role, content: m.conteudo });
        }
        messages.push({ role: "user", content: mensagem });

        // Chama Lovable AI Gateway
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableKey}`,
          },
          body: JSON.stringify({
            model: config.modelo || "google/gemini-2.5-flash",
            messages,
            temperature: Number(config.temperatura ?? 0.7),
          }),
        });

        if (!aiResp.ok) {
          const errText = await aiResp.text();
          if (aiResp.status === 429) return json({ error: "rate_limit" }, 429);
          if (aiResp.status === 402) return json({ error: "sem_creditos" }, 402);
          return json({ error: "ai_error", detail: errText.slice(0, 500) }, 502);
        }

        const aiJson = (await aiResp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const resposta = aiJson.choices?.[0]?.message?.content?.trim() || "";

        // Persiste user + assistant
        await supabaseAdmin.from("ai_bot_conversas").insert([
          { telefone, nome, role: "user", conteudo: mensagem },
          { telefone, nome, role: "assistant", conteudo: resposta },
        ]);

        return json({ resposta });
      },
    },
  },
});
