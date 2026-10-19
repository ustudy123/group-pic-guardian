// Checklist de fotos do dia (pedido da equipe de RFO, reunião de 16/10/2026).
//
// Substitui a planilha "Checklist de Fotos": na pasta do dia de cada
// encarregado, a equipe administrativa escolhe o tipo de serviço do dia e
// marca cada etapa como Enviado / Pendente / Não se aplica (sem classificar
// foto por foto). Depois gera uma imagem e manda no grupo do encarregado.
//
// Fica em JSON no storage (sem tabela nova):
//   checklist-fotos/tipos.json                      tipos e itens (editáveis)
//   checklist-fotos/dias/AAAA-MM-DD/{encarregado}.json   checklist do dia
//   checklist-fotos/encarregados/{encarregado}.json      último tipo usado

export type StatusItem = "enviado" | "pendente" | "na";

export const STATUS: { valor: StatusItem; rotulo: string; curto: string }[] = [
  { valor: "enviado", rotulo: "Enviado", curto: "✓" },
  { valor: "pendente", rotulo: "Pendente", curto: "✗" },
  { valor: "na", rotulo: "Não se aplica", curto: "NA" },
];

export type ItemTipo = { id: string; nome: string };
export type TipoChecklist = { id: string; nome: string; itens: ItemTipo[] };

/** Checklist salvo de um encarregado num dia (guarda os nomes: o histórico não muda se o tipo for editado). */
export type ChecklistDia = {
  encarregado_id: string;
  encarregado_nome: string;
  data: string; // AAAA-MM-DD
  tipo_id: string;
  tipo_nome: string;
  itens: { id: string; nome: string; status: StatusItem }[];
  atualizado_em: string;
  atualizado_por: string | null;
  enviado_grupo_em?: string | null;
};

export const PASTA_CHECKLIST = "checklist-fotos";
export const caminhoTipos = () => `${PASTA_CHECKLIST}/tipos.json`;
export const caminhoDia = (data: string, encarregadoId: string) =>
  `${PASTA_CHECKLIST}/dias/${data}/${encarregadoId}.json`;
export const caminhoUltimoTipo = (encarregadoId: string) =>
  `${PASTA_CHECKLIST}/encarregados/${encarregadoId}.json`;

const slug = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const tipo = (nome: string, itens: string[]): TipoChecklist => {
  const id = slug(nome);
  return { id, nome, itens: itens.map((i) => ({ id: `${id}:${slug(i)}`, nome: i })) };
};

/** Os 5 tipos da planilha "10 - OUTUBRO - Checklist de Fotos". */
export const TIPOS_PADRAO: TipoChecklist[] = [
  tipo("Ligações Engenharia", [
    "Localização",
    "Mapa de Rede de Água",
    "DDS - Equipe",
    "Sinalização",
    "Banheiro - Longe",
    "Banheiro - Dentro",
    "Checklist Compactador",
    "Checklist Moto bomba",
  ]),
  tipo("Redes Engenharia", [
    "Nota de Serviço",
    "Localização",
    "DDS - Reunião da equipe",
    "Sinalização",
    "Banheiro - Longe",
    "Banheiro - Dentro",
    "Mapa de Rede de Água",
    "Escavando Vala/Vala Aberta",
    "Assentamento de Tubo",
    "Compactação 1ª Camada",
    "Compactação 2ª Camada",
    "Compactação 3ª Camada",
    "Vala 25cm para receber base",
    "Espalhamento de material de base",
    "Compactação de material de base",
    "Construção de PV",
    "Acabamento do PV",
    "Vala finalizada",
    "Execução de Limpeza",
    "Passagem segura",
    "Checklist Compactador",
    "Checklist Moto bomba",
    "Foto de Drenagem (Boca de lobo)",
  ]),
  tipo("Repavimentação e Pós Obra", [
    "Localização",
    "DDS - Reunião de Equipe",
    "Área de Vivência",
    "Sinalização",
    "Banheiro - Dentro",
    "Banheiro - Fora",
    "Reparos",
    "Limpeza",
    "Regularização de Base e Limpeza",
  ]),
  tipo("Asfalto", [
    "Localização",
    "DDS - Reunião de Equipe",
    "Área de Vivência",
    "Sinalização",
    "Banheiro - Fora",
    "Banheiro - Dentro",
    "Aplicação de Emulsão",
    "Medição de Temperatura",
    "Aplicação de Massa Asfáltica",
    "Compactação com rolo compressor",
    "Asfalto Provisório",
    "Asfalto Finalizado",
    "Limpeza",
    "Checklist Rolo compactador",
    "Foto do ticket de massa asfáltica",
    "Foto do ticket de retirada de emulsão RR",
  ]),
  tipo("Remoção de Rocha", [
    "Localização",
    "DDS - Reunião de Equipe",
    "Área de Vivência",
    "Sinalização",
    "Banheiro - Dentro",
    "Banheiro - Fora",
    "Rompimento de rocha",
    "Reparos",
    "Limpeza - Local onde foi feito o Reparo",
  ]),
];

/** Id novo para item/tipo criado no painel (não muda se o nome for editado). */
export const novoId = (prefixo: string) =>
  `${prefixo}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Checklist novo de um tipo: tudo começa pendente, como na planilha. */
export function checklistNovo(
  tipo: TipoChecklist,
  enc: { id: string; nome: string },
  data: string,
  anterior?: ChecklistDia | null,
): ChecklistDia {
  // Trocou o tipo no meio do dia: o que já foi marcado em itens de mesmo nome continua.
  const marcado = new Map(
    (anterior?.itens ?? []).map((i) => [slug(i.nome), i.status] as const),
  );
  return {
    encarregado_id: enc.id,
    encarregado_nome: enc.nome,
    data,
    tipo_id: tipo.id,
    tipo_nome: tipo.nome,
    itens: tipo.itens.map((i) => ({
      id: i.id,
      nome: i.nome,
      status: marcado.get(slug(i.nome)) ?? "pendente",
    })),
    atualizado_em: new Date().toISOString(),
    atualizado_por: null,
    enviado_grupo_em: anterior?.enviado_grupo_em ?? null,
  };
}

export function contarStatus(c: Pick<ChecklistDia, "itens">) {
  const n = { enviado: 0, pendente: 0, na: 0 };
  for (const i of c.itens) n[i.status]++;
  return n;
}

/**
 * JID para enviar mensagem no grupo. Encarregados antigos têm o grupo gravado
 * no formato "...-group" (Z-API); a UazAPI precisa de "...@g.us".
 */
export function jidParaEnvio(grupo: string | null | undefined): string | null {
  const v = String(grupo ?? "").trim();
  if (!v) return null;
  if (v.endsWith("@g.us")) return v;
  return `${v.replace(/-group$/, "")}@g.us`;
}
