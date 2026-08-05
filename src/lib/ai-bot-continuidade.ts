/**
 * Lógica CENTRALIZADA de continuidade e encerramento das conversas do robô Macro I.A.
 *
 * Regras (ver pedido do usuário):
 * - O bot não pode terminar toda resposta com "posso ajudar em algo mais?".
 * - No máximo 2 perguntas genéricas de continuidade POR SESSÃO.
 * - Perguntas necessárias (sobre a ocorrência) não contam e nunca são removidas.
 * - Quando o usuário diz "não / só isso / valeu", a sessão é encerrada sem nova pergunta.
 * - Assunto fora do escopo: resposta breve + encerramento sem pergunta.
 *
 * O estado da sessão NÃO é persistido em tabela nova: ele é derivado do próprio
 * histórico (`ai_bot_conversas`), delimitado pelo intervalo de reabertura.
 * Assim o contador só zera quando começa uma sessão nova, nunca a cada mensagem.
 */

/** Minutos de silêncio que caracterizam uma sessão NOVA de conversa. */
export const REABERTURA_MIN = 120;

export type TopicStatus =
  | "collecting_information"
  | "awaiting_user_response"
  | "resolved"
  | "off_topic"
  | "closed";

export type SessaoEstado = {
  /** Quantas perguntas genéricas de continuidade o bot já fez nesta sessão. */
  genericFollowUpCount: number;
  /** Última frase genérica usada (normalizada) — para não repetir a mesma. */
  lastGenericFollowUp: string | null;
  currentTopicStatus: TopicStatus;
  /** Início da sessão atual (ISO) ou null se é a primeira mensagem. */
  sessaoInicio: string | null;
  /** Mensagens pertencentes à sessão atual. */
  mensagensSessao: Array<{ role: string; conteudo: string }>;
  /** True quando não houve fala nas últimas REABERTURA_MIN. */
  conversaReaberta: boolean;
};

export type LinhaConversa = {
  role: string;
  conteudo: string;
  created_at: string;
};

export function normalizarTexto(t: string): string {
  return (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chaveComparacao(t: string): string {
  return normalizarTexto(t).replace(/[^a-z0-9]/g, "");
}

/**
 * Pergunta GENÉRICA de continuidade: existe outro assunto? Trocar as palavras não
 * escapa — a detecção é semântica por padrão, não por frase literal.
 */
const PADROES_GENERICOS: RegExp[] = [
  /\b(mais|algum[ao]?|outr[oa]s?)\b[^?]{0,60}\?$/i, // filtro amplo, refinado abaixo
];

const NUCLEOS_GENERICOS: RegExp[] = [
  /mais alguma coisa/,
  /mais algum (ponto|assunto|caso|problema|detalhe|item|relato|registro)/,
  /algo mais/,
  /alguma outra coisa/,
  /mais alguma (situacao|ocorrencia|demanda|informacao|novidade|questao|coisa)/,
  /posso (te )?ajudar (em|com) (algo|mais|alguma)/,
  /precisa de (mais )?(alguma coisa|algo|ajuda) ?(mais)?/,
  /(quer|deseja|gostaria de) (falar|tratar|relatar|registrar|comentar) (sobre )?(outro|mais)/,
  /(existe|tem|ha|ficou) (mais )?(algum|outro|alguma|outra)[^?]{0,40}(assunto|ponto|situacao|ocorrencia|coisa|questao|demanda|relato)/,
  /aconteceu (mais )?(alguma|algo)/,
  /algo mais (que|pra|para)/,
  /mais alguma duvida/,
  /(qualquer coisa|se precisar)[^?]{0,30}\?/,
];

/** Perguntas necessárias para tratar a ocorrência — NUNCA contam nem são removidas. */
const NUCLEOS_NECESSARIOS: RegExp[] = [
  /machuc|ferid|acident|lesion/,
  /risco|perigo|isolad|isolar|sinalizad/,
  /qual (o )?(local|endereco|rua|trecho|ponto)|onde (isso )?(foi|aconteceu|ocorreu)/,
  /qual obra|em qual obra|que obra|qual frente|qual equipe/,
  /quem (estava|esta|foi|e o)|nome do|responsavel/,
  /foto|video|imagem/,
  /quando (isso )?(foi|aconteceu|ocorreu)|que horas/,
  /quant[oa]s?/,
  /avisad[oa]|comunicad[oa]|informad[oa]/,
  /ja foi|foi feito|resolveu|resolvido\?/,
];

function separarFrases(texto: string): string[] {
  return (texto || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter(Boolean);
}

export function ehPerguntaGenerica(frase: string): boolean {
  if (!frase.includes("?")) return false;
  const n = normalizarTexto(frase);
  if (NUCLEOS_NECESSARIOS.some((r) => r.test(n))) return false;
  if (NUCLEOS_GENERICOS.some((r) => r.test(n))) return true;
  // rede de segurança: pergunta curta e vaga sobre "mais/outro" sem objeto concreto
  return PADROES_GENERICOS.some((r) => r.test(n)) && n.length <= 60 && /\b(mais|outr)/.test(n);
}

export function contarGenericas(texto: string): string[] {
  return separarFrases(texto).filter(ehPerguntaGenerica);
}

/** Variações naturais de pergunta genérica (usadas só quando permitido). */
export const VARIACOES_GENERICAS = [
  "Além disso, aconteceu mais alguma coisa importante na obra?",
  "Existe outro ponto da obra que você queira relatar?",
  "Tem mais alguma situação do canteiro que precisamos saber?",
  "Há outro assunto relacionado à obra que você queira registrar?",
  "Ficou mais algum ponto importante para nos contar?",
];

/** Encerramentos naturais, sem pergunta. */
export const ENCERRAMENTOS = [
  "Certo. Obrigado pelas informações.",
  "Entendido. Vou considerar o que você relatou.",
  "Beleza. Obrigado por avisar.",
  "Registro concluído. Obrigado pela colaboração.",
  "Compreendido. A situação será tratada conforme o fluxo definido.",
  "Certo. Até mais!",
  "Obrigado pelo relato. Ficamos atentos por aqui.",
];

function escolherDiferente(lista: string[], evitar: string | null): string {
  const candidatos = lista.filter((f) => chaveComparacao(f) !== (evitar || ""));
  const pool = candidatos.length > 0 ? candidatos : lista;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Deriva o estado da sessão a partir do histórico cronológico (mais antigo → mais novo).
 * Sessão = bloco de mensagens sem intervalo maior que REABERTURA_MIN.
 */
export function derivarEstadoSessao(
  historicoAsc: LinhaConversa[],
  agora: Date = new Date(),
): SessaoEstado {
  if (historicoAsc.length === 0) {
    return {
      genericFollowUpCount: 0,
      lastGenericFollowUp: null,
      currentTopicStatus: "collecting_information",
      sessaoInicio: null,
      mensagensSessao: [],
      conversaReaberta: true,
    };
  }

  const ultima = historicoAsc[historicoAsc.length - 1];
  const minutosDesdeUltima =
    (agora.getTime() - new Date(ultima.created_at).getTime()) / 60000;
  const conversaReaberta = minutosDesdeUltima > REABERTURA_MIN;

  if (conversaReaberta) {
    // A mensagem que chega agora abre uma sessão nova → contador zerado.
    return {
      genericFollowUpCount: 0,
      lastGenericFollowUp: null,
      currentTopicStatus: "collecting_information",
      sessaoInicio: null,
      mensagensSessao: [],
      conversaReaberta: true,
    };
  }

  // Volta no tempo até achar um intervalo maior que REABERTURA_MIN.
  let inicio = 0;
  for (let i = historicoAsc.length - 1; i > 0; i--) {
    const gap =
      (new Date(historicoAsc[i].created_at).getTime() -
        new Date(historicoAsc[i - 1].created_at).getTime()) /
      60000;
    if (gap > REABERTURA_MIN) {
      inicio = i;
      break;
    }
  }

  const mensagensSessao = historicoAsc.slice(inicio);
  const genericas = mensagensSessao
    .filter((m) => m.role === "assistant")
    .flatMap((m) => contarGenericas(m.conteudo));

  return {
    genericFollowUpCount: genericas.length,
    lastGenericFollowUp:
      genericas.length > 0 ? chaveComparacao(genericas[genericas.length - 1]) : null,
    currentTopicStatus: genericas.length >= 2 ? "resolved" : "collecting_information",
    sessaoInicio: historicoAsc[inicio].created_at,
    mensagensSessao: mensagensSessao.map((m) => ({ role: m.role, conteudo: m.conteudo })),
    conversaReaberta: false,
  };
}

/**
 * "não", "só isso", "nada mais" encerram a conversa — MAS apenas quando o bot não
 * acabou de fazer uma pergunta necessária (senão "não" é a resposta dela, ex.:
 * "alguém se machucou?" → "não").
 */
const REGEX_NEGATIVA_FINAL =
  /^\s*(?:n[ãa]o|nao|nops?|negativ[oa]|s[óo]\s+iss[oa](?:\s+mesmo)?|era\s+iss[oa]|nada\s+mais|por\s+enquanto\s+n[ãa]o|mais\s+nada|nada\s+n[ãa]o|por\s+ora\s+n[ãa]o)[\s.,!]*(?:obrigad[oa]s?|valeu|vlw)?[\s.,!😊👍🙏]*$/i;

export function ehNegativaDeContinuidade(
  mensagemUsuario: string,
  ultimaMensagemAssistant: string | null,
): boolean {
  const t = (mensagemUsuario || "").trim();
  if (!t || t.length > 40) return false;
  if (!REGEX_NEGATIVA_FINAL.test(t)) return false;
  if (!ultimaMensagemAssistant) return true;
  const frases = separarFrases(ultimaMensagemAssistant);
  const perguntas = frases.filter((f) => f.includes("?"));
  if (perguntas.length === 0) return true;
  // Se a última pergunta do bot era NECESSÁRIA, "não" é resposta a ela, não encerramento.
  return perguntas.every((p) => ehPerguntaGenerica(p));
}

/** Bloco de instruções injetado no system prompt, refletindo o estado da sessão. */
export function blocoContinuidade(estado: SessaoEstado): string {
  const restantes = Math.max(0, 2 - estado.genericFollowUpCount);
  const base = `\n\n## CONTINUIDADE DA CONVERSA — REGRA OBRIGATÓRIA
Nunca termine automaticamente a resposta com uma pergunta genérica do tipo "tem mais alguma coisa?", "posso ajudar em algo mais?", "tem mais algum ponto pra falar hoje?". Trocar as palavras não vale: qualquer pergunta cuja única função seja descobrir se existe OUTRO assunto conta como genérica.
- Perguntas NECESSÁRIAS para entender/registrar a ocorrência (alguém se machucou? qual obra? qual local? tem foto? quem estava envolvido? a área foi isolada?) são sempre permitidas — faça quantas precisar, uma de cada vez, sem enrolar.
- Se ainda faltam informações da ocorrência: pergunte só o que falta e NÃO faça pergunta genérica.
- Se o assunto foi resolvido: confirme a providência de forma objetiva e encerre com uma frase curta, sem pergunta.
- Nunca invente registro, encaminhamento ou providência que o sistema não faça de fato.
- Assunto fora do escopo da obra: responda breve e com empatia, lembre discretamente que este canal é para assuntos da obra e ENCERRE sem pergunta.
- Assunto que não é sua alçada: não recuse de forma seca — diga que registra e indica o responsável/canal certo.
- Varie os encerramentos, não repita sempre a mesma frase.
- Fale português brasileiro simples e próximo, profissional sem ser formal demais. Nada de textão nem cara de formulário.`;

  const limite =
    restantes <= 0
      ? `\n\nESTADO DESTA CONVERSA: você JÁ fez ${estado.genericFollowUpCount} perguntas genéricas de continuidade nesta sessão. É PROIBIDO fazer outra. Encerre de forma educada, sem nenhuma pergunta ao final.`
      : `\n\nESTADO DESTA CONVERSA: você ainda pode fazer no máximo ${restantes} pergunta(s) genérica(s) de continuidade nesta sessão inteira — use só se o assunto atual já estiver resolvido e fizer sentido. Se usar, escolha uma frase diferente das que já usou.`;

  return base + limite;
}

/**
 * Pós-processamento determinístico: garante o limite mesmo se o modelo desobedecer.
 */
export function aplicarRegrasContinuidade(
  resposta: string,
  estado: SessaoEstado,
  opts: { forcarEncerramento?: boolean } = {},
): string {
  const texto = (resposta || "").trim();
  if (!texto) return "";

  const frases = separarFrases(texto);
  const genericasNaResposta = frases.filter(ehPerguntaGenerica);
  if (genericasNaResposta.length === 0) return texto;

  const podeUsar =
    !opts.forcarEncerramento && estado.genericFollowUpCount < 2 ? 1 : 0;

  const mantidas: string[] = [];
  let usadas = 0;
  for (const f of frases) {
    if (!ehPerguntaGenerica(f)) {
      mantidas.push(f);
      continue;
    }
    if (usadas < podeUsar) {
      const repetida = chaveComparacao(f) === estado.lastGenericFollowUp;
      mantidas.push(repetida ? escolherDiferente(VARIACOES_GENERICAS, estado.lastGenericFollowUp) : f);
      usadas++;
    }
    // acima do limite: a pergunta simplesmente cai fora
  }

  let final = mantidas.join(" ").trim();
  if (!final) final = escolherDiferente(ENCERRAMENTOS, null);
  return final;
}
