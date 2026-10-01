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
  /\b(direcionad[oa]s?|remanejad[oa]s?|deslocad[oa]s?|transferid[oa]s?|realocad[oa]s?|me mandaram|mandaram (a gente|nos|eu|a equipe|o pessoal)|me colocaram|colocaram (a gente|nos|a equipe)|fui pra|fui para|fomos pra|fomos para|outra frente|outro servico|outra obra|outro trecho|outra rua|outro local|outro ponto)\b/;
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

export const BLOCO_LEITURA_REMANEJAMENTO = `\n\n## FRENTE PARADA — REGISTRE A SITUAÇÃO DA EQUIPE
Se o encarregado acabou de dizer que foi direcionado para outra frente, confirme de forma curta o que entendeu (ex.: "Beleza, anotado: a frente da rua X segue parada e você está na rua Y enquanto não libera."), perguntando onde está agora só se ele não disse. Se ele continua aguardando, confirme que ficou registrado que a equipe está parada esperando a providência.`;

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
- Se a mensagem do encarregado RESPONDE se foi direcionado para outra frente ou se continua aguardando, isso É relevante (alerta=true, categoria "prazo"): resuma qual frente está parada, o motivo (se citado) e onde a equipe está agora. Criticidade "alta" se a equipe está parada esperando; "media" se foi remanejada para outra frente.`;

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
