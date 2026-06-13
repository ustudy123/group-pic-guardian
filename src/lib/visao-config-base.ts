// Tipos, conteúdo-base (planilha ANÁLISE + Manual de Fotos) e conversões
// para os campos estruturados de configuração da Visão IA.
// Pure TS, sem dependências de servidor — usado pela UI e pelo analyzer.

export type AprendizadoRow = {
  acao: string;
  descricao: string;
  requisitos: string;
  rfo: boolean;
};

export type ManualRow = {
  grupo: string; // "Checklist" | "Ligação" (ou outro)
  etapa: string;
  orientacao: string;
};

// ---- Conteúdo base (vindo da planilha ANÁLISE) ----
export const APRENDIZADO_BASE: AprendizadoRow[] = [
  { acao: "Nota de Serviço", descricao: "Foto da Nota de Serviço do dia (documento em Excel, entregue impresso pela engenharia).", requisitos: "", rfo: false },
  { acao: "Localização", descricao: "Manda a localização para receber o mapa de água.", requisitos: "", rfo: false },
  { acao: "DDS — Reunião da equipe", descricao: "Foto para comprovar atendimento à regra de segurança.", requisitos: "Todos uniformizados, SEM CHINELO, SEM BONÉ.", rfo: true },
  { acao: "Sinalização", descricao: "Foto para comprovação.", requisitos: "Sinalizar a obra de forma adequada (cones, placas, informações visíveis, cone com faixa refletiva).", rfo: true },
  { acao: "Banheiro — Longe", descricao: "Foto do banheiro químico tirada de longe.", requisitos: "Somente a foto de longe, ficando claro que é um banheiro.", rfo: false },
  { acao: "Banheiro — Dentro", descricao: "Foto interna do banheiro.", requisitos: "Visível: lixeira com tampa, pia, torneira, papel, sabão.", rfo: false },
  { acao: "Mapa de Rede de Água", descricao: "A empresa que envia (não precisa).", requisitos: "", rfo: false },
  { acao: "Escavando Vala / Vala Aberta", descricao: "Foto com a máquina escavando.", requisitos: "Sem rompimento de mangueira de água (ideal não enviar foto com mangueira estourada/rompida).", rfo: true },
  { acao: "Assentamento de Tubo", descricao: "Foto do tubo assentado na vala.", requisitos: "Sem rompimento de mangueira; afastamento de materiais nas laterais (no limite da vala); sem água dentro da vala; em vala profunda com pessoa, não pode haver ninguém na foto nem pisando no tubo.", rfo: true },
  { acao: "Compactação 1ª Camada", descricao: "Foto para comprovação.", requisitos: "Funcionário com EPI (luva, botina, capacete etc.); luva anti-vibração.", rfo: true },
  { acao: "Compactação 2ª Camada", descricao: "Foto para comprovação.", requisitos: "Funcionário com EPI (luva, botina, capacete etc.); luva anti-vibração.", rfo: true },
  { acao: "Compactação 3ª Camada", descricao: "Foto para comprovação.", requisitos: "Funcionário com EPI (luva, botina, capacete etc.); luva anti-vibração.", rfo: true },
  { acao: "Vala 25cm para receber base", descricao: "Foto para comprovação.", requisitos: "Vala que sofreu compactação do equipamento.", rfo: true },
  { acao: "Espalhamento de material de base", descricao: "Foto para comprovação.", requisitos: "Solo-brita.", rfo: true },
  { acao: "Compactação de material de base", descricao: "Foto para comprovação.", requisitos: "Reconhecer o tipo de material (material de base). Se houver funcionário na foto, não pode estar sem EPI de forma alguma.", rfo: true },
  { acao: "Construção de PV", descricao: "Foto para comprovação.", requisitos: "Tem que ter o anel de PV (concreto).", rfo: true },
  { acao: "Acabamento do PV", descricao: "Foto interna do PV.", requisitos: "Canaleta de fundo com os acabamentos das junções do anel, finalizada em argamassa.", rfo: true },
  { acao: "Vala finalizada", descricao: "Foto para comprovação.", requisitos: "Obra finalizada e limpa; não pode haver calçada quebrada; mostrar a obra concluída.", rfo: true },
  { acao: "Limpeza", descricao: "Foto para comprovação.", requisitos: "Equipe fazendo a limpeza, tirando os excessos, varrendo a rua etc.", rfo: true },
  { acao: "Passagem segura", descricao: "Foto para comprovação.", requisitos: "Caminho sinalizado para o pedestre passar.", rfo: false },
  { acao: "Checklist Compactador", descricao: "Foto para comprovação.", requisitos: "Compactador em perfeita condição de utilização.", rfo: false },
  { acao: "Checklist Moto-bomba", descricao: "Foto para comprovação.", requisitos: "Moto-bomba em perfeita condição de utilização.", rfo: false },
  { acao: "Drenagem (Boca de lobo)", descricao: "Foto para comprovação.", requisitos: "Só ocorre quando a pessoa está trabalhando perto de uma drenagem.", rfo: false },
];

// ---- Conteúdo base (vindo do Manual de Fotos PDF) ----
export const MANUAL_BASE: ManualRow[] = [
  { grupo: "Checklist", etapa: "Nota de Serviço", orientacao: "Enviar a foto da nota que estão executando." },
  { grupo: "Checklist", etapa: "Localização", orientacao: "Enviar a localização da equipe assim que chegar na frente de serviço." },
  { grupo: "Checklist", etapa: "DDS — Reunião de Equipe", orientacao: "Foto da equipe na hora do DDS. Não é permitido nenhum gesto com as mãos e todos devem estar uniformizados." },
  { grupo: "Checklist", etapa: "Sinalização", orientacao: "Foto da sinalização no local. Observar se as placas estão corretas e os cones estão com todas as fitas." },
  { grupo: "Checklist", etapa: "Banheiro — Dentro", orientacao: "Foto da parte de DENTRO do banheiro, mostrando todos os itens: porta papel toalha, porta sabão, pia, porta papel higiênico, vaso com tampa e lixeira com tampa." },
  { grupo: "Checklist", etapa: "Banheiro — Longe", orientacao: "Foto de LONGE onde dê para ver toda a parte externa do banheiro." },
  { grupo: "Checklist", etapa: "Escavando Vala / Vala Aberta", orientacao: "Foto da máquina escavando ou da vala já aberta com o devido afastamento do solo. ATENÇÃO ao enviar foto com colaborador dentro da vala no momento da escavação." },
  { grupo: "Checklist", etapa: "Assentamento de Tubo", orientacao: "Tubo no meio da vala, com cuidado na borda. ATENÇÃO a água no fundo da vala/tubo. Não enviar foto com colaborador em cima do tubo." },
  { grupo: "Checklist", etapa: "Compactação (1ª, 2ª e 3ª camada)", orientacao: "Foto da compactação do solo com o devido afastamento de solo." },
  { grupo: "Checklist", etapa: "Vala de 25cm para receber base", orientacao: "Foto da vala com 25cm pronta para receber a base." },
  { grupo: "Checklist", etapa: "Espalhamento de material para base", orientacao: "Foto do espalhamento do material de base (solo-brita)." },
  { grupo: "Checklist", etapa: "Construção de PV", orientacao: "Foto da construção do PV. ATENÇÃO ao enviar foto com o PV com água no fundo." },
  { grupo: "Checklist", etapa: "Acabamento de PV", orientacao: "Não utilizar barro no acabamento do PV (pode causar problemas na rede do morador com o tempo)." },
  { grupo: "Checklist", etapa: "Vala finalizada mostrando o PV", orientacao: "Fotos do PV finalizado e com a limpeza do local feita." },
  { grupo: "Ligação", etapa: "Observação geral", orientacao: "Todas as fotos com timestamp (data, hora, cidade, bairro, rua). Fachada, vala aberta, interligação, vala fechada, teste de corante, PI e PV devem mostrar a placa com o código do hidrômetro, a matrícula ou o CPF." },
  { grupo: "Ligação", etapa: "Código do Hidrômetro", orientacao: "Foto onde dê para ver o código do hidrômetro." },
  { grupo: "Ligação", etapa: "Matrícula (talão de água)", orientacao: "Em caso de ligação pelo talão de água mais recente do morador: foto do talão mostrando a matrícula e o nome do cliente." },
  { grupo: "Ligação", etapa: "Fachada do Imóvel", orientacao: "Foto mostrando toda a frente do imóvel; se houver número, ele deve aparecer." },
  { grupo: "Ligação", etapa: "Vala Aberta", orientacao: "Mostrar o comprimento do tubo na vala e o local da ligação, coerente com a fachada (parte da fachada, muro, calçada)." },
  { grupo: "Ligação", etapa: "Interligação", orientacao: "Evidenciar o tubo do cliente conectado ao tubo da rede de esgoto, ou os dois se encontrando na caixa de passagem." },
  { grupo: "Ligação", etapa: "Vala Fechada", orientacao: "Vala totalmente finalizada, PI concretado (se for o caso), nivelada com a rua/calçada. ATENÇÃO à limpeza e ao recolhimento de materiais (mangueiras, pedaços de tubo, curvas, ferramentas, cones)." },
  { grupo: "Ligação", etapa: "Teste de Corante", orientacao: "Corante no vaso sanitário do morador, com descarga. A foto deve mostrar o vaso com o corante e características do banheiro (azulejo, piso, objetos)." },
  { grupo: "Ligação", etapa: "PI — Poço de Inspeção", orientacao: "Foto interna do PI mostrando o corante passando, evidenciando que a ligação está ativa." },
  { grupo: "Ligação", etapa: "PV — Poço de Visita", orientacao: "Foto interna do PV mostrando o corante passando, evidenciando que a ligação está ativa." },
];

// ---- Parse (carrega o que está salvo: JSON novo, tabela markdown antiga, ou vazio) ----
export function parseAprendizado(raw: string | null | undefined): AprendizadoRow[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) {
      return j
        .map((r: any) => ({
          acao: String(r?.acao ?? "").trim(),
          descricao: String(r?.descricao ?? "").trim(),
          requisitos: String(r?.requisitos ?? "").trim(),
          rfo: Boolean(r?.rfo),
        }))
        .filter((r) => r.acao || r.descricao || r.requisitos);
    }
  } catch {
    /* não é JSON — tenta tabela markdown */
  }
  if (text.includes("|")) {
    const linhas = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|") && !/^\|[\s:|-]+\|?$/.test(l));
    const rows: AprendizadoRow[] = [];
    for (const [i, l] of linhas.entries()) {
      const cols = l.split("|").map((c) => c.trim());
      const cells = cols.slice(1, cols.length - 1).length ? cols.slice(1, -1) : cols.filter(Boolean);
      if (i === 0 && /a[çc][aã]o/i.test(cells[0] ?? "")) continue; // pula cabeçalho
      if (!cells[0]) continue;
      rows.push({
        acao: cells[0] ?? "",
        descricao: cells[1] ?? "",
        requisitos: cells[2] ?? "",
        rfo: /sim/i.test(cells[3] ?? ""),
      });
    }
    if (rows.length) return rows;
  }
  return [];
}

export function parseManual(raw: string | null | undefined): ManualRow[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) {
      return j
        .map((r: any) => ({
          grupo: String(r?.grupo ?? "Geral").trim() || "Geral",
          etapa: String(r?.etapa ?? "").trim(),
          orientacao: String(r?.orientacao ?? "").trim(),
        }))
        .filter((r) => r.etapa || r.orientacao);
    }
  } catch {
    /* não é JSON — tenta linhas "NOME: texto" */
  }
  const rows: ManualRow[] = [];
  for (const linha of text.split("\n")) {
    const l = linha.replace(/^[-•\s]+/, "").trim();
    if (!l) continue;
    const m = l.match(/^([^:]{2,60}):\s*(.+)$/);
    if (m) rows.push({ grupo: "Geral", etapa: m[1].trim(), orientacao: m[2].trim() });
    else if (rows.length) rows[rows.length - 1].orientacao += " " + l;
  }
  return rows;
}

// ---- Render para o prompt da IA (texto limpo a partir das linhas) ----
export function renderAprendizadoParaPrompt(raw: string | null | undefined): string {
  const rows = parseAprendizado(raw);
  if (!rows.length) return (raw ?? "").trim();
  return rows
    .map((r) => {
      const partes = [r.descricao, r.requisitos ? `Requisitos: ${r.requisitos}` : ""].filter(Boolean);
      return `- ${r.acao}${r.rfo ? " [entra no RFO]" : ""}: ${partes.join(" — ")}`;
    })
    .join("\n");
}

export function renderManualParaPrompt(raw: string | null | undefined): string {
  const rows = parseManual(raw);
  if (!rows.length) return (raw ?? "").trim();
  const porGrupo: Record<string, ManualRow[]> = {};
  for (const r of rows) (porGrupo[r.grupo] ||= []).push(r);
  return Object.entries(porGrupo)
    .map(([grupo, lista]) => {
      const itens = lista.map((r) => `- ${r.etapa}: ${r.orientacao}`).join("\n");
      return `## ${grupo}\n${itens}`;
    })
    .join("\n\n");
}

export function serializar(rows: unknown): string {
  return JSON.stringify(rows);
}
