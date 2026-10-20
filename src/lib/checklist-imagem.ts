// Imagem do checklist para mandar no grupo do encarregado (substitui o print
// da coluna da planilha). Desenhada em canvas, no navegador.

import { contarStatus, type ChecklistDia, type StatusItem } from "@/lib/checklist-fotos";

const CORES: Record<StatusItem, { fundo: string; texto: string; rotulo: string }> = {
  enviado: { fundo: "#c9efd3", texto: "#156b2e", rotulo: "✓ Enviado" },
  pendente: { fundo: "#ffcccc", texto: "#9b1c1c", rotulo: "✗ Pendente" },
  na: { fundo: "#fff1a8", texto: "#7a5b00", rotulo: "NA" },
  inutilizavel: { fundo: "#cfe0ff", texto: "#1d4ed8", rotulo: "● Não utilizável" },
};

const FONTE = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function dataPorExtenso(data: string): string {
  const d = new Date(`${data}T12:00:00-03:00`);
  const s = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const horaBrasilia = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

function quebrar(ctx: CanvasRenderingContext2D, texto: string, largura: number): string[] {
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(teste).width <= largura || !atual) atual = teste;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.slice(0, 3);
}

function retangulo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Gera o PNG do checklist. Devolve o arquivo e o base64 (para enviar no grupo). */
export async function gerarImagemChecklist(c: ChecklistDia): Promise<{ blob: Blob; base64: string }> {
  const ESCALA = 2;
  const L = 540;
  const M = 18;
  const COL_STATUS = 150;
  const larguraNome = L - M * 2 - COL_STATUS - 16;

  const medidor = document.createElement("canvas").getContext("2d")!;
  medidor.font = `14px ${FONTE}`;
  const linhas = c.itens.map((i) => quebrar(medidor, i.nome, larguraNome));
  const alturas = linhas.map((l) => Math.max(30, 12 + l.length * 18));
  const ALT_TOPO = 92;
  const ALT_RESUMO = 34;
  const altura = M + ALT_TOPO + 10 + ALT_RESUMO + 10 + alturas.reduce((a, b) => a + b, 0) + 54;

  const canvas = document.createElement("canvas");
  canvas.width = L * ESCALA;
  canvas.height = altura * ESCALA;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ESCALA, ESCALA);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, L, altura);
  ctx.textBaseline = "middle";

  // Topo: encarregado, tipo e data
  let y = M;
  ctx.fillStyle = "#12304f";
  retangulo(ctx, M, y, L - M * 2, ALT_TOPO, 10);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `bold 11px ${FONTE}`;
  ctx.fillText("CHECKLIST DE FOTOS · RFO", M + 14, y + 18);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 20px ${FONTE}`;
  const titulo = `${c.encarregado_nome.toUpperCase()} — ${c.tipo_nome}`;
  ctx.fillText(quebrar(ctx, titulo, L - M * 2 - 28)[0], M + 14, y + 44);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `13px ${FONTE}`;
  ctx.fillText(
    `${dataPorExtenso(c.data)} · atualizado às ${horaBrasilia(c.atualizado_em)}`,
    M + 14,
    y + 70,
  );
  y += ALT_TOPO + 10;

  // Totais
  const n = contarStatus(c);
  const caixas: [string, string, string][] = [
    [`${n.enviado} enviada(s)`, "#d9f2df", "#156b2e"],
    [`${n.pendente} pendente(s)`, "#ffd6d6", "#9b1c1c"],
    [`${n.na} não se aplica`, "#fff3bf", "#7a5b00"],
    [`${n.inutilizavel} não utilizável`, "#dbe8ff", "#1d4ed8"],
  ];
  const lc = (L - M * 2 - 18) / 4;
  caixas.forEach(([t, fundo, cor], k) => {
    const x = M + k * (lc + 6);
    ctx.fillStyle = fundo;
    retangulo(ctx, x, y, lc, ALT_RESUMO, 8);
    ctx.fill();
    ctx.fillStyle = cor;
    ctx.font = `bold 12px ${FONTE}`;
    ctx.textAlign = "center";
    ctx.fillText(t, x + lc / 2, y + ALT_RESUMO / 2);
    ctx.textAlign = "left";
  });
  y += ALT_RESUMO + 10;

  // Tabela
  const xStatus = L - M - COL_STATUS;
  c.itens.forEach((item, k) => {
    const h = alturas[k];
    const cor = CORES[item.status];
    ctx.fillStyle =
      item.status === "pendente" ? "#fff5f5" : item.status === "inutilizavel" ? "#f2f6ff" : "#ffffff";
    ctx.fillRect(M, y, xStatus - M, h);
    ctx.fillStyle = cor.fundo;
    ctx.fillRect(xStatus, y, COL_STATUS, h);
    ctx.strokeStyle = "#d5dbe1";
    ctx.lineWidth = 1;
    ctx.strokeRect(M + 0.5, y + 0.5, L - M * 2 - 1, h);
    ctx.beginPath();
    ctx.moveTo(xStatus + 0.5, y);
    ctx.lineTo(xStatus + 0.5, y + h);
    ctx.stroke();

    ctx.fillStyle = "#1c2530";
    ctx.font = `14px ${FONTE}`;
    const ls = linhas[k];
    const topo = y + h / 2 - ((ls.length - 1) * 18) / 2;
    ls.forEach((l, j) => ctx.fillText(l, M + 9, topo + j * 18));

    ctx.fillStyle = cor.texto;
    ctx.font = `bold 14px ${FONTE}`;
    ctx.textAlign = "center";
    ctx.fillText(cor.rotulo, xStatus + COL_STATUS / 2, y + h / 2);
    ctx.textAlign = "left";
    y += h;
  });

  // Legenda
  ctx.fillStyle = "#5b6875";
  ctx.font = `11px ${FONTE}`;
  ctx.fillText("✓ Enviado   ✗ Pendente (falta enviar)   NA Não se aplica   ● Não utilizável (enviar de novo)", M, y + 20);
  ctx.textAlign = "right";
  ctx.fillText("Macro Ambiental", L - M, y + 36);
  ctx.textAlign = "left";

  const blob: Blob = await new Promise((ok, falha) =>
    canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível gerar a imagem."))), "image/png"),
  );
  const base64 = canvas.toDataURL("image/png").split(",")[1] ?? "";
  return { blob, base64 };
}
