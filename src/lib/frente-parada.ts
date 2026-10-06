// Frente de serviço parada (pedido do Arthur, 01/10).
//
// Quando o encarregado conta que a obra/frente está parada ou travada
// esperando alguma providência, muitas vezes ele foi mandado para outra frente
// enquanto isso — mas nem ele fala, nem o bot pergunta. Regras:
// - Na própria conversa, o bot pergunta (uma vez) se ele foi direcionado para
//   outra frente ou se continua aguardando a equipe técnica.
// - A resposta entra no alerta para o coordenador ("equipe remanejada para X"
//   ou "equipe parada aguardando Y").
// - No dia seguinte, o retorno pergunta de novo se ainda está aguardando ou se
//   já foi direcionado para outra frente.
//
// Ajuste de 06/10 (Arthur): obra parada já conhecida não pode virar pergunta
// nem alerta todo dia — os gestores já sabem. A pergunta sobre a obra parada
// sai no máximo 1 vez por semana; no resto do tempo o bot foca no que o
// encarregado está fazendo agora (que serviço, onde, alguma dificuldade).

const semAcento = (t: string) =>
  (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");

// Só conta quando ele fala em parado/travado (ou "sem poder trabalhar"): um
// simples "aguardando material" não quer dizer que a frente parou.
const REGEX_PARADA = new RegExp(
  [
    "\\b(obra|frente|servico|trecho|equipe|turma|pessoal|tudo)\\b[^.?!]{0,40}\\b(parad[oa]s?|paralisad[oa]s?|travad[oa]s?|impedid[oa]s?|embargad[oa]s?|parou|travou|paralisou)\\b",
    "\\b(parad[oa]s?|paralisad[oa]s?|travad[oa]s?|embargad[oa]s?)\\b[^.?!]{0,40}\\b(aguardando|esperando|por causa|porque|falta|sem)\\b",
    "\\b(ficou|ficamos|esta|estamos|ta|tamo|tamos|to|estou|fiquei|tamo)\\s+(parad[oa]s?|travad[oa]s?|paralisad[oa]s?)\\b",
    "\\b(sem|nao)\\s+(poder|conseguir|consigo|conseguimos|consegue|da|tem como|podemos|posso)\\s+(pra |para )?(trabalhar|continuar|seguir|avancar|tocar|executar)\\b",
    "\\b(embargaram|embargou)\\b",
  ].join("|"),
);

/** O encarregado disse que a frente/obra está parada ou travada esperando algo? */
export function mencionaFrenteParada(texto: string): boolean {
  const t = semAcento(texto);
  if (/\btransito\b|engarraf/.test(t)) return false; // "parado no trânsito" não é frente parada
  return REGEX_PARADA.test(t);
}

const REGEX_REMANEJADO =
  /\b(direcionad[oa]s?|remanejad[oa]s?|deslocad[oa]s?|transferid[oa]s?|realocad[oa]s?|me mandaram|mandaram (a gente|nos|eu|a equipe|o pessoal)|me colocaram|colocaram (a gente|nos|a equipe)|fui pra|fui para|fomos pra|fomos para|outra frente|outro servico|outra obra|outro trecho|outra rua|outro local|outro ponto|(atendendo|ajudando|apoiando|dando apoio)( a| ao| o| à| na| no| pro| pra)? \w+)\b/;
// "parada aguardando X" é o próprio relato do problema, não a resposta: só
// conta quando ele diz que CONTINUA/AINDA está esperando.
const REGEX_CONTINUA_AGUARDANDO =
  /\b(continu\w* (aguardando|esperando|parad\w*)|ainda (ta |esta |estamos |to |tamo )?(aguardando|esperando|parad\w*|sem \w+)|sem fazer nada|ninguem (mandou|falou|deu))\b/;

/** Ele já disse se foi para outra frente ou se segue esperando? */
export function informouSituacaoDaEquipe(texto: string): boolean {
  const t = semAcento(texto);
  return REGEX_REMANEJADO.test(t) || REGEX_CONTINUA_AGUARDANDO.test(t);
}

/** O bot já fez a pergunta de remanejamento? */
export function perguntouRemanejamento(texto: string): boolean {
  const t = semAcento(texto);
  return /\?/.test(t) && /(direcionad|remanejad|outra frente|outro (servico|lugar|local)|continua aguardando|ainda (esta|ta) aguardando)/.test(t);
}

export const PERGUNTAS_REMANEJAMENTO = [
  "E enquanto isso está parado aí, você foi direcionado para outra frente de serviço ou continua aguardando a providência da equipe técnica?",
  "Enquanto aí não libera, te direcionaram para alguma outra frente de serviço ou você continua aguardando a providência da equipe técnica?",
  "Nesse meio tempo, você foi direcionado para outro lugar ou continua aguardando a equipe técnica resolver?",
];

/**
 * Nesta conversa, o bot ainda precisa perguntar se a equipe foi remanejada?
 * Sim quando a frente parada apareceu na sessão (ou agora), o bot ainda não
 * perguntou e o encarregado ainda não contou por conta própria.
 */
export function precisaPerguntarRemanejamento(
  mensagensSessao: Array<{ role: string; conteudo: string }>,
  mensagemAtual: string,
): boolean {
  const falasUsuario = [
    ...mensagensSessao.filter((m) => m.role === "user").map((m) => m.conteudo || ""),
    mensagemAtual,
  ];
  if (!falasUsuario.some(mencionaFrenteParada)) return false;
  if (falasUsuario.some(informouSituacaoDaEquipe)) return false;
  return !mensagensSessao.some((m) => m.role === "assistant" && perguntouRemanejamento(m.conteudo || ""));
}

export const BLOCO_PERGUNTA_REMANEJAMENTO = `\n\n## FRENTE PARADA — PERGUNTA OBRIGATÓRIA AGORA
O encarregado contou que a obra/frente dele está parada ou travada esperando alguma providência. Muitas vezes, nesse caso, ele é mandado para outra frente de serviço enquanto a primeira não libera — e ninguém registra isso.
- Nesta resposta, acolha o que ele disse em poucas palavras e PERGUNTE se ele foi direcionado para outra frente de serviço (outro lugar) ou se continua aguardando a providência da equipe técnica. Ex.: "E enquanto isso está parado aí, você foi direcionado para outra frente de serviço ou continua aguardando a providência da equipe técnica?"
- Faça só essa pergunta nesta mensagem (sem pergunta genérica junto).`;

export const BLOCO_LEITURA_REMANEJAMENTO = `\n\n## FRENTE PARADA — REGISTRE E APROFUNDE NO TRABALHO ATUAL
- Se o encarregado disse que foi direcionado para outra frente (ou que está atendendo/ajudando outra equipe ou pessoa), confirme em poucas palavras o que entendeu e APROFUNDE no trabalho de agora, uma pergunta por mensagem, nesta ordem e só o que ainda não foi dito: (1) onde está e que tipo de serviço está fazendo lá; (2) se está com alguma dificuldade nesse serviço. Ex.: ele disse "estou atendendo o Mateus" → "Beleza! E o que vocês estão fazendo lá com o Mateus, que tipo de serviço?".
- Se ele continua aguardando, confirme que ficou registrado que a equipe está parada esperando a providência.
- NÃO volte a perguntar se a obra parada continua parada.`;

export const BLOCO_PARADA_CONHECIDA = `\n\n## OBRA PARADA JÁ CONHECIDA — NÃO INSISTA NISSO
Nesta semana você já perguntou a este encarregado sobre a obra/frente parada, e os gestores já foram avisados.
- NÃO pergunte de novo se ela continua parada, se já liberou ou se ele foi remanejado — a não ser que seja claramente uma obra/frente DIFERENTE da que ele já relatou.
- Reconheça em poucas palavras (ex.: "Entendi, essa já está registrada.") e leve a conversa para o que ele está fazendo AGORA, uma pergunta por mensagem e só o que ainda não foi dito: onde está trabalhando e que tipo de serviço está fazendo; depois, se está com alguma dificuldade nesse serviço.`;

/** A resposta do bot já pergunta sobre remanejamento? Se não, acrescenta a pergunta. */
export function garantirPerguntaRemanejamento(resposta: string): string {
  const texto = (resposta || "").trim();
  if (!texto || perguntouRemanejamento(texto)) return texto;
  const pergunta = PERGUNTAS_REMANEJAMENTO[Math.floor(Math.random() * PERGUNTAS_REMANEJAMENTO.length)];
  // Tira uma pergunta solta do final (o modelo às vezes pergunta outra coisa)
  // para não mandar duas perguntas na mesma mensagem.
  const semPerguntaFinal = texto.replace(/[^.!?\n]*\?\s*$/, "").trim();
  return semPerguntaFinal ? `${semPerguntaFinal} ${pergunta}` : pergunta;
}

/** Instrução extra para a análise de alerta (vai junto do prompt do analista). */
export const REGRA_ALERTA_REMANEJAMENTO = `

FRENTE PARADA / REMANEJAMENTO DA EQUIPE (importante):
- Se a frente/obra está parada ou travada, o resumo DEVE dizer a situação da equipe quando ela aparecer na conversa: "equipe remanejada para <local/serviço>" ou "equipe parada aguardando <providência>". Se ainda não se sabe, não invente.
- Saber PELA PRIMEIRA VEZ onde a equipe está (remanejada para outra frente, atendendo outra equipe, ou parada esperando) é relevante (categoria "prazo"): resuma qual frente está parada e onde a equipe está agora e o que está fazendo. Criticidade "alta" se a equipe está parada esperando; "media" se foi remanejada. Se isso já foi informado aos gestores (lista abaixo), NÃO é novidade.
- Dificuldade no serviço atual (na frente para onde foi remanejado) é um problema novo e deve ser avaliado normalmente.`;

/**
 * Pergunta final do retorno do dia seguinte quando o problema de ontem era
 * frente parada. Se ontem ele já tinha sido remanejado, pergunta se a frente
 * original liberou.
 */
export function fechoFollowUpFrenteParada(textosOntem: string[]): string | null {
  const todos = textosOntem.join(" \n ");
  if (!textosOntem.some(mencionaFrenteParada) && !/\b(parad|travad|paralisad|remanej|direcionad)/.test(semAcento(todos))) {
    return null;
  }
  if (REGEX_REMANEJADO.test(semAcento(todos))) {
    return "Já liberaram a frente que estava parada ou você continua na outra frente de serviço?";
  }
  const opcoes = [
    "E aí, você ainda está aguardando a solução da equipe técnica ou já te direcionaram para alguma outra frente de serviço?",
    "Ainda está aguardando o retorno da equipe técnica pra frente liberar, ou já te direcionaram para outra frente de serviço?",
  ];
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

/**
 * Bloco com o que os gestores já sabem deste encarregado (últimos 7 dias):
 * o analista só gera alerta quando há NOVIDADE. Sem isso, "a obra da ETE
 * continua parada" virava alerta todo dia (Olivan, 29/09 a 05/10).
 */
export function blocoJaInformados(lista: Array<{ quando: string; resumo: string }>): string {
  if (lista.length === 0) return "";
  const linhas = lista.map((a) => `- ${a.quando}: ${a.resumo}`).join("\n");
  return `

JÁ INFORMADO AOS GESTORES SOBRE ESTE ENCARREGADO NOS ÚLTIMOS 7 DIAS (eles JÁ SABEM):
${linhas}

Se a conversa atual só repete, confirma ou mantém uma dessas situações sem novidade (ex.: "a obra continua parada", "ainda falta o material", "segue do mesmo jeito"), responda alerta=false. Gere alerta SÓ se houver novidade real: um problema diferente, uma situação que piorou, que foi resolvida/liberada, ou uma informação nova importante (ex.: para onde a equipe foi remanejada, data prevista de liberação, nova dificuldade no serviço atual).`;
}

/**
 * Pergunta do retorno da manhã quando a obra parada JÁ foi perguntada nesta
 * semana: em vez de insistir nela, pergunta do trabalho de agora.
 */
export function perguntaTrabalhoAtual(): string {
  const opcoes = [
    "Como está o serviço hoje? Em que frente você está e que tipo de serviço está fazendo?",
    "Como estão as coisas hoje? Onde você está trabalhando e qual serviço está tocando por aí?",
    "E o serviço de hoje, como está? Me conta onde você está e o que está fazendo por aí.",
  ];
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

/** O problema é (só) de frente parada / remanejamento? */
export function ehAssuntoFrenteParada(textos: string[]): boolean {
  const todos = semAcento(textos.join(" \n "));
  return textos.some(mencionaFrenteParada) || /\b(parad|travad|paralisad|remanej|direcionad)/.test(todos);
}
