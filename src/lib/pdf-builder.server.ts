// Server-only helpers para montar PDFs de vistoria em chunks.
// Cada função recebe um supabase client (admin) e produz bytes de PDF.
// Pensado para ser chamado pelo hook /api/public/hooks/processar-relatorios,
// que processa 1 chunk por request (cabe no orçamento do Worker).

import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib";

const PAGE = PageSizes.A4;
const MARGIN = 40;

async function fetchSignedImage(supabase: any, path: string): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data: signed } = await supabase.storage
    .from("vistorias-fotos")
    .createSignedUrl(path, 3600);
  if (!signed?.signedUrl) return null;
  try {
    const r = await fetch(signed.signedUrl);
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function embedJpegOrPng(pdf: PDFDocument, bytes: Uint8Array) {
  try {
    return await pdf.embedJpg(bytes);
  } catch {
    return await pdf.embedPng(bytes);
  }
}

function fmtDate(s?: string | null) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleString("pt-BR");
  } catch {
    return s;
  }
}

type Ctx = { page: any; y: number };

function makeDrawer(pdf: PDFDocument, font: any, fontBold: any, pages: any[]) {
  const [pageW, pageH] = PAGE;
  function newPage(): Ctx {
    const page = pdf.addPage(PAGE);
    pages.push(page);
    return { page, y: pageH - MARGIN };
  }
  function ensure(ctx: Ctx, needed: number): Ctx {
    if (ctx.y - needed < MARGIN + 40) return newPage();
    return ctx;
  }
  function text(ctx: Ctx, t: string, o: { size?: number; bold?: boolean; color?: any; x?: number } = {}) {
    const size = o.size ?? 10;
    const f = o.bold ? fontBold : font;
    ctx.page.drawText(t, { x: o.x ?? MARGIN, y: ctx.y - size, size, font: f, color: o.color ?? rgb(0, 0, 0) });
    ctx.y -= size + 4;
  }
  function wrapped(ctx: Ctx, t: string, size = 10, bold = false) {
    const f = bold ? fontBold : font;
    const maxW = pageW - MARGIN * 2;
    const words = t.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > maxW) {
        ctx = ensure(ctx, size + 4);
        ctx.page.drawText(line, { x: MARGIN, y: ctx.y - size, size, font: f });
        ctx.y -= size + 4;
        line = w;
      } else line = test;
    }
    if (line) {
      ctx = ensure(ctx, size + 4);
      ctx.page.drawText(line, { x: MARGIN, y: ctx.y - size, size, font: f });
      ctx.y -= size + 4;
    }
    return ctx;
  }
  return { newPage, ensure, text, wrapped, pageW, pageH };
}

// ============ Chunk 0: capa + seções introdutórias ============
export async function buildCapaChunk(opts: {
  tipo: "pre" | "pos";
  bairroNome: string;
  contrato: any;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages: any[] = [];
  const d = makeDrawer(pdf, font, fontBold, pages);
  const { contrato, tipo, bairroNome } = opts;

  // Capa
  let ctx = d.newPage();
  ctx.y = d.pageH - 120;
  d.text(ctx, "RELATÓRIO DE VISTORIA CAUTELAR", { size: 22, bold: true });
  ctx.y -= 6;
  d.text(ctx, tipo === "pre" ? "PRÉ-OBRA" : "PÓS-OBRA", {
    size: 18,
    bold: true,
    color: rgb(0.1, 0.3, 0.6),
  });
  ctx.y -= 30;
  d.text(ctx, `Contrato: ${contrato?.numero ?? "—"}`, { size: 12, bold: true });
  if (contrato?.descricao) ctx = d.wrapped(ctx, contrato.descricao, 11);
  ctx.y -= 10;
  d.text(ctx, `Bairro: ${bairroNome}`, { size: 12, bold: true });
  if (contrato?.municipio) d.text(ctx, `Município: ${contrato.municipio}`, { size: 11 });
  if (contrato?.regional) d.text(ctx, `Regional: ${contrato.regional}`, { size: 11 });
  if (contrato?.responsavel_tecnico)
    d.text(ctx, `Responsável técnico: ${contrato.responsavel_tecnico}`, { size: 11 });
  if (contrato?.periodo) d.text(ctx, `Período: ${contrato.periodo}`, { size: 11 });
  ctx.y -= 20;
  d.text(ctx, `Emitido em: ${new Date().toLocaleString("pt-BR")}`, {
    size: 10,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Seções
  ctx = d.newPage();
  d.text(ctx, "1. OBJETIVO", { size: 14, bold: true });
  ctx.y -= 4;
  ctx = d.wrapped(
    ctx,
    `Este relatório tem por objetivo registrar o estado ${tipo === "pre" ? "anterior" : "posterior"} à execução da obra no bairro ${bairroNome}, contrato ${contrato?.numero ?? "—"}, por meio de registro fotográfico georreferenciado, com data, hora e endereço capturados automaticamente.`,
  );
  ctx.y -= 10;
  d.text(ctx, "2. ESCOPO", { size: 14, bold: true });
  ctx.y -= 4;
  ctx = d.wrapped(
    ctx,
    tipo === "pre"
      ? "Registro fotográfico das ruas e das fachadas das residências (com identificação de número e lado) antes do início da obra."
      : "Registro fotográfico das ruas após a execução da obra, comparado lado a lado com o pré-obra correspondente, para evidenciar a manutenção das condições preexistentes.",
  );
  ctx.y -= 10;
  d.text(ctx, "3. POLÍTICA DA QUALIDADE", { size: 14, bold: true });
  ctx.y -= 4;
  ctx = d.wrapped(
    ctx,
    "Todas as imagens deste relatório foram capturadas pelo aplicativo de vistoria, com carimbo automático de data, hora e endereço via GPS, sem edição posterior, conforme procedimento interno.",
  );
  ctx.y -= 20;
  d.text(ctx, `BAIRRO — ${bairroNome.toUpperCase()}`, {
    size: 16,
    bold: true,
    color: rgb(0.1, 0.3, 0.6),
  });

  return await pdf.save();
}

// ============ Chunk N: 1 rua ============
export async function buildRuaChunk(opts: {
  supabase: any;
  tipo: "pre" | "pos";
  rua: { id: string; nome: string };
  fotos: any[]; // já filtradas dessa rua, fase apropriada
  fotosPrePos?: any[]; // só pra tipo=pos: array completo de PRÉ desse bairro pra parear
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages: any[] = [];
  const d = makeDrawer(pdf, font, fontBold, pages);
  const { tipo, rua, fotos, supabase } = opts;

  let ctx = d.newPage();
  d.text(ctx, `Rua: ${rua.nome}`, { size: 13, bold: true, color: rgb(0.1, 0.3, 0.6) });
  ctx.y -= 6;

  if (tipo === "pre") {
    const ordenadas = [
      ...fotos.filter((f) => f.fase === "pre" && f.tipo === "rua"),
      ...fotos.filter((f) => f.fase === "pre" && f.tipo === "casa"),
    ];
    for (const f of ordenadas) {
      ctx = await drawFotoBlock(ctx, d, pdf, supabase, f, font, fontBold);
    }
  } else {
    const pos = fotos.filter((f) => f.fase === "pos");
    const preMap = new Map<string, any>();
    for (const f of opts.fotosPrePos ?? []) {
      if (f.fase === "pre" && f.tipo === "rua") preMap.set(f.id, f);
    }
    for (const p of pos) {
      const pre = p.par_pre_id ? preMap.get(p.par_pre_id) : null;
      ctx = await drawPairBlock(ctx, d, pdf, supabase, pre, p, font, fontBold);
    }
  }

  return await pdf.save();
}

async function drawFotoBlock(
  ctx: Ctx,
  d: ReturnType<typeof makeDrawer>,
  pdf: PDFDocument,
  supabase: any,
  f: any,
  font: any,
  fontBold: any,
): Promise<Ctx> {
  const imgW = d.pageW - MARGIN * 2;
  const imgH = imgW * 0.6;
  ctx = d.ensure(ctx, imgH + 50);

  const legenda =
    f.tipo === "casa" && f.numero_casa
      ? `Casa ${f.numero_casa} (lado ${f.lado === "E" ? "esquerdo" : "direito"}) — ${fmtDate(f.captured_at)}`
      : `Vista da rua — ${fmtDate(f.captured_at)}`;
  ctx.page.drawText(legenda, { x: MARGIN, y: ctx.y - 10, size: 9, font: fontBold });
  ctx.y -= 14;
  if (f.endereco_formatado) {
    ctx.page.drawText(String(f.endereco_formatado).slice(0, 100), {
      x: MARGIN,
      y: ctx.y - 9,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    ctx.y -= 12;
  }

  const bytes = await fetchSignedImage(supabase, f.storage_path_carimbada);
  if (bytes) {
    try {
      const img = await embedJpegOrPng(pdf, bytes);
      const ratio = img.width / img.height;
      const finalH = imgW / ratio;
      const drawH = Math.min(finalH, imgH);
      const drawW = drawH * ratio;
      ctx.page.drawImage(img, { x: MARGIN, y: ctx.y - drawH, width: drawW, height: drawH });
      ctx.y -= drawH + 14;
    } catch {
      ctx.page.drawText("[falha ao embutir imagem]", { x: MARGIN, y: ctx.y - 10, size: 9, font });
      ctx.y -= 14;
    }
  }
  return ctx;
}

async function drawPairBlock(
  ctx: Ctx,
  d: ReturnType<typeof makeDrawer>,
  pdf: PDFDocument,
  supabase: any,
  pre: any,
  pos: any,
  font: any,
  fontBold: any,
): Promise<Ctx> {
  const colW = (d.pageW - MARGIN * 2 - 10) / 2;
  const imgH = colW * 0.75;
  ctx = d.ensure(ctx, imgH + 40);

  ctx.page.drawText("PRÉ-OBRA", {
    x: MARGIN,
    y: ctx.y - 10,
    size: 9,
    font: fontBold,
    color: rgb(0.1, 0.3, 0.6),
  });
  ctx.page.drawText("PÓS-OBRA", {
    x: MARGIN + colW + 10,
    y: ctx.y - 10,
    size: 9,
    font: fontBold,
    color: rgb(0.6, 0.2, 0.1),
  });
  ctx.y -= 14;

  ctx.page.drawText(fmtDate(pre?.captured_at) || "—", {
    x: MARGIN,
    y: ctx.y - 8,
    size: 7,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  ctx.page.drawText(fmtDate(pos?.captured_at) || "—", {
    x: MARGIN + colW + 10,
    y: ctx.y - 8,
    size: 7,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  ctx.y -= 10;

  const yImg = ctx.y - imgH;
  for (const [foto, x] of [
    [pre, MARGIN],
    [pos, MARGIN + colW + 10],
  ] as const) {
    if (!foto) {
      ctx.page.drawRectangle({
        x,
        y: yImg,
        width: colW,
        height: imgH,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 1,
      });
      ctx.page.drawText(foto === pre ? "(sem par pré)" : "(sem par pós)", {
        x: x + 10,
        y: yImg + imgH / 2,
        size: 9,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
      continue;
    }
    const bytes = await fetchSignedImage(supabase, foto.storage_path_carimbada);
    if (!bytes) continue;
    try {
      const img = await embedJpegOrPng(pdf, bytes);
      const ratio = img.width / img.height;
      let drawW = colW;
      let drawH = colW / ratio;
      if (drawH > imgH) {
        drawH = imgH;
        drawW = imgH * ratio;
      }
      ctx.page.drawImage(img, {
        x: x + (colW - drawW) / 2,
        y: yImg + (imgH - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    } catch {
      // ignore
    }
  }
  ctx.y = yImg - 10;
  return ctx;
}

// ============ Concatenar PDFs parciais em 1 PDF final ============
export async function concatPDFs(
  parts: Uint8Array[],
  footerText = "Relatório de Vistoria Cautelar – Revisão 02",
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  for (const bytes of parts) {
    const src = await PDFDocument.load(bytes);
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const p of copied) out.addPage(p);
  }
  // Paginação + rodapé
  const all = out.getPages();
  const total = all.length;
  all.forEach((p, i) => {
    const [pageW] = [p.getWidth(), p.getHeight()];
    p.drawText(footerText, {
      x: MARGIN,
      y: 20,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    const label = `${i + 1} / ${total}`;
    const w = font.widthOfTextAtSize(label, 8);
    p.drawText(label, {
      x: pageW - MARGIN - w,
      y: 20,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  });
  return await out.save();
}
