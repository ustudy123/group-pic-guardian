import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

const CRITICIDADES = ["baixa", "media", "alta", "critica"] as const;
type Criticidade = (typeof CRITICIDADES)[number];

const EMOJI_CRIT: Record<Criticidade, string> = {
  baixa: "🟢",
  media: "🟡",
  alta: "🟠",
  critica: "🔴",
};

// === Envio via uazapi ===
async function enviarUazapi(numero: string, mensagem: string): Promise<boolean> {
  const baseUrl = (process.env.UAZAPI_BASE_URL || "").replace(/\/+$/, "");
  const token = process.env.UAZAPI_INSTANCE_TOKEN;
  if (!baseUrl || !token || !numero || !mensagem) return false;
  try {
    const r = await fetch(`${baseUrl}/send/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token,
      },
      body: JSON.stringify({ number: numero, text: mensagem }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error(`[uazapi-bot] send/text falhou ${r.status}: ${txt.slice(0, 300)}`);
    }
    return r.ok;
  } catch (e) {
    console.error("[uazapi-bot] erro send/text:", e);
    return false;
  }
}

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

type UazapiPayload = {
  event?: string;
  EventType?: string;
  instance?: string;
  chat?: {
    phone?: string;
    wa_chatid?: string;
    wa_isGroup?: boolean;
    name?: string;
    wa_name?: string;
  } & Record<string, unknown>;
  message?: {
    chatid?: string;
    fromMe?: boolean;
    isGroup?: boolean;
    content?: string;
    text?: string;
    message?: string;
    senderName?: string;
    pushName?: string;
  } & Record<string, unknown>;
  data?: {
    chatid?: string;
    sender?: string;
    senderName?: string;
    pushName?: string;
    isGroup?: boolean;
    fromMe?: boolean;
    wasSentByApi?: boolean;
    messageType?: string;
    text?: string;
    content?: string;
    message?: string;
  } & Record<string, unknown>;
} & Record<string, unknown>;

export const Route = createFileRoute("/api/public/hooks/uazapi-bot")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!lovableKey) return json({ error: "LOVABLE_API_KEY ausente" }, 503);

        let body: UazapiPayload;
        try {
          body = (await request.json()) as UazapiPayload;
        } catch {
          console.log("[uazapi-bot] json invalido");
          return json({ ok: true, ignored: "json_invalido" });
        }

        // Log do payload bruto p/ debug
        console.log("[uazapi-bot] payload:", JSON.stringify(body).slice(0, 2000));

        const evento = String(body.event || body.EventType || "").toLowerCase();
        if (evento && !evento.includes("message")) {
          console.log(`[uazapi-bot] ignorado evento=${evento}`);
          return json({ ok: true, ignored: `evento_${evento}` });
        }

        const d = body.data || body.message || {};
        const rootChat = body.chat || {};
        const isGroup = Boolean(d.isGroup ?? rootChat.wa_isGroup);
        const fromMe = Boolean(d.fromMe);
        const wasSentByApi = Boolean((body.data || {}).wasSentByApi);

        if (isGroup) {
          console.log("[uazapi-bot] ignorado grupo");
          return json({ ok: true, ignored: "grupo" });
        }
        if (fromMe || wasSentByApi) {
          console.log(`[uazapi-bot] ignorado saida fromMe=${fromMe} api=${wasSentByApi}`);
          return json({ ok: true, ignored: "saida" });
        }

        // Aceita qualquer messageType desde que tenha texto.
        const messageType = String(d.messageType || "").toLowerCase();

        const mensagem = String(
          d.text || d.content || d.message || (d as Record<string, unknown>).body || "",
        ).trim();
        const chatid = String(d.chatid || d.sender || rootChat.wa_chatid || "");
        const telefone = normalizarTelefone(
          chatid.split("@")[0] || String(rootChat.phone || ""),
        );
        const nome =
          (d.senderName || d.pushName || rootChat.name || rootChat.wa_name || "")
            ?.toString()
            .trim() || null;

        if (!telefone || !mensagem) {
          console.log(
            `[uazapi-bot] sem_telefone_ou_texto tel=${telefone} tipo=${messageType} keys=${Object.keys(d).join(",")}`,
          );
          return json({ ok: true, ignored: "sem_telefone_ou_texto" });
        }

        const { data: config } = await supabaseAdmin
          .from("ai_bot_config")
          .select("*")
          .eq("id", "default")
          .maybeSingle();

        if (!config || !config.ativo) {
          return json({ ok: true, ignored: "bot_inativo" });
        }

        if (config.somente_autorizados) {
          // Aceita variações com/sem código do país (ex.: 5511... vs 11...)
          const variantes = new Set<string>([telefone]);
          if (telefone.startsWith("55") && telefone.length > 11) {
            variantes.add(telefone.slice(2));
          } else if (telefone.length <= 11) {
            variantes.add(`55${telefone}`);
          }
          const { data: aut } = await supabaseAdmin
            .from("ai_bot_autorizados")
            .select("telefone, ativo")
            .in("telefone", Array.from(variantes))
            .eq("ativo", true)
            .maybeSingle();
          if (!aut) {
            console.log(
              `[uazapi-bot] nao_autorizado tel=${telefone} variantes=${Array.from(variantes).join(",")}`,
            );
            return json({ ok: true, ignored: "nao_autorizado" });
          }
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
          const errText = await aiResp.text().catch(() => "");
          console.error(`[uazapi-bot] AI gateway ${aiResp.status}: ${errText.slice(0, 300)}`);
          return json({ ok: true, error: "ai_error" });
        }

        const aiJson = (await aiResp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const resposta = aiJson.choices?.[0]?.message?.content?.trim() || "";

        await supabaseAdmin.from("ai_bot_conversas").insert([
          { telefone, nome, role: "user", conteudo: mensagem },
          { telefone, nome, role: "assistant", conteudo: resposta },
        ]);

        // Uazapi send/text espera o número limpo, sem @s.whatsapp.net
        const destino = telefone;
        if (resposta) {
          await enviarUazapi(destino, resposta);
        }

        // Alertas para o coordenador
        if (config.alertas_ativos !== false) {
          const contextoCurto = historico
            .slice(-6)
            .map((m) => `${m.role}: ${m.conteudo}`)
            .join("\n");
          const alertaInfo = await analisarAlerta(
            lovableKey,
            modelo,
            contextoCurto,
            mensagem,
            resposta,
          );

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

            const cfg = config as Record<string, unknown>;
            const coordTels = [
              cfg.coordenador_telefone,
              cfg.coordenador_telefone_2,
              cfg.coordenador_telefone_3,
              cfg.coordenador_telefone_4,
            ]
              .map((t) => normalizarTelefone(String(t || "")))
              .filter((t, i, arr) => t && arr.indexOf(t) === i);

            if (coordTels.length > 0) {
              const emoji = EMOJI_CRIT[alertaInfo.criticidade];
              const msgCoord = `${emoji} *Alerta de obra* (${alertaInfo.criticidade.toUpperCase()})\n*Categoria:* ${alertaInfo.categoria}\n*Encarregado:* ${nome || telefone}\n\n${alertaInfo.resumo}\n\n_Mensagem original:_\n"${mensagem}"`;
              const results = await Promise.all(
                coordTels.map((t) => enviarUazapi(t, msgCoord)),
              );
              if (results.some(Boolean) && alertRow?.id) {
                await supabaseAdmin
                  .from("ai_bot_alertas")
                  .update({ enviado_coordenador: true, enviado_em: new Date().toISOString() })
                  .eq("id", alertRow.id);
              }
            }
          }
        }

        return json({ ok: true, respondido: Boolean(resposta) });
      },
    },
  },
});
