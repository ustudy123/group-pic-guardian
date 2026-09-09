// Exportação das respostas de formulários em CSV, Excel (.xlsx) e PDF.
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type CampoExport = { id: string; rotulo: string; tipo: string };
export type ArquivoResposta = {
  campo_id: string;
  nome: string;
  path: string;
  tipo?: string | null;
};
export type RespostaExport = {
  id: string;
  created_at: string;
  respondente_nome?: string | null;
  respondente_email?: string | null;
  dados?: Record<string, any> | null;
  arquivos?: ArquivoResposta[] | null;
};

/** Recebe os caminhos no storage e devolve as URLs assinadas (path -> url). */
export type ResolverUrls = (paths: string[]) => Promise<Record<string, string>>;

const ehImagem = (a: ArquivoResposta) =>
  (a.tipo ?? "").startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(a.nome ?? "");

const dataBR = (s: string) => {
  try {
    return new Date(s).toLocaleString("pt-BR");
  } catch {
    return s;
  }
};

const valorTexto = (
  campo: CampoExport,
  resposta: RespostaExport,
): string => {
  if (campo.tipo === "arquivo" || campo.tipo === "foto") {
    const arquivos = (resposta.arquivos ?? []).filter((a) => a.campo_id === campo.id);
    return arquivos.map((a) => a.nome).join("; ");
  }
  const v = resposta.dados?.[campo.id];
  if (Array.isArray(v)) return v.join("; ");
  return v === undefined || v === null ? "" : String(v);
};

function montarTabela(campos: CampoExport[], respostas: RespostaExport[]) {
  const exportaveis = campos.filter((c) => c.tipo !== "secao");
  const header = ["Data", "Respondente", ...exportaveis.map((c) => c.rotulo)];
  const linhas = respostas.map((r) => [
    dataBR(r.created_at),
    r.respondente_nome || r.respondente_email || "—",
    ...exportaveis.map((c) => valorTexto(c, r)),
  ]);
  return { header, linhas, exportaveis };
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportarCSV(titulo: string, campos: CampoExport[], respostas: RespostaExport[]) {
  const { header, linhas } = montarTabela(campos, respostas);
  const csv = [header, ...linhas]
    .map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  baixar(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), `${titulo}.csv`);
}

export function exportarExcel(titulo: string, campos: CampoExport[], respostas: RespostaExport[]) {
  const { header, linhas } = montarTabela(campos, respostas);
  const ws = XLSX.utils.aoa_to_sheet([header, ...linhas]);
  ws["!cols"] = header.map((h, i) => ({
    wch: Math.min(
      50,
      Math.max(12, h.length + 2, ...linhas.map((l) => String(l[i] ?? "").length + 2)),
    ),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Respostas");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  baixar(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${titulo}.xlsx`,
  );
}

/** PDF em tabela: uma linha por resposta. */
export function exportarPDFTabela(
  titulo: string,
  campos: CampoExport[],
  respostas: RespostaExport[],
) {
  const { header, linhas } = montarTabela(campos, respostas);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(titulo, 40, 40);
  doc.setFontSize(9);
  doc.text(
    `${respostas.length} resposta(s) — gerado em ${new Date().toLocaleString("pt-BR")}`,
    40,
    56,
  );
  autoTable(doc, {
    head: [header],
    body: linhas,
    startY: 70,
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [37, 99, 235] },
    margin: { left: 40, right: 40 },
  });
  doc.save(`${titulo}.pdf`);
}

/**
 * Baixa a imagem e devolve em JPEG já redimensionado. O redimensionamento é o
 * que mantém o PDF utilizável: foto de obra costuma ter 3–5 MB, e um relatório
 * com dezenas delas em tamanho original passaria de 100 MB.
 */
async function baixarComoJpeg(
  url: string,
  ladoMax = 1000,
  qualidade = 0.72,
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();

    let largura = 0;
    let altura = 0;
    let fonte: CanvasImageSource;

    if (typeof createImageBitmap === "function") {
      // imageOrientation respeita o EXIF — sem isso, foto de celular sai deitada
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      largura = bitmap.width;
      altura = bitmap.height;
      fonte = bitmap;
    } else {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = URL.createObjectURL(blob);
      });
      largura = img.naturalWidth;
      altura = img.naturalHeight;
      fonte = img;
    }
    if (!largura || !altura) return null;

    const escala = Math.min(1, ladoMax / Math.max(largura, altura));
    const w = Math.round(largura * escala);
    const h = Math.round(altura * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff"; // PNG com transparência vira fundo branco no JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(fonte, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL("image/jpeg", qualidade), w, h };
  } catch {
    return null;
  }
}

/**
 * PDF detalhado: cada resposta em bloco pergunta/resposta, com as FOTOS
 * embutidas ao final (antes vinha só o nome do arquivo).
 *
 * `resolverUrls` é opcional: sem ele o PDF sai igual ao de antes, só com os
 * nomes — assim a função continua utilizável fora da tela de respostas.
 */
export async function exportarPDFDetalhado(
  titulo: string,
  campos: CampoExport[],
  respostas: RespostaExport[],
  resolverUrls?: ResolverUrls,
  onProgresso?: (feitas: number, total: number) => void,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const margem = 40;

  // Uma única chamada para assinar todas as fotos de todas as respostas
  let urls: Record<string, string> = {};
  const todasImagens = respostas.flatMap((r) => (r.arquivos ?? []).filter(ehImagem));
  if (resolverUrls && todasImagens.length > 0) {
    urls = await resolverUrls(todasImagens.map((a) => a.path));
  }

  let baixadas = 0;
  for (let idx = 0; idx < respostas.length; idx++) {
    const r = respostas[idx];
    if (idx > 0) doc.addPage();
    doc.setFontSize(14);
    doc.text(titulo, margem, 40);
    doc.setFontSize(9);
    doc.text(
      `${r.respondente_nome || r.respondente_email || "Anônimo"} — ${dataBR(r.created_at)}`,
      margem,
      56,
    );

    const body: string[][] = [];
    for (const c of campos) {
      if (c.tipo === "secao") {
        body.push([c.rotulo.toUpperCase(), ""]);
        continue;
      }
      // Nos campos de foto o nome do arquivo não diz nada — as imagens vêm
      // logo abaixo, então aqui fica só a contagem.
      if ((c.tipo === "foto" || c.tipo === "arquivo") && resolverUrls) {
        const doCampo = (r.arquivos ?? []).filter((a) => a.campo_id === c.id);
        const imagens = doCampo.filter(ehImagem).length;
        const outros = doCampo.length - imagens;
        const partes = [
          imagens ? `${imagens} foto${imagens > 1 ? "s" : ""}` : "",
          outros ? `${outros} arquivo${outros > 1 ? "s" : ""}` : "",
        ].filter(Boolean);
        body.push([c.rotulo, partes.length ? partes.join(" + ") : "—"]);
        continue;
      }
      body.push([c.rotulo, valorTexto(c, r) || "—"]);
    }

    autoTable(doc, {
      body,
      startY: 70,
      styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" },
      columnStyles: { 0: { cellWidth: 180, fontStyle: "bold" }, 1: { cellWidth: "auto" } },
      margin: { left: margem, right: margem },
    });

    if (!resolverUrls) continue;

    // --- Fotos desta resposta, agrupadas por pergunta ---
    let y = ((doc as any).lastAutoTable?.finalY ?? 70) + 22;
    const novaPagina = () => {
      doc.addPage();
      y = margem;
    };

    for (const c of campos) {
      if (c.tipo !== "foto" && c.tipo !== "arquivo") continue;
      const imagens = (r.arquivos ?? []).filter((a) => a.campo_id === c.id && ehImagem(a));
      if (imagens.length === 0) continue;

      if (y + 40 > alturaPagina - margem) novaPagina();
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(c.rotulo, margem, y);
      doc.setFont("helvetica", "normal");
      y += 14;

      // duas fotos por linha
      const colunas = 2;
      const espaco = 12;
      const larguraCelula = (larguraPagina - margem * 2 - espaco * (colunas - 1)) / colunas;
      let coluna = 0;
      let alturaLinha = 0;

      for (const arq of imagens) {
        const url = urls[arq.path];
        baixadas++;
        onProgresso?.(baixadas, todasImagens.length);
        if (!url) continue;
        const img = await baixarComoJpeg(url);
        if (!img) continue;

        const escala = larguraCelula / img.w;
        const alturaDesenho = Math.min(img.h * escala, 320);
        const larguraDesenho = (alturaDesenho / img.h) * img.w;

        if (coluna === 0 && y + alturaDesenho > alturaPagina - margem) novaPagina();

        const x = margem + coluna * (larguraCelula + espaco);
        try {
          doc.addImage(img.dataUrl, "JPEG", x, y, larguraDesenho, alturaDesenho);
        } catch {
          /* imagem corrompida: pula sem derrubar o relatório inteiro */
        }
        alturaLinha = Math.max(alturaLinha, alturaDesenho);
        coluna++;
        if (coluna >= colunas) {
          y += alturaLinha + espaco;
          coluna = 0;
          alturaLinha = 0;
        }
      }
      if (coluna > 0) y += alturaLinha + espaco; // fecha a linha incompleta
    }

    // Arquivos que não são imagem continuam listados pelo nome
    const outros = (r.arquivos ?? []).filter((a) => !ehImagem(a));
    if (outros.length) {
      if (y + 30 > alturaPagina - margem) novaPagina();
      doc.setFontSize(9);
      doc.text(`Outros anexos: ${outros.map((a) => a.nome).join(", ")}`, margem, y, {
        maxWidth: larguraPagina - margem * 2,
      });
    }
  }

  doc.save(`${titulo}-detalhado.pdf`);
}
