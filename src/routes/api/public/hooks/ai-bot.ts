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
  let t = (tel || "").replace(/\D/g, "");
  // Garante código do país BR (55) quando vier só DDD + número (10-11 dígitos)
  if (t.length >= 10 && t.length <= 11 && !t.startsWith("55")) {
    t = "55" + t;
  }
  return t;
}

const CRITICIDADES = ["baixa", "media", "alta", "critica"] as const;
type Criticidade = (typeof CRITICIDADES)[number];

async function analisarAlerta(
  lovableKey: string,
  modelo: string,
  contexto: string,
  mensagem: string,
  resposta: string,
): Promise<{
  alerta: boolean;
  categoria: string;
  criticidade: Criticidade;
  resumo: string;
} | null> {
  const sys = `Você é um analista de obras da Macroambiental. Analise a conversa abaixo entre um encarregado de obra e o assistente, e decida se há um PROBLEMA RELEVANTE que o coordenador precisa saber.

Categorias possíveis: "material" (falta/atraso de material), "equipe" (faltas, conflito, falta de pessoal), "seguranca" (EPI, acidente, risco), "prazo" (atraso, impedimento), "equipamento" (quebra, falta), "cliente" (reclamação do morador/cliente), "outros".

Criticidade:
- "critica": acidente, risco iminente de segurança, parada total da obra
- "alta": problema que para a frente de serviço ou compromete prazo
- "media": problema que precisa de atenção mas não para a obra
- "baixa": observação leve, dúvida operacional
- Se NÃO há problema relevante (saudação, conversa fiada, dúvida resolvida), responda alerta=false.

Responda APENAS com JSON válido no formato:
{"alerta": boolean, "categoria": string, "criticidade": "baixa"|"media"|"alta"|"critica", "resumo": "frase curta para o coordenador"}`;

  const user = `Contexto recente:\n${contexto || "(início)"}\n\nMensagem do encarregado:\n${mensagem}\n\nResposta dada pelo assistente:\n${resposta}`;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = j.choices?.[0]?.message?.content?.trim() || "";
    const parsed = JSON.parse(raw);
    if (!parsed?.alerta) return { alerta: false, categoria: "", criticidade: "baixa", resumo: "" };
    const criticidade: Criticidade = CRITICIDADES.includes(parsed.criticidade)
      ? parsed.criticidade
      : "media";
    return {
      alerta: true,
      categoria: String(parsed.categoria || "outros").slice(0, 40),
      criticidade,
      resumo: String(parsed.resumo || "").slice(0, 500),
    };
  } catch {
    return null;
  }
}

async function enviarWhatsapp(telefone: string, mensagem: string): Promise<boolean> {
  const baseUrl = (process.env.UAZAPI_MACRO_IA_BASE_URL || process.env.UAZAPI_BASE_URL || "https://ipazua.uazapi.com").replace(/\/+$/, "");
  const token = process.env.UAZAPI_MACRO_IA_TOKEN || process.env.UAZAPI_INSTANCE_TOKEN;
  if (!token || !telefone || !mensagem) return false;
  try {
    const r = await fetch(`${baseUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: telefone, text: mensagem }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error(`[ai-bot] alerta uazapi falhou ${r.status}: ${txt.slice(0, 300)}`);
    }
    return r.ok;
  } catch (e) {
    console.error("[ai-bot] erro envio alerta uazapi:", e);
    return false;
  }
}

const EMOJI_CRIT: Record<Criticidade, string> = {
  baixa: "🟢",
  media: "🟡",
  alta: "🟠",
  critica: "🔴",
};

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

        const { data: config } = await supabaseAdmin
          .from("ai_bot_config")
          .select("*")
          .eq("id", "default")
          .maybeSingle();

        if (!config || !config.ativo) {
          return json({ resposta: null, motivo: "bot_inativo" });
        }

        if (config.somente_autorizados) {
          const { data: aut } = await supabaseAdmin
            .from("ai_bot_autorizados")
            .select("telefone, ativo, nome")
            .eq("telefone", telefone)
            .eq("ativo", true)
            .maybeSingle();
          if (!aut) return json({ resposta: null, motivo: "nao_autorizado" });
        }

        const [{ data: kb }, { data: exemplos }] = await Promise.all([
          supabaseAdmin.from("ai_bot_kb").select("titulo,conteudo").eq("ativo", true).order("ordem"),
          supabaseAdmin
            .from("ai_bot_exemplos")
            .select("pergunta,resposta")
            .eq("ativo", true)
            .order("ordem"),
        ]);

        const { data: hist } = await supabaseAdmin
          .from("ai_bot_conversas")
          .select("role,conteudo")
          .eq("telefone", telefone)
          .order("created_at", { ascending: false })
          .limit(config.max_historico ?? 20);

        const historico = (hist ?? []).reverse();

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

        const modelo = config.modelo || "google/gemini-2.5-flash";

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableKey}`,
          },
          body: JSON.stringify({
            model: modelo,
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

        await supabaseAdmin.from("ai_bot_conversas").insert([
          { telefone, nome, role: "user", conteudo: mensagem },
          { telefone, nome, role: "assistant", conteudo: resposta },
        ]);

        // Análise de alerta
        let alertaInfo: Awaited<ReturnType<typeof analisarAlerta>> = null;
        if (config.alertas_ativos !== false) {
          const contextoCurto = historico
            .slice(-6)
            .map((m) => `${m.role}: ${m.conteudo}`)
            .join("\n");
          alertaInfo = await analisarAlerta(lovableKey, modelo, contextoCurto, mensagem, resposta);

          if (alertaInfo?.alerta) {
            const { data: alertRow } = await supabaseAdmin
              .from("ai_bot_alertas")
              .insert({
                telefone,
                nome,
                categoria: alertaInfo.categoria,
                criticidade: alertaInfo.criticidade,
                resumo: alertaInfo.resumo,
                mensagem_origem: mensagem,
              })
              .select("id")
              .single();

            const coordTels = [
              config.coordenador_telefone,
              (config as any).coordenador_telefone_2,
              (config as any).coordenador_telefone_3,
              (config as any).coordenador_telefone_4,
            ]
              .map((t) => normalizarTelefone(t || ""))
              .filter((t) => t.length > 0);

            if (coordTels.length > 0) {
              const emoji = EMOJI_CRIT[alertaInfo.criticidade];
              const msgCoord = `${emoji} *Alerta de obra* (${alertaInfo.criticidade.toUpperCase()})\n*Categoria:* ${alertaInfo.categoria}\n*Encarregado:* ${nome || telefone}\n\n${alertaInfo.resumo}`;
              let algumOk = false;
              for (const tel of coordTels) {
                const ok = await enviarWhatsapp(tel, msgCoord);
                if (ok) algumOk = true;
              }
              if (algumOk && alertRow?.id) {
                await supabaseAdmin
                  .from("ai_bot_alertas")
                  .update({ enviado_coordenador: true, enviado_em: new Date().toISOString() })
                  .eq("id", alertRow.id);
              }
            }
          }
        }

        return json({ resposta, alerta: alertaInfo?.alerta ? alertaInfo : null });
      },
    },
  },
});
