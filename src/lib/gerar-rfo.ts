import { jsPDF } from "jspdf";

type FotoRFO = {
  storage_url: string | null;
  caption: string | null;
  data_envio: string | null;
};

async function loadImage(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = dataUrl;
    });
    return { dataUrl, w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

function fmtHora(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function gerarRFO(opts: {
  encarregado: string;
  dataPasta: string; // YYYY-MM-DD
  fotos: FotoRFO[];
}) {
  const { encarregado, dataPasta, fotos } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;

  const [y, m, d] = dataPasta.split("-");
  const dataBR = `${d}/${m}/${y}`;

  const drawHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("RELATÓRIO FOTOGRÁFICO DE OBRA — RFO", pageW / 2, margin, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Encarregado: ${encarregado}`, margin, margin + 8);
    doc.text(`Data: ${dataBR}`, pageW - margin, margin + 8, { align: "right" });
    doc.setLineWidth(0.3);
    doc.line(margin, margin + 11, pageW - margin, margin + 11);
  };

  const drawFooter = (page: number, total: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Página ${page} de ${total}`, pageW / 2, pageH - 8, { align: "center" });
    doc.setTextColor(0);
  };

  // Pre-load images
  const loaded = await Promise.all(
    fotos.map((f) => (f.storage_url ? loadImage(f.storage_url) : Promise.resolve(null)))
  );

  const perPage = 2;
  const totalPages = Math.max(1, Math.ceil(fotos.length / perPage));
  const slotTop = margin + 16;
  const slotH = (pageH - slotTop - 15) / perPage; // leave footer space
  const imgMaxH = slotH - 18; // reserve for caption

  for (let i = 0; i < fotos.length; i++) {
    const slot = i % perPage;
    if (slot === 0) {
      if (i > 0) doc.addPage();
      drawHeader();
    }

    const f = fotos[i];
    const img = loaded[i];
    const slotY = slotTop + slot * slotH;

    if (img) {
      const ratio = img.w / img.h;
      let w = contentW;
      let h = w / ratio;
      if (h > imgMaxH) {
        h = imgMaxH;
        w = h * ratio;
      }
      const x = margin + (contentW - w) / 2;
      const fmt = img.dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      try {
        doc.addImage(img.dataUrl, fmt, x, slotY, w, h);
      } catch {
        doc.setFontSize(10);
        doc.text("[Imagem não pôde ser carregada]", margin, slotY + 10);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`${fmtHora(f.data_envio)}`, margin, slotY + imgMaxH + 5);
      doc.setFont("helvetica", "normal");
      if (f.caption) {
        const lines = doc.splitTextToSize(f.caption, contentW - 20);
        doc.text(lines.slice(0, 2), margin + 18, slotY + imgMaxH + 5);
      }
    } else {
      doc.setFontSize(10);
      doc.text("[Imagem indisponível]", margin, slotY + 10);
    }

    if (slot === perPage - 1 || i === fotos.length - 1) {
      const pageNum = Math.floor(i / perPage) + 1;
      drawFooter(pageNum, totalPages);
    }
  }

  const safe = encarregado.replace(/[^a-zA-Z0-9_-]/g, "_");
  doc.save(`RFO_${safe}_${dataPasta}.pdf`);
}
