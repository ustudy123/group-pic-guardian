// Exportação das respostas de formulários em CSV, Excel (.xlsx) e PDF.
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type CampoExport = { id: string; rotulo: string; tipo: string };
export type RespostaExport = {
  id: string;
  created_at: string;
  respondente_nome?: string | null;
  respondente_email?: string | null;
  dados?: Record<string, any> | null;
  arquivos?: { campo_id: string; nome: string; path: string }[] | null;
};

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

/** PDF detalhado: cada resposta em bloco pergunta/resposta. */
export function exportarPDFDetalhado(
  titulo: string,
  campos: CampoExport[],
  respostas: RespostaExport[],
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  respostas.forEach((r, idx) => {
    if (idx > 0) doc.addPage();
    doc.setFontSize(14);
    doc.text(titulo, 40, 40);
    doc.setFontSize(9);
    doc.text(
      `${r.respondente_nome || r.respondente_email || "Anônimo"} — ${dataBR(r.created_at)}`,
      40,
      56,
    );
    const body: string[][] = [];
    for (const c of campos) {
      if (c.tipo === "secao") {
        body.push([c.rotulo.toUpperCase(), ""]);
        continue;
      }
      body.push([c.rotulo, valorTexto(c, r) || "—"]);
    }
    autoTable(doc, {
      body,
      startY: 70,
      styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" },
      columnStyles: { 0: { cellWidth: 180, fontStyle: "bold" }, 1: { cellWidth: "auto" } },
      margin: { left: 40, right: 40 },
    });
  });
  doc.save(`${titulo}-detalhado.pdf`);
}
