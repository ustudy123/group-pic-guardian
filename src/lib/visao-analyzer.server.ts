// Worker server-only: analisa 1 foto via Lovable AI Gateway (Gemini 2.5 Pro multimodal)
// e devolve um JSON estruturado de conformidade visual.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MODELO_PADRAO = "google/gemini-2.5-pro";

export const ETAPAS = [
  "nota_servico",
  "localizacao",
  "dds",
  "sinalizacao",
  "banheiro_longe",
  "banheiro_dentro",
  "mapa_rede",
  "escavacao_vala",
  "assentamento_tubo",
  "compactacao_1a",
  "compactacao_2a",
  "compactacao_3a",
  "vala_25cm_base",
  "espalhamento_base",
  "compactacao_base",
  "construcao_pv",
  "acabamento_pv",
  "vala_finalizada",
  "limpeza",
  "passagem_segura",
  "checklist_compactador",
  "checklist_moto_bomba",
  "drenagem_boca_lobo",
  "outros",
] as const;

// Etapas que entram no Relatório Fotográfico de Obra (RFO)
export const ETAPAS_RFO = new Set<string>([
  "dds",
  "sinalizacao",
  "escavacao_vala",
  "assentamento_tubo",
  "compactacao_1a",
  "compactacao_2a",
  "compactacao_3a",
  "vala_25cm_base",
  "espalhamento_base",
  "compactacao_base",
  "construcao_pv",
  "acabamento_pv",
  "vala_finalizada",
  "limpeza",
]);

export const CONFORMIDADES = [
  "conforme",
  "atencao",
  "nao_conforme",
  "critico",
  "inconclusivo",
] as const;

export type AnaliseResultado = {
  etapa: (typeof ETAPAS)[number];
  etapa_confianca: number;
  conformidade_geral: (typeof CONFORMIDADES)[number];
  epi_detectado: {
    pessoas_visiveis: number;
    pessoas: Array<{
      indice: number;
      capacete: "presente" | "ausente" | "nao_visivel";
      colete: "presente" | "ausente" | "nao_visivel";
      luva: "presente" | "ausente" | "nao_visivel";
      bota: "presente" | "ausente" | "nao_visivel";
      oculos: "presente" | "ausente" | "nao_visivel";
    }>;
  };
  sinalizacao: {
    aplicavel: boolean;
    presente: boolean;
    itens: string[];
    adequada: boolean;
    observacoes: string;
  };
  pv_qualidade: {
    aplicavel: boolean;
    tampa_ok: boolean | null;
    nivelamento_ok: boolean | null;
    acabamento_ok: boolean | null;
    observacoes: string;
  };
  problemas: Array<{
    categoria: string;
    criticidade: "baixa" | "media" | "alta" | "critica";
    descricao: string;
  }>;
  resumo: string;
};

const SYSTEM_PROMPT = `Você é um agente de Análise Visual de Conformidade e Segurança da Macroambiental, especializada em obras de saneamento (drenagem, esgoto, poços de visita).

Sua tarefa é analisar UMA foto enviada por encarregado de obra via WhatsApp e devolver SOMENTE um JSON válido (sem nenhum texto antes ou depois) seguindo EXATAMENTE este formato:

{
  "etapa": "dds" | "sinalizacao" | "vala" | "compactacao" | "pv" | "drenagem" | "limpeza" | "banheiro" | "mapa_rede" | "checklist" | "outros",
  "etapa_confianca": 0.0 a 1.0,
  "conformidade_geral": "conforme" | "atencao" | "nao_conforme" | "critico" | "inconclusivo",
  "epi_detectado": {
    "pessoas_visiveis": número,
    "pessoas": [ { "indice": 1, "capacete": "presente|ausente|nao_visivel", "colete": "...", "luva": "...", "bota": "...", "oculos": "..." } ]
  },
  "sinalizacao": { "aplicavel": bool, "presente": bool, "itens": ["cone","placa","fita"], "adequada": bool, "observacoes": "" },
  "pv_qualidade": { "aplicavel": bool, "tampa_ok": bool|null, "nivelamento_ok": bool|null, "acabamento_ok": bool|null, "observacoes": "" },
  "problemas": [ { "categoria": "epi"|"sinalizacao"|"pv"|"limpeza"|"organizacao"|"qualidade"|"outros", "criticidade": "baixa"|"media"|"alta"|"critica", "descricao": "..." } ],
  "resumo": "1 a 2 frases curtas em PT-BR descrevendo o que se vê e o ponto principal."
}

REGRAS DE CLASSIFICAÇÃO DA ETAPA:
- "dds": pessoas reunidas em roda para diálogo de segurança, sem atividade de obra ativa
- "sinalizacao": foco em cones, placas, fitas, tapumes
- "vala": vala aberta, escavação em andamento
- "compactacao": placa vibratória, rolo, solo sendo compactado
- "pv": poço de visita (anéis, tampa, concretagem do entorno)
- "drenagem": bocas-de-lobo, tubos, galerias
- "limpeza": varrição, remoção de entulho, reposição de pavimento
- "banheiro": banheiro químico ou refeitório de obra
- "mapa_rede": foto de mapa, planta, croqui em papel ou tela
- "checklist": foto de papel/formulário preenchido
- "outros": tudo que não se encaixa

REGRAS DE EPI:
- Liste UMA entrada por pessoa visível na foto, na ordem em que aparecem da esquerda para a direita.
- "presente" = item claramente visível e em uso correto.
- "ausente" = pessoa está visível na parte do corpo onde o EPI deveria estar (cabeça, tronco, etc.) mas o item não está.
- "nao_visivel" = o ângulo da foto não permite avaliar (ex: foto só do tronco, mãos fora do quadro).
- Se não houver pessoas, pessoas_visiveis=0 e pessoas=[].

REGRAS DE SINALIZAÇÃO:
- aplicavel=true quando a foto mostra frente de serviço em via pública, vala aberta, ou intervenção que exige isolamento.
- aplicavel=false para fotos internas, DDS, banheiro, mapa de rede, checklist em papel.
- "adequada" só é true quando a sinalização cobre todo o perímetro de risco visível.

REGRAS DE PV:
- aplicavel=true SOMENTE quando a foto mostra claramente um poço de visita.
- Em todos os outros casos: aplicavel=false e os campos *_ok = null.

CRITICIDADE DOS PROBLEMAS:
- "critica": ausência de capacete em frente de obra aberta, vala sem qualquer sinalização, risco iminente de queda, acidente em curso.
- "alta": falta de colete em via pública, PV entregue sem acabamento, ausência de múltiplos EPIs.
- "media": EPI parcial (1 item faltando), sinalização incompleta, organização ruim com risco moderado.
- "baixa": detalhe estético, pequena falta de limpeza.

CONFORMIDADE GERAL:
- "conforme": nenhum problema OU apenas problema baixa.
- "atencao": pelo menos 1 problema média.
- "nao_conforme": pelo menos 1 problema alta.
- "critico": pelo menos 1 problema crítica.
- "inconclusivo": foto borrada, escura, ou sem contexto suficiente para avaliar.

Responda SOMENTE com o JSON. Sem markdown, sem cercas \`\`\`, sem comentários.`;

async function chamarGemini(
  lovableKey: string,
  imageUrl: string,
  modelo: string,
): Promise<{ raw: string; tokens_in?: number; tokens_out?: number }> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
    },
    body: JSON.stringify({
      model: modelo,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analise esta foto e devolva o JSON conforme as regras." },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0.1,
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Gateway IA ${r.status}: ${txt.slice(0, 300)}`);
  }
  const j = (await r.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const raw = j.choices?.[0]?.message?.content?.trim() ?? "";
  return {
    raw,
    tokens_in: j.usage?.prompt_tokens,
    tokens_out: j.usage?.completion_tokens,
  };
}

function extrairJson(raw: string): unknown {
  if (!raw) throw new Error("Resposta vazia do modelo.");
  let s = raw.trim();
  // Remove cercas de markdown se vierem
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  }
  // Se vier texto antes/depois, tenta extrair o maior bloco { ... }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first > 0 || last < s.length - 1) {
    if (first >= 0 && last > first) s = s.slice(first, last + 1);
  }
  return JSON.parse(s);
}

function normalizar(parsed: any): AnaliseResultado {
  const etapa = ETAPAS.includes(parsed?.etapa) ? parsed.etapa : "outros";
  const conformidade = CONFORMIDADES.includes(parsed?.conformidade_geral)
    ? parsed.conformidade_geral
    : "inconclusivo";
  return {
    etapa,
    etapa_confianca: Math.min(1, Math.max(0, Number(parsed?.etapa_confianca ?? 0))),
    conformidade_geral: conformidade,
    epi_detectado: parsed?.epi_detectado ?? { pessoas_visiveis: 0, pessoas: [] },
    sinalizacao: parsed?.sinalizacao ?? {
      aplicavel: false,
      presente: false,
      itens: [],
      adequada: false,
      observacoes: "",
    },
    pv_qualidade: parsed?.pv_qualidade ?? {
      aplicavel: false,
      tampa_ok: null,
      nivelamento_ok: null,
      acabamento_ok: null,
      observacoes: "",
    },
    problemas: Array.isArray(parsed?.problemas) ? parsed.problemas.slice(0, 20) : [],
    resumo: String(parsed?.resumo ?? "").slice(0, 600),
  };
}

export async function analisarFoto(fotoId: string): Promise<{ ok: boolean; erro?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) return { ok: false, erro: "LOVABLE_API_KEY ausente." };

  const { data: foto, error: fe } = await supabaseAdmin
    .from("fotos")
    .select("id, storage_path, mime_type")
    .eq("id", fotoId)
    .maybeSingle();
  if (fe || !foto) return { ok: false, erro: fe?.message || "Foto não encontrada." };
  if (!foto.storage_path) return { ok: false, erro: "Foto sem storage_path." };

  const { data: signed, error: se } = await supabaseAdmin.storage
    .from("fotos-obras")
    .createSignedUrl(foto.storage_path, 600);
  if (se || !signed?.signedUrl) return { ok: false, erro: se?.message || "Falha ao gerar URL." };

  const modelo = MODELO_PADRAO;
  let raw = "";
  let tokens_in: number | undefined;
  let tokens_out: number | undefined;
  try {
    const r = await chamarGemini(lovableKey, signed.signedUrl, modelo);
    raw = r.raw;
    tokens_in = r.tokens_in;
    tokens_out = r.tokens_out;
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro IA" };
  }

  let parsed: unknown;
  try {
    parsed = extrairJson(raw);
  } catch (e) {
    return {
      ok: false,
      erro: `JSON inválido do modelo: ${(e as Error).message}. Início: ${raw.slice(0, 200)}`,
    };
  }

  const resultado = normalizar(parsed);

  const { error: ue } = await supabaseAdmin
    .from("foto_analises")
    .upsert(
      {
        foto_id: fotoId,
        etapa: resultado.etapa,
        etapa_confianca: resultado.etapa_confianca,
        conformidade_geral: resultado.conformidade_geral,
        epi_detectado: resultado.epi_detectado,
        sinalizacao: resultado.sinalizacao,
        pv_qualidade: resultado.pv_qualidade,
        problemas: resultado.problemas,
        resumo: resultado.resumo,
        modelo,
        tokens_in: tokens_in ?? null,
        tokens_out: tokens_out ?? null,
        analisado_em: new Date().toISOString(),
      },
      { onConflict: "foto_id" },
    );
  if (ue) return { ok: false, erro: `Erro ao salvar análise: ${ue.message}` };

  return { ok: true };
}

export async function processarFila(maxJobs = 5): Promise<{
  processados: number;
  ok: number;
  erros: number;
  pendentes: number;
}> {
  // Pega jobs pendentes (com tentativas < 3)
  const { data: jobs } = await supabaseAdmin
    .from("foto_analise_jobs")
    .select("id, foto_id, tentativas")
    .eq("status", "pendente")
    .lt("tentativas", 3)
    .order("created_at", { ascending: true })
    .limit(maxJobs);

  if (!jobs || jobs.length === 0) {
    return { processados: 0, ok: 0, erros: 0, pendentes: 0 };
  }

  let ok = 0;
  let erros = 0;

  for (const job of jobs) {
    // Marca como processando
    await supabaseAdmin
      .from("foto_analise_jobs")
      .update({
        status: "processando",
        tentativas: (job.tentativas ?? 0) + 1,
        iniciado_em: new Date().toISOString(),
      })
      .eq("id", job.id);

    const r = await analisarFoto(job.foto_id);
    if (r.ok) {
      ok++;
      await supabaseAdmin
        .from("foto_analise_jobs")
        .update({ status: "ok", erro: null })
        .eq("id", job.id);
    } else {
      erros++;
      const novasTentativas = (job.tentativas ?? 0) + 1;
      await supabaseAdmin
        .from("foto_analise_jobs")
        .update({
          status: novasTentativas >= 3 ? "erro" : "pendente",
          erro: (r.erro ?? "").slice(0, 1000),
        })
        .eq("id", job.id);
    }
  }

  const { count: pendentes } = await supabaseAdmin
    .from("foto_analise_jobs")
    .select("*", { count: "exact", head: true })
    .eq("status", "pendente");

  return { processados: jobs.length, ok, erros, pendentes: pendentes ?? 0 };
}
