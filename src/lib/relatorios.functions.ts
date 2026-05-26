import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib";

// ============ Helpers ============
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
  // tenta JPEG primeiro (formato carimbado é JPEG); cai pra PNG se falhar
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

// ============ Geração ============
export const gerarRelatorioBairro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        bairroId: z.string().uuid(),
        tipo: z.enum(["pre", "pos"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Permissão: admin ou analista
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isPriv = (roles ?? []).some(
      (r: any) => r.role === "admin" || r.role === "analista",
    );
    if (!isPriv) throw new Error("Sem permissão para gerar relatórios.");

    // 2. Carrega bairro + contrato + ruas + fotos aprovadas
    const { data: bairro, error: be } = await supabase
      .from("bairros")
      .select("id, nome, contratos(id, numero, descricao, regional, municipio, responsavel_tecnico, periodo)")
      .eq("id", data.bairroId)
      .single();
    if (be || !bairro) throw new Error(be?.message ?? "Bairro não encontrado.");
    const contrato: any = (bairro as any).contratos ?? {};

    const { data: ruas, error: re } = await supabase
      .from("ruas")
      .select("id, nome, ordem")
      .eq("bairro_id", data.bairroId)
      .order("ordem")
      .order("nome");
    if (re) throw new Error(re.message);

    const ruaIds = (ruas ?? []).map((r: any) => r.id);
    const { data: fotos } = await supabase
      .from("vistoria_fotos")
      .select("*")
      .in("rua_id", ruaIds.length ? ruaIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("status", "aprovada")
      .order("captured_at", { ascending: true });
    const fotosArr: any[] = (fotos ?? []) as any[];

    // 3. Monta PDF
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const [pageW, pageH] = PageSizes.A4;
    const margin = 40;

    type PageCtx = { page: any; y: number };
    const pages: any[] = [];

    function newPage(): PageCtx {
      const page = pdf.addPage(PageSizes.A4);
      pages.push(page);
      return { page, y: pageH - margin };
    }

    function ensureSpace(ctx: PageCtx, needed: number): PageCtx {
      if (ctx.y - needed < margin + 40) return newPage();
      return ctx;
    }

    function drawText(ctx: PageCtx, text: string, opts: { size?: number; bold?: boolean; color?: any; x?: number } = {}) {
      const size = opts.size ?? 10;
      const f = opts.bold ? fontBold : font;
      const x = opts.x ?? margin;
      ctx.page.drawText(text, { x, y: ctx.y - size, size, font: f, color: opts.color ?? rgb(0, 0, 0) });
      ctx.y -= size + 4;
    }

    function drawWrapped(ctx: PageCtx, text: string, size = 10, bold = false) {
      const f = bold ? fontBold : font;
      const maxWidth = pageW - margin * 2;
      const words = text.split(/\s+/);
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxWidth) {
          ctx = ensureSpace(ctx, size + 4);
          ctx.page.drawText(line, { x: margin, y: ctx.y - size, size, font: f });
          ctx.y -= size + 4;
          line = w;
        } else line = test;
      }
      if (line) {
        ctx = ensureSpace(ctx, size + 4);
        ctx.page.drawText(line, { x: margin, y: ctx.y - size, size, font: f });
        ctx.y -= size + 4;
      }
      return ctx;
    }

    // --- CAPA ---
    let ctx = newPage();
    ctx.y = pageH - 120;
    drawText(ctx, "RELATÓRIO DE VISTORIA CAUTELAR", { size: 22, bold: true });
    ctx.y -= 6;
    drawText(ctx, data.tipo === "pre" ? "PRÉ-OBRA" : "PÓS-OBRA", { size: 18, bold: true, color: rgb(0.1, 0.3, 0.6) });
    ctx.y -= 30;
    drawText(ctx, `Contrato: ${contrato.numero ?? "—"}`, { size: 12, bold: true });
    if (contrato.descricao) drawText(ctx, contrato.descricao, { size: 11 });
    ctx.y -= 10;
    drawText(ctx, `Bairro: ${(bairro as any).nome}`, { size: 12, bold: true });
    if (contrato.municipio) drawText(ctx, `Município: ${contrato.municipio}`, { size: 11 });
    if (contrato.regional) drawText(ctx, `Regional: ${contrato.regional}`, { size: 11 });
    if (contrato.responsavel_tecnico) drawText(ctx, `Responsável técnico: ${contrato.responsavel_tecnico}`, { size: 11 });
    if (contrato.periodo) drawText(ctx, `Período: ${contrato.periodo}`, { size: 11 });
    ctx.y -= 20;
    drawText(ctx, `Emitido em: ${new Date().toLocaleString("pt-BR")}`, { size: 10, color: rgb(0.4, 0.4, 0.4) });

    // --- OBJETIVO / ESCOPO ---
    ctx = newPage();
    drawText(ctx, "1. OBJETIVO", { size: 14, bold: true });
    ctx.y -= 4;
    ctx = drawWrapped(
      ctx,
      `Este relatório tem por objetivo registrar o estado ${data.tipo === "pre" ? "anterior" : "posterior"} à execução da obra no bairro ${(bairro as any).nome}, contrato ${contrato.numero ?? "—"}, por meio de registro fotográfico georreferenciado, com data, hora e endereço capturados automaticamente.`,
    );
    ctx.y -= 10;
    drawText(ctx, "2. ESCOPO", { size: 14, bold: true });
    ctx.y -= 4;
    ctx = drawWrapped(
      ctx,
      data.tipo === "pre"
        ? "Registro fotográfico das ruas e das fachadas das residências (com identificação de número e lado) antes do início da obra."
        : "Registro fotográfico das ruas após a execução da obra, comparado lado a lado com o pré-obra correspondente, para evidenciar a manutenção das condições preexistentes.",
    );
    ctx.y -= 10;
    drawText(ctx, "3. POLÍTICA DA QUALIDADE", { size: 14, bold: true });
    ctx.y -= 4;
    ctx = drawWrapped(
      ctx,
      "Todas as imagens deste relatório foram capturadas pelo aplicativo de vistoria, com carimbo automático de data, hora e endereço via GPS, sem edição posterior, conforme procedimento interno.",
    );

    // --- FOTOS ---
    ctx = newPage();
    drawText(ctx, "4. RELATÓRIO FOTOGRÁFICO", { size: 14, bold: true });
    ctx.y -= 8;

    for (const rua of (ruas ?? []) as any[]) {
      const fotosRua = fotosArr.filter((f) => f.rua_id === rua.id);
      if (fotosRua.length === 0) continue;

      ctx = ensureSpace(ctx, 40);
      drawText(ctx, `Rua: ${rua.nome}`, { size: 13, bold: true, color: rgb(0.1, 0.3, 0.6) });
      ctx.y -= 6;

      if (data.tipo === "pre") {
        // PRÉ: fotos de rua + fotos de casas, uma por bloco
        const ordenadas = [
          ...fotosRua.filter((f) => f.fase === "pre" && f.tipo === "rua"),
          ...fotosRua.filter((f) => f.fase === "pre" && f.tipo === "casa"),
        ];
        for (const f of ordenadas) {
          ctx = await drawFotoBlock(ctx, ensureSpace, pdf, supabase, f, font, fontBold, pageW, margin);
        }
      } else {
        // PÓS: pares pré × pós lado a lado, apenas tipo=rua
        const pos = fotosRua.filter((f) => f.fase === "pos");
        // mapa pre por id
        const preMap = new Map<string, any>();
        for (const f of fotosArr) if (f.fase === "pre" && f.tipo === "rua") preMap.set(f.id, f);

        for (const p of pos) {
          const pre = p.par_pre_id ? preMap.get(p.par_pre_id) : null;
          ctx = await drawPairBlock(ctx, ensureSpace, pdf, supabase, pre, p, font, fontBold, pageW, margin);
        }

        const semPar = pos.filter((p) => !p.par_pre_id);
        if (semPar.length === 0) {
          // ok
        }
      }
      ctx.y -= 10;
    }

    // Rodapé + paginação
    const totalPages = pages.length;
    pages.forEach((p, i) => {
      const footer = "Relatório de Vistoria Cautelar – Revisão 02";
      p.drawText(footer, { x: margin, y: 20, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
      const pageLabel = `${i + 1} / ${totalPages}`;
      const w = font.widthOfTextAtSize(pageLabel, 8);
      p.drawText(pageLabel, { x: pageW - margin - w, y: 20, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    });

    const bytes = await pdf.save();

    // 4. Upload para o bucket
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `relatorios/${data.bairroId}/${data.tipo}-${timestamp}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("vistorias-fotos")
      .upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);

    // 5. Registra
    await supabase.from("vistoria_relatorios").insert({
      contrato_id: contrato.id,
      bairro_id: data.bairroId,
      pdf_path: path,
      gerado_por: userId,
    });

    const { data: signed } = await supabase.storage
      .from("vistorias-fotos")
      .createSignedUrl(path, 3600);

    return { path, url: signed?.signedUrl ?? null, total: fotosArr.length };
  });

// ============ Listagem de relatórios gerados ============
export const listRelatoriosBairro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ bairroId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("vistoria_relatorios")
      .select("id, pdf_path, gerado_em, revisao")
      .eq("bairro_id", data.bairroId)
      .order("gerado_em", { ascending: false });
    if (error) throw new Error(error.message);

    const withUrls = await Promise.all(
      (rows ?? []).map(async (r: any) => {
        const { data: signed } = await context.supabase.storage
          .from("vistorias-fotos")
          .createSignedUrl(r.pdf_path, 3600);
        return { ...r, url: signed?.signedUrl ?? null };
      }),
    );
    return { relatorios: withUrls };
  });

// ============ Blocos visuais ============
async function drawFotoBlock(
  ctx: any,
  ensure: any,
  pdf: PDFDocument,
  supabase: any,
  f: any,
  font: any,
  fontBold: any,
  pageW: number,
  margin: number,
) {
  const imgW = pageW - margin * 2;
  const imgH = imgW * 0.6;
  ctx = ensure(ctx, imgH + 50);

  // Legenda
  const legenda =
    f.tipo === "casa" && f.numero_casa
      ? `Casa ${f.numero_casa} (lado ${f.lado === "E" ? "esquerdo" : "direito"}) — ${fmtDate(f.captured_at)}`
      : `Vista da rua — ${fmtDate(f.captured_at)}`;
  ctx.page.drawText(legenda, { x: margin, y: ctx.y - 10, size: 9, font: fontBold });
  ctx.y -= 14;
  if (f.endereco_formatado) {
    ctx.page.drawText(f.endereco_formatado.slice(0, 100), {
      x: margin,
      y: ctx.y - 9,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    ctx.y -= 12;
  }

  // Imagem
  const bytes = await fetchSignedImage(supabase, f.storage_path_carimbada);
  if (bytes) {
    try {
      const img = await embedJpegOrPng(pdf, bytes);
      const ratio = img.width / img.height;
      const finalH = imgW / ratio;
      const drawH = Math.min(finalH, imgH);
      const drawW = drawH * ratio;
      ctx.page.drawImage(img, { x: margin, y: ctx.y - drawH, width: drawW, height: drawH });
      ctx.y -= drawH + 14;
    } catch {
      ctx.page.drawText("[falha ao embutir imagem]", { x: margin, y: ctx.y - 10, size: 9, font });
      ctx.y -= 14;
    }
  }
  return ctx;
}

async function drawPairBlock(
  ctx: any,
  ensure: any,
  pdf: PDFDocument,
  supabase: any,
  pre: any,
  pos: any,
  font: any,
  fontBold: any,
  pageW: number,
  margin: number,
) {
  const colW = (pageW - margin * 2 - 10) / 2;
  const imgH = colW * 0.75;
  ctx = ensure(ctx, imgH + 40);

  // Cabeçalhos de coluna
  ctx.page.drawText("PRÉ-OBRA", { x: margin, y: ctx.y - 10, size: 9, font: fontBold, color: rgb(0.1, 0.3, 0.6) });
  ctx.page.drawText("PÓS-OBRA", { x: margin + colW + 10, y: ctx.y - 10, size: 9, font: fontBold, color: rgb(0.6, 0.2, 0.1) });
  ctx.y -= 14;

  // Datas
  ctx.page.drawText(fmtDate(pre?.captured_at) || "—", { x: margin, y: ctx.y - 8, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
  ctx.page.drawText(fmtDate(pos?.captured_at) || "—", { x: margin + colW + 10, y: ctx.y - 8, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
  ctx.y -= 10;

  // Imagens
  const yImg = ctx.y - imgH;
  for (const [foto, x] of [[pre, margin], [pos, margin + colW + 10]] as const) {
    if (!foto) {
      ctx.page.drawRectangle({ x, y: yImg, width: colW, height: imgH, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1 });
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
      ctx.page.drawImage(img, { x: x + (colW - drawW) / 2, y: yImg + (imgH - drawH) / 2, width: drawW, height: drawH });
    } catch {
      // ignore
    }
  }
  ctx.y = yImg - 10;
  return ctx;
}
