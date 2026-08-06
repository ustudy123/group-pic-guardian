// Regras de visibilidade condicional dos campos de formulário.
// Compartilhado entre o editor (painel) e o formulário público.

export type OperadorCondicao =
  | "igual"
  | "diferente"
  | "contem"
  | "preenchida"
  | "vazia"
  | "maior"
  | "menor";

export type RegraCondicao = {
  campo_id: string;
  operador: OperadorCondicao | string;
  valor: string;
};

export type CondicaoCampo = {
  logica: "e" | "ou";
  regras: RegraCondicao[];
};

/** Aceita o formato antigo ({campo_id, operador, valor}) e o novo ({logica, regras}). */
export function normalizarCondicao(cond: any): CondicaoCampo | null {
  if (!cond) return null;
  if (Array.isArray(cond.regras)) {
    const regras = (cond.regras as RegraCondicao[]).filter((r) => r && r.campo_id);
    if (!regras.length) return null;
    return { logica: cond.logica === "ou" ? "ou" : "e", regras };
  }
  if (cond.campo_id) {
    return {
      logica: "e",
      regras: [{ campo_id: cond.campo_id, operador: cond.operador ?? "igual", valor: cond.valor ?? "" }],
    };
  }
  return null;
}

const vazio = (v: any) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

const texto = (v: any) => (Array.isArray(v) ? v.join("|") : String(v ?? "")).toLowerCase();

function avaliarRegra(r: RegraCondicao, valores: Record<string, any>): boolean {
  const v = valores[r.campo_id];
  switch (r.operador) {
    case "preenchida":
      return !vazio(v);
    case "vazia":
      return vazio(v);
    case "contem":
      return Array.isArray(v)
        ? v.map((x) => String(x).toLowerCase()).includes(String(r.valor).toLowerCase())
        : texto(v).includes(String(r.valor).toLowerCase());
    case "maior":
      return Number(v) > Number(r.valor);
    case "menor":
      return Number(v) < Number(r.valor);
    case "diferente":
      return !vazio(v) && (Array.isArray(v) ? !v.includes(r.valor) : v !== r.valor);
    case "igual":
    default:
      return Array.isArray(v) ? v.includes(r.valor) : v === r.valor;
  }
}

/**
 * Um campo aparece quando as regras são satisfeitas (E/OU).
 * Recursivo: se algum campo de origem estiver oculto, este também fica oculto.
 */
export function campoVisivel(
  c: any,
  valores: Record<string, any>,
  byId: Record<string, any>,
  seen: Set<string> = new Set(),
): boolean {
  const cond = normalizarCondicao(c?.condicao);
  if (!cond) return true;
  if (seen.has(c.id)) return true; // proteção contra ciclo
  seen.add(c.id);

  const resultados = cond.regras.map((r) => {
    const origem = byId[r.campo_id];
    if (origem && !campoVisivel(origem, valores, byId, new Set(seen))) return false;
    return avaliarRegra(r, valores);
  });

  return cond.logica === "ou" ? resultados.some(Boolean) : resultados.every(Boolean);
}

/** Operadores disponíveis conforme o tipo do campo de origem. */
export function operadoresPara(tipo?: string): { v: OperadorCondicao; l: string }[] {
  const base: { v: OperadorCondicao; l: string }[] = [
    { v: "igual", l: "for igual a" },
    { v: "diferente", l: "for diferente de" },
  ];
  if (tipo === "escolha_unica" || tipo === "dropdown") {
    return [...base, { v: "preenchida", l: "estiver respondida" }, { v: "vazia", l: "estiver em branco" }];
  }
  if (tipo === "escolha_multipla") {
    return [
      { v: "contem", l: "incluir" },
      { v: "diferente", l: "não incluir" },
      { v: "preenchida", l: "estiver respondida" },
      { v: "vazia", l: "estiver em branco" },
    ];
  }
  if (tipo === "numero") {
    return [
      ...base,
      { v: "maior", l: "for maior que" },
      { v: "menor", l: "for menor que" },
      { v: "preenchida", l: "estiver respondida" },
      { v: "vazia", l: "estiver em branco" },
    ];
  }
  return [
    ...base,
    { v: "contem", l: "contiver" },
    { v: "preenchida", l: "estiver respondida" },
    { v: "vazia", l: "estiver em branco" },
  ];
}

/** Operadores que não precisam de valor. */
export const semValor = (op: string) => op === "preenchida" || op === "vazia";
