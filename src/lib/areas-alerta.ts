// Áreas de alerta do Macro I.A: cada área tem os seus encarregados e quem
// recebe os alertas deles (coordenador da área). A Diretoria é uma área com
// "todos". Um encarregado pode estar em mais de uma área — o alerta dele vai
// para os responsáveis de todas.
//
// Fica num JSON no storage (fotos-obras/config/areas-alerta.json), sem tabela
// nova. Enquanto não houver áreas salvas e ativas, vale o comportamento antigo:
// todo alerta vai para os 4 coordenadores de "Persona & Config".

type ClienteStorage = {
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: unknown }>;
      upload: (
        path: string,
        body: Blob,
        opts?: { contentType?: string; upsert?: boolean },
      ) => Promise<{ error: { message: string } | null }>;
      remove: (paths: string[]) => Promise<unknown>;
    };
  };
};

export const AREAS_ALERTA_PATH = "config/areas-alerta.json";

export type Destinatario = { nome: string; telefone: string };

export type ModoArea = "todos" | "lista" | "todos_exceto";

export type AreaAlerta = {
  id: string;
  nome: string;
  /** todos: todos os encarregados; lista: só os marcados; todos_exceto: todos menos os marcados. */
  modo: ModoArea;
  /** Telefones dos encarregados marcados (comparados pelos 8 últimos dígitos). */
  encarregados: string[];
  destinatarios: Destinatario[];
};

export type ConfigAreas = {
  ativo: boolean;
  areas: AreaAlerta[];
  atualizado_em?: string;
};

export const soDigitos = (t: string | null | undefined) => String(t ?? "").replace(/\D/g, "");

/** Mesmo telefone com ou sem 55 / com ou sem o 9 extra do WhatsApp. */
export const chaveTelefone = (t: string | null | undefined) => soDigitos(t).slice(-8);

export function areaIncluiEncarregado(area: AreaAlerta, telefone: string): boolean {
  const chave = chaveTelefone(telefone);
  const marcado = area.encarregados.some((e) => chaveTelefone(e) === chave);
  if (area.modo === "todos") return true;
  if (area.modo === "lista") return marcado;
  return !marcado; // todos_exceto
}

/** Tira repetidos (mesma pessoa em duas áreas recebe uma vez só). */
function semRepetidos(lista: Destinatario[]): Destinatario[] {
  const vistos = new Set<string>();
  return lista.filter((d) => {
    const chave = chaveTelefone(d.telefone);
    if (!chave || vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

type ConfigBot = Record<string, unknown> | null | undefined;

/** Os 4 coordenadores de "Persona & Config" (comportamento antigo). */
export function coordenadoresLegados(config: ConfigBot): Destinatario[] {
  const c = config ?? {};
  const pares: Array<[unknown, unknown]> = [
    [c.coordenador_telefone, c.coordenador_nome],
    [c.coordenador_telefone_2, c.coordenador_nome_2],
    [c.coordenador_telefone_3, c.coordenador_nome_3],
    [c.coordenador_telefone_4, c.coordenador_nome_4],
  ];
  return semRepetidos(
    pares
      .map(([t, n]) => ({ telefone: normalizarBr(String(t ?? "")), nome: String(n ?? "") }))
      .filter((d) => d.telefone),
  );
}

/** DDD + número sem o 55 ganha o código do Brasil. */
export function normalizarBr(tel: string): string {
  const t = soDigitos(tel);
  if (t.length >= 10 && t.length <= 11 && !t.startsWith("55")) return `55${t}`;
  return t;
}

export function areasAtivas(cfg: ConfigAreas | null | undefined): boolean {
  return Boolean(cfg?.ativo && cfg.areas?.length);
}

/**
 * Quem recebe o alerta deste encarregado. Com áreas ativas, os responsáveis
 * das áreas dele; se ele não cair em nenhuma (ou as áreas não tiverem
 * destinatário), volta para os coordenadores antigos — alerta nunca some.
 */
export function destinatariosDoAlerta(
  telefoneEncarregado: string,
  cfgAreas: ConfigAreas | null | undefined,
  configBot: ConfigBot,
): Destinatario[] {
  if (areasAtivas(cfgAreas)) {
    const lista = semRepetidos(
      cfgAreas!.areas
        .filter((a) => areaIncluiEncarregado(a, telefoneEncarregado))
        .flatMap((a) => a.destinatarios)
        .map((d) => ({ ...d, telefone: normalizarBr(d.telefone) })),
    );
    if (lista.length > 0) return lista;
  }
  return coordenadoresLegados(configBot);
}

export async function lerAreasAlerta(cliente: ClienteStorage): Promise<ConfigAreas | null> {
  try {
    const { data } = await cliente.storage.from("fotos-obras").download(AREAS_ALERTA_PATH);
    if (!data) return null;
    const cfg = JSON.parse(await data.text()) as ConfigAreas;
    if (!cfg || !Array.isArray(cfg.areas)) return null;
    return cfg;
  } catch {
    return null;
  }
}

export async function salvarAreasAlerta(cliente: ClienteStorage, cfg: ConfigAreas): Promise<void> {
  const bucket = cliente.storage.from("fotos-obras");
  await bucket.remove([AREAS_ALERTA_PATH]); // o bucket não permite sobrescrever
  const corpo = new Blob([JSON.stringify({ ...cfg, atualizado_em: new Date().toISOString() })], {
    type: "application/json",
  });
  const { error } = await bucket.upload(AREAS_ALERTA_PATH, corpo, {
    contentType: "application/json",
  });
  if (error) throw new Error(error.message);
}
