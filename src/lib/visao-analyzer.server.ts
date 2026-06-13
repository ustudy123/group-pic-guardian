// Worker server-only: analisa 1 foto via Lovable AI Gateway (Gemini 2.5 Pro multimodal)
// e devolve um JSON estruturado de conformidade visual.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Modelo de visão da OpenAI. Configurável por env (VISAO_OPENAI_MODEL):
//   "gpt-4o"      → melhor qualidade visual (recomendado p/ análise de conformidade)
//   "gpt-4o-mini" → mais barato, qualidade menor em julgamentos finos
const MODELO_PADRAO = process.env.VISAO_OPENAI_MODEL || "gpt-4o";

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

const SYSTEM_PROMPT = `Você é o agente de Análise Visual de Conformidade da MACROAMBIENTAL — obras de saneamento (água, esgoto, drenagem, PV). Sua tarefa é analisar UMA foto enviada por encarregado via WhatsApp e devolver SOMENTE um JSON válido (sem texto antes/depois, sem markdown):

{
  "etapa": <uma das etapas abaixo>,
  "etapa_confianca": 0.0 a 1.0,
  "conformidade_geral": "conforme" | "atencao" | "nao_conforme" | "critico" | "inconclusivo",
  "epi_detectado": { "pessoas_visiveis": n, "pessoas": [ { "indice":1,"capacete":"presente|ausente|nao_visivel","colete":"...","luva":"...","bota":"...","oculos":"..." } ] },
  "sinalizacao": { "aplicavel": bool, "presente": bool, "itens": ["cone","placa","fita","cone_refletivo","tapume"], "adequada": bool, "observacoes": "" },
  "pv_qualidade": { "aplicavel": bool, "tampa_ok": bool|null, "nivelamento_ok": bool|null, "acabamento_ok": bool|null, "observacoes": "" },
  "problemas": [ { "categoria":"epi|sinalizacao|pv|vala|compactacao|base|limpeza|equipamento|qualidade|organizacao|outros", "criticidade":"baixa|media|alta|critica", "descricao":"..." } ],
  "resumo": "1-2 frases em PT-BR"
}

ETAPAS POSSÍVEIS (escolha a MAIS específica):
- "nota_servico": foto da Nota de Serviço (documento impresso/Excel do dia)
- "localizacao": foto de mapa de água / localização enviada
- "dds": equipe reunida em roda para Diálogo Diário de Segurança
- "sinalizacao": foco em cones, placas, fitas, cones refletivos isolando a frente
- "banheiro_longe": banheiro químico fotografado de longe, mostrando que existe
- "banheiro_dentro": foto interna do banheiro (lixeira, pia, torneira, papel, sabão)
- "mapa_rede": mapa/planta de rede de água
- "escavacao_vala": máquina escavando ou vala aberta sendo escavada
- "assentamento_tubo": tubos sendo assentados dentro da vala
- "compactacao_1a": compactação da 1ª camada após assentamento
- "compactacao_2a": compactação da 2ª camada
- "compactacao_3a": compactação da 3ª camada
- "vala_25cm_base": vala com 25cm pronta para receber material de base (já compactada pelo equipamento)
- "espalhamento_base": espalhamento de solo-brita (material de base)
- "compactacao_base": compactação do material de base
- "construcao_pv": construção de PV (anel de concreto sendo assentado)
- "acabamento_pv": foto INTERNA do PV mostrando canaleta de fundo, junções dos anéis em argamassa
- "vala_finalizada": obra concluída, vala fechada, área limpa
- "limpeza": equipe varrendo, removendo entulho, limpando a rua
- "passagem_segura": caminho sinalizado para pedestre passar
- "checklist_compactador": foto do compactador para checklist de uso
- "checklist_moto_bomba": foto da motobomba para checklist de uso
- "drenagem_boca_lobo": trabalho próximo a boca de lobo / drenagem urbana
- "outros": nada do acima

REGRAS POR ETAPA (gere problema correspondente quando detectar):

DDS:
- Todos uniformizados. SEM CHINELO. SEM BONÉ (só capacete). Se ver chinelo → criticidade ALTA. Boné no lugar de capacete → ALTA.

SINALIZACAO:
- Exigir: cones, placas, informações visíveis, CONE COM FAIXA REFLETIVA. Sinalização ausente em frente aberta → CRÍTICA. Insuficiente → MÉDIA.

BANHEIRO_DENTRO:
- Verificar: lixeira COM TAMPA, pia, torneira, papel, sabão. Falta de qualquer item → MÉDIA.

ESCAVACAO_VALA / ASSENTAMENTO_TUBO:
- NÃO PODE haver mangueira d'água rompida/estourada à vista → ALTA.
- Assentamento: material escavado deve estar AFASTADO das laterais da vala (no limite, não na borda) → falha = MÉDIA.
- NÃO PODE haver água dentro da vala → ALTA.
- Vala profunda (pessoa dentro com solo acima da cintura): NÃO PODE ter pessoa dentro nem alguém PISANDO NO TUBO → CRÍTICA.

COMPACTACAO_1a / 2a / 3a:
- Operador OBRIGATÓRIO com EPI completo (capacete, botina, luva) E LUVA ANTI-VIBRAÇÃO. Sem luva anti-vibração em compactação → ALTA. EPI ausente → CRÍTICA.

ESPALHAMENTO_BASE / COMPACTACAO_BASE:
- Reconhecer material de base (solo + brita). Pessoa visível sem EPI completo → CRÍTICA.

CONSTRUCAO_PV:
- Deve haver anel de concreto do PV visível. Ausência → MÉDIA (foto fraca).

ACABAMENTO_PV:
- Foto INTERNA do PV. DEVE mostrar canaleta de fundo + junções dos anéis finalizadas em ARGAMASSA. Ausência de acabamento → ALTA. Preencha pv_qualidade.acabamento_ok.

VALA_FINALIZADA:
- Obra limpa, sem calçada quebrada visível. Calçada quebrada/entulho remanescente → ALTA.

LIMPEZA:
- Equipe ativamente varrendo/removendo. Se foto não comprovar limpeza → MÉDIA.

PASSAGEM_SEGURA:
- Caminho claro + sinalização indicando passagem de pedestre. Ausência → ALTA.

CHECKLIST_COMPACTADOR / CHECKLIST_MOTO_BOMBA:
- Equipamento deve estar em condição de uso (sem peças soltas, vazamento, dano evidente). Defeito visível → ALTA.

DRENAGEM_BOCA_LOBO:
- Foto da intervenção na drenagem; sem critérios extras além de EPI/sinalização gerais.

EPI (em QUALQUER etapa com pessoas trabalhando):
- "presente" = item claramente visível e em uso. "ausente" = parte do corpo visível sem o EPI. "nao_visivel" = ângulo não permite ver.
- Liste 1 entrada por pessoa, da esquerda para a direita.
- pessoas_visiveis=0 quando não há pessoas.

SINALIZACAO.aplicavel:
- true quando: frente de serviço em via pública, vala aberta, intervenção que exige isolamento.
- false para: DDS, banheiro, mapa, checklist, foto interna de PV.

PV_QUALIDADE.aplicavel:
- true SOMENTE em construcao_pv ou acabamento_pv. Caso contrário aplicavel=false e *_ok=null.

CRITICIDADE:
- "critica": ausência de capacete em frente aberta, vala sem sinalização, pessoa dentro de vala profunda, risco iminente.
- "alta": chinelo/boné no DDS, mangueira rompida, água na vala, falta de colete em via, PV sem acabamento, calçada quebrada na entrega, falta de luva anti-vibração na compactação.
- "media": EPI parcial (1 item), sinalização incompleta, item faltando no banheiro, material mal afastado da borda.
- "baixa": detalhe estético/limpeza menor.

CONFORMIDADE_GERAL:
- "conforme": nenhum problema OU só baixa.
- "atencao": pelo menos 1 média.
- "nao_conforme": pelo menos 1 alta.
- "critico": pelo menos 1 crítica.
- "inconclusivo": foto borrada, escura, sem contexto.

Responda SOMENTE com o JSON. Sem markdown, sem cercas \`\`\`, sem comentários.`;

async function chamarOpenAI(
  openaiKey: string,
  imageUrl: string,
  modelo: string,
  extras?: { aprendizado?: string; manual_fotos?: string },
): Promise<{ raw: string; tokens_in?: number; tokens_out?: number }> {
  let systemPrompt = SYSTEM_PROMPT;
  const apr = (extras?.aprendizado ?? "").trim();
  const man = (extras?.manual_fotos ?? "").trim();
  if (apr) {
    systemPrompt += `\n\n# APRENDIZADO ADICIONAL (configurado pelo admin)\nUse as regras/exemplos abaixo como fonte de verdade adicional. Em caso de conflito com as regras gerais, PREFIRA o aprendizado abaixo:\n\n${apr}`;
  }
  if (man) {
    systemPrompt += `\n\n# MANUAL DE FOTOS (configurado pelo admin)\nReferência oficial de como cada tipo de foto deve ser tirada. Use para classificar a etapa e validar requisitos:\n\n${man}`;
  }

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: modelo,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Analise esta foto e devolva o JSON conforme as regras." },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`OpenAI ${r.status}: ${txt.slice(0, 300)}`);
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

// Lê o modelo escolhido na tela (visao_config); cai no default se não houver.
async function getModeloConfig(): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from("visao_config" as any)
      .select("modelo")
      .eq("id", "default")
      .maybeSingle();
    return ((data as any)?.modelo as string) || MODELO_PADRAO;
  } catch {
    return MODELO_PADRAO;
  }
}

// Lê os textos configuráveis (aprendizado + manual de fotos) editáveis na tela.
async function getTextosConfig(): Promise<{ aprendizado: string; manual_fotos: string }> {
  try {
    const { data } = await supabaseAdmin
      .from("visao_config" as any)
      .select("aprendizado, manual_fotos")
      .eq("id", "default")
      .maybeSingle();
    return {
      aprendizado: ((data as any)?.aprendizado as string) || "",
      manual_fotos: ((data as any)?.manual_fotos as string) || "",
    };
  } catch {
    return { aprendizado: "", manual_fotos: "" };
  }
}

export async function analisarFoto(
  fotoId: string,
  modeloOverride?: string,
): Promise<{ ok: boolean; erro?: string }> {
  // Chave dedicada da visão (VISAO_OPENAI_KEY) para isolar o billing da análise de fotos;
  // Prioridade: chave dedicada da Visão IA > VISAO_OPENAI_KEY (legado) > OPENAI_API_KEY compartilhada.
  const openaiKey =
    process.env.OPENAI_API_KEY_VISAO ||
    process.env.VISAO_OPENAI_KEY ||
    process.env.OPENAI_API_KEY;
  if (!openaiKey)
    return { ok: false, erro: "OPENAI_API_KEY_VISAO (ou OPENAI_API_KEY) ausente." };

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

  const modelo = modeloOverride || MODELO_PADRAO;
  let raw = "";
  let tokens_in: number | undefined;
  let tokens_out: number | undefined;
  try {
    const r = await chamarOpenAI(openaiKey, signed.signedUrl, modelo);
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
        rfo: ETAPAS_RFO.has(resultado.etapa),
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

export async function processarFila(
  maxJobs = 5,
  filtros?: { encarregadoId?: string | null },
): Promise<{
  processados: number;
  ok: number;
  erros: number;
  pendentes: number;
}> {
  // Se filtrar por encarregado, pega foto_ids dele primeiro
  let fotoIdsFiltro: string[] | null = null;
  if (filtros?.encarregadoId) {
    const { data: fotos } = await supabaseAdmin
      .from("fotos")
      .select("id")
      .eq("encarregado_id", filtros.encarregadoId)
      .limit(500);
    fotoIdsFiltro = (fotos ?? []).map((f: any) => f.id);
    if (fotoIdsFiltro.length === 0) {
      return { processados: 0, ok: 0, erros: 0, pendentes: 0 };
    }
  }

  let q = supabaseAdmin
    .from("foto_analise_jobs")
    .select("id, foto_id, tentativas")
    .eq("status", "pendente")
    .lt("tentativas", 3)
    .order("created_at", { ascending: true })
    .limit(maxJobs);
  if (fotoIdsFiltro) q = q.in("foto_id", fotoIdsFiltro);
  const { data: jobs } = await q;

  if (!jobs || jobs.length === 0) {
    return { processados: 0, ok: 0, erros: 0, pendentes: 0 };
  }

  // Modelo escolhido na tela (uma leitura por lote)
  const modelo = await getModeloConfig();

  let ok = 0;
  let erros = 0;

  // Processa em PARALELO para caber dentro do timeout do worker.
  const resultados = await Promise.all(
    jobs.map(async (job: any) => {
      await supabaseAdmin
        .from("foto_analise_jobs")
        .update({
          status: "processando",
          tentativas: (job.tentativas ?? 0) + 1,
          iniciado_em: new Date().toISOString(),
        })
        .eq("id", job.id);

      const r = await analisarFoto(job.foto_id, modelo);
      if (r.ok) {
        await supabaseAdmin
          .from("foto_analise_jobs")
          .update({ status: "ok", erro: null })
          .eq("id", job.id);
      } else {
        const novasTentativas = (job.tentativas ?? 0) + 1;
        await supabaseAdmin
          .from("foto_analise_jobs")
          .update({
            status: novasTentativas >= 3 ? "erro" : "pendente",
            erro: (r.erro ?? "").slice(0, 1000),
          })
          .eq("id", job.id);
      }
      return r.ok;
    }),
  );
  for (const ok2 of resultados) {
    if (ok2) ok++;
    else erros++;
  }

  const { count: pendentes } = await supabaseAdmin
    .from("foto_analise_jobs")
    .select("*", { count: "exact", head: true })
    .eq("status", "pendente");

  return { processados: jobs.length, ok, erros, pendentes: pendentes ?? 0 };
}
