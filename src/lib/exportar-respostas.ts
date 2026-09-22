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

/**
 * PDF em tabela: uma linha por resposta, com MINIATURAS das fotos dentro da
 * própria célula da pergunta (antes vinha só o nome do arquivo).
 *
 * `resolverUrls` é opcional — sem ele a tabela sai como antes, só com os nomes.
 */
export async function exportarPDFTabela(
  titulo: string,
  campos: CampoExport[],
  respostas: RespostaExport[],
  resolverUrls?: ResolverUrls,
  onProgresso?: (feitas: number, total: number) => void,
) {
  const { header, linhas, exportaveis } = montarTabela(campos, respostas);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  // "Data" e "Respondente" ocupam as duas primeiras colunas da tabela
  const OFFSET_COLUNAS = 2;
  const colunasFoto = new Map<number, CampoExport>();
  exportaveis.forEach((c, i) => {
    if (c.tipo === "foto" || c.tipo === "arquivo") colunasFoto.set(i + OFFSET_COLUNAS, c);
  });

  // linha:coluna -> miniaturas já carregadas
  const miniaturas = new Map<string, { dataUrl: string; w: number; h: number }[]>();
  const usarFotos = Boolean(resolverUrls) && colunasFoto.size > 0;

  if (usarFotos) {
    const alvos: { chave: string; arq: ArquivoResposta }[] = [];
    respostas.forEach((r, linha) => {
      for (const [coluna, campo] of colunasFoto) {
        const imagens = (r.arquivos ?? []).filter((a) => a.campo_id === campo.id && ehImagem(a));
        imagens.forEach((arq) => alvos.push({ chave: `${linha}:${coluna}`, arq }));
      }
    });
    if (alvos.length > 0) {
      const urls = await resolverUrls!(alvos.map((a) => a.arq.path));
      // miniatura pequena (4:3 uniforme), baixadas em paralelo
      const cache = await baixarEmLote(
        alvos.map((a) => a.arq.path),
        urls,
        { w: 700, h: 525 },
        onProgresso,
      );
      for (const { chave, arq } of alvos) {
        const img = cache.get(arq.path);
        if (!img) continue;
        const lista = miniaturas.get(chave) ?? [];
        lista.push(img);
        miniaturas.set(chave, lista);
      }
    }

  }

  doc.setFontSize(14);
  doc.text(titulo, 40, 40);
  doc.setFontSize(9);
  doc.text(
    `${respostas.length} resposta(s) — gerado em ${new Date().toLocaleString("pt-BR")}`,
    40,
    56,
  );

  const ALTURA_MINI = 44;
  const PADDING = 4;

  autoTable(doc, {
    head: [header],
    body: linhas,
    startY: 70,
    styles: { fontSize: 8, cellPadding: PADDING, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [37, 99, 235] },
    margin: { left: 40, right: 40 },
    columnStyles: usarFotos
      ? Object.fromEntries([...colunasFoto.keys()].map((c) => [c, { cellWidth: 146 }]))
      : undefined,
    didParseCell: (data: any) => {
      if (!usarFotos || data.section !== "body") return;
      if (!colunasFoto.has(data.column.index)) return;
      const fotos = miniaturas.get(`${data.row.index}:${data.column.index}`);
      if (!fotos?.length) return;
      // o texto sai da célula: o espaço é das miniaturas, desenhadas em didDrawCell
      data.cell.text = [];
      data.cell.styles.minCellHeight = ALTURA_MINI + PADDING * 2;
    },
    didDrawCell: (data: any) => {
      if (!usarFotos || data.section !== "body") return;
      if (!colunasFoto.has(data.column.index)) return;
      const fotos = miniaturas.get(`${data.row.index}:${data.column.index}`);
      if (!fotos?.length) return;

      const larguraUtil = data.cell.width - PADDING * 2;
      let x = data.cell.x + PADDING;
      const y = data.cell.y + PADDING;
      let desenhadas = 0;

      for (const img of fotos) {
        const largura = (ALTURA_MINI / img.h) * img.w;
        // guarda espaço para o "+N" quando ainda restam fotos
        const restantes = fotos.length - desenhadas;
        const reserva = restantes > 1 ? 12 : 0;
        if (x + largura > data.cell.x + PADDING + larguraUtil - reserva) break;
        try {
          doc.addImage(img.dataUrl, "JPEG", x, y, largura, ALTURA_MINI);
        } catch {
          /* miniatura problemática não derruba a tabela */
        }
        x += largura + 3;
        desenhadas++;
      }

      const sobraram = fotos.length - desenhadas;
      if (sobraram > 0) {
        doc.setFontSize(7);
        doc.setTextColor(110);
        doc.text(`+${sobraram}`, x, y + ALTURA_MINI / 2, { baseline: "middle" });
        doc.setTextColor(0);
        doc.setFontSize(8);
      }
    },
  });
  doc.save(`${titulo}.pdf`);
}

/**
 * Desenha reduzindo em ETAPAS (metade por vez) quando a redução é grande.
 *
 * Reduzir uma foto de 4000px direto para ~1200px num único drawImage faz o
 * navegador amostrar poucos pixels da origem: o resultado sai borrado e com
 * serrilhado. Reduzir pela metade sucessivamente preserva o detalhe — é a
 * diferença de qualidade que aparece no PDF.
 */
function desenharComQualidade(
  ctx: CanvasRenderingContext2D,
  fonte: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
) {
  let origem: CanvasImageSource = fonte;
  let ox = sx;
  let oy = sy;
  let cw = sw;
  let ch = sh;

  while (cw >= dw * 2 && ch >= dh * 2) {
    const tw = Math.max(dw, Math.round(cw / 2));
    const th = Math.max(dh, Math.round(ch / 2));
    const passo = document.createElement("canvas");
    passo.width = tw;
    passo.height = th;
    const pctx = passo.getContext("2d");
    if (!pctx) break;
    pctx.imageSmoothingEnabled = true;
    pctx.imageSmoothingQuality = "high";
    pctx.drawImage(origem, ox, oy, cw, ch, 0, 0, tw, th);
    origem = passo;
    ox = 0;
    oy = 0;
    cw = tw;
    ch = th;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(origem, ox, oy, cw, ch, 0, 0, dw, dh);
}

/**
 * Baixa a imagem e devolve em JPEG pronto para o PDF.
 *
 * Referência de qualidade: o relatório do Coletum usa fotos de 1024x768px numa
 * moldura de 93x70pt (~795 DPI). Trabalhamos nesse patamar ou acima, e NUNCA
 * ampliamos além do que a foto original tem — ampliar não cria detalhe, só
 * engorda o arquivo.
 *
 * `cortar` recorta ao centro na proporção pedida, o que deixa a grade de
 * miniaturas uniforme mesmo misturando fotos em pé e deitadas.
 */
async function baixarComoJpeg(
  url: string,
  ladoMax = 2000,
  qualidade = 0.92,
  cortar?: { w: number; h: number },
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

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (cortar) {
      // recorte central na proporção alvo
      const alvo = cortar.w / cortar.h;
      let sw = largura;
      let sh = Math.round(largura / alvo);
      if (sh > altura) {
        sh = altura;
        sw = Math.round(altura * alvo);
      }
      const sx = Math.round((largura - sw) / 2);
      const sy = Math.round((altura - sh) / 2);

      // não amplia: no máximo o que sobrou depois do recorte
      const dw = Math.min(cortar.w, sw);
      const dh = Math.max(1, Math.round(dw / alvo));
      canvas.width = dw;
      canvas.height = dh;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, dw, dh);
      desenharComQualidade(ctx, fonte, sx, sy, sw, sh, dw, dh);
      return { dataUrl: canvas.toDataURL("image/jpeg", qualidade), w: dw, h: dh };
    }

    const escala = Math.min(1, ladoMax / Math.max(largura, altura));
    const w = Math.max(1, Math.round(largura * escala));
    const h = Math.max(1, Math.round(altura * escala));
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = "#ffffff"; // PNG com transparência vira fundo branco no JPEG
    ctx.fillRect(0, 0, w, h);
    desenharComQualidade(ctx, fonte, 0, 0, largura, altura, w, h);
    return { dataUrl: canvas.toDataURL("image/jpeg", qualidade), w, h };
  } catch {
    return null;
  }
}

type Miniatura = { dataUrl: string; w: number; h: number };

/**
 * Baixa/redimensiona várias fotos em paralelo (com limite de conexões
 * simultâneas). Antes isso era feito uma foto por vez, o que deixava o PDF
 * lento demais em respostas com dezenas de imagens.
 */
async function baixarEmLote(
  paths: string[],
  urls: Record<string, string>,
  cortar: { w: number; h: number },
  onProgresso?: (feitas: number, total: number) => void,
  concorrencia = 6,
): Promise<Map<string, Miniatura | null>> {
  const unicos = Array.from(new Set(paths));
  const cache = new Map<string, Miniatura | null>();
  let feitas = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < unicos.length) {
      const path = unicos[cursor++];
      const url = urls[path];
      const img = url ? await baixarComoJpeg(url, 0, 0.92, cortar) : null;
      cache.set(path, img);
      feitas++;
      onProgresso?.(feitas, unicos.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concorrencia, unicos.length) }, () => worker()),
  );
  return cache;
}



/** Caminho, no bucket fotos-obras, do logo próprio de um formulário. */
export const LOGO_FORM_PATH = (formularioId: string) => `formularios/${formularioId}/logo.png`;

type Logo = { dataUrl: string; w: number; h: number; formato: "PNG" | "JPEG" };

/**
 * Carrega um logo (URL pública ou assinada) como data URL, medindo as
 * dimensões para caber na caixa do cabeçalho sem distorcer. null se falhar.
 */
async function carregarLogo(url: string): Promise<Logo | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    const { w, h } = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    if (!w || !h) return null;
    const formato: Logo["formato"] = dataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    return { dataUrl, w, h, formato };
  } catch {
    return null;
  }
}

/**
 * PDF detalhado — uma resposta por relatório, no layout do "Registro
 * fotográfico" do Coletum que a equipe já usa: cabeçalho com logo, dados em
 * duas colunas (rótulo à esquerda, valor em caixa cinza), fotos em grade de
 * três miniaturas por linha continuando pelas páginas seguintes, e rodapé
 * "Página X de Y".
 *
 * `resolverUrls` é opcional: sem ele as perguntas de foto mostram só a
 * quantidade de arquivos.
 */
export async function exportarPDFDetalhado(
  titulo: string,
  campos: CampoExport[],
  respostas: RespostaExport[],
  resolverUrls?: ResolverUrls,
  onProgresso?: (feitas: number, total: number) => void,
  geradoPor?: string,
  logoUrl?: string | null,
  nomeCabecalho?: string | null,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" }); // 595 x 842
  const PAG_LARG = doc.internal.pageSize.getWidth();
  const PAG_ALT = doc.internal.pageSize.getHeight();

  // Geometria (em pt) calcada no modelo do Coletum
  const M_ESQ = 40;
  const M_DIR = PAG_LARG - 40;
  const TOPO = 40;
  const LIMITE_INF = PAG_ALT - 52; // acima do rodapé
  const ROTULO_FIM = 168; // borda direita do rótulo (alinhado à direita)
  const ROTULO_LARG = ROTULO_FIM - M_ESQ;
  const VALOR_X = 182;
  const VALOR_LARG = M_DIR - VALOR_X;
  const LINHA = 10; // altura de linha do texto 8pt
  const ESPACO_LINHAS = 7;
  const TH_W = 93;
  const TH_H = 70;
  const TH_GAP = 8;
  const TH_POR_LINHA = 3;

  // Logo do cabeçalho: o do formulário quando houver, senão o padrão da Macro.
  const logo = logoUrl === null ? null : await carregarLogo(logoUrl ?? "/logo-macro.png");

  // Assina todas as fotos de uma vez
  let urls: Record<string, string> = {};
  const todasImagens = respostas.flatMap((r) => (r.arquivos ?? []).filter(ehImagem));
  if (resolverUrls && todasImagens.length > 0) {
    urls = await resolverUrls(todasImagens.map((a) => a.path));
  }
  // Baixa/redimensiona tudo em paralelo antes de montar as páginas
  const cacheFotos =
    todasImagens.length > 0
      ? await baixarEmLote(
          todasImagens.map((a) => a.path),
          urls,
          { w: 1280, h: 960 },
          onProgresso,
        )
      : new Map<string, Miniatura | null>();


  const agora = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const fmtData = (iso: string) => {
    try {
      const d = new Date(iso);
      const data = d.toLocaleDateString("pt-BR");
      const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      return `${data} às ${hora}`;
    } catch {
      return iso;
    }
  };

  let y = TOPO;
  const novaPagina = () => {
    doc.addPage();
    y = TOPO;
  };
  const garantirEspaco = (altura: number) => {
    if (y + altura > LIMITE_INF) novaPagina();
  };

  const texto = (t: string, x: number, yy: number, opts?: Record<string, unknown>) =>
    doc.text(t, x, yy, opts as any);

  /** Linha rótulo | caixa cinza com o valor. Devolve a altura ocupada. */
  const linhaValor = (rotulo: string, valor: string) => {
    doc.setFontSize(8);
    const rotLinhas = doc.splitTextToSize(rotulo, ROTULO_LARG - 6) as string[];
    const valLinhas = doc.splitTextToSize(valor || "—", VALOR_LARG - 10) as string[];
    const altura = Math.max(18, Math.max(rotLinhas.length, valLinhas.length) * LINHA + 8);
    garantirEspaco(altura);

    doc.setFillColor(236, 236, 236);
    doc.rect(VALOR_X, y, VALOR_LARG, altura, "F");

    doc.setFont("helvetica", "normal");
    doc.setTextColor(40);
    texto(rotLinhas.join("\n"), ROTULO_FIM, y + 12, { align: "right" });
    doc.setTextColor(0);
    texto(valLinhas.join("\n"), VALOR_X + 5, y + 12);

    y += altura + ESPACO_LINHAS;
  };

  for (let idx = 0; idx < respostas.length; idx++) {
    const r = respostas[idx];
    if (idx > 0) novaPagina();

    // --- Cabeçalho (só na primeira página da resposta) ---
    if (logo) {
      // cabe numa caixa de 120x52pt mantendo a proporção, encostado à direita
      const escala = Math.min(120 / logo.w, 52 / logo.h);
      const lw = logo.w * escala;
      const lh = logo.h * escala;
      try {
        doc.addImage(logo.dataUrl, logo.formato, M_DIR - lw, 30, lw, lh);
      } catch {
        /* sem logo */
      }
    }
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    // Nome no canto esquerdo: padrão "MacroAmbiental", outro nome, ou nenhum
    // (undefined = padrão; null = não imprime e o resto do cabeçalho sobe).
    const nomeTopo = nomeCabecalho === undefined ? "MacroAmbiental" : nomeCabecalho;
    let hy = 48;
    if (nomeTopo) {
      doc.setFontSize(12);
      texto(nomeTopo, M_ESQ, hy, { maxWidth: M_DIR - M_ESQ - 130 });
      hy += 18;
    }

    doc.setFontSize(9);
    const idCurto = String(r.id ?? "").replace(/-/g, "").slice(0, 8);
    texto(
      `${titulo.toUpperCase()}${idCurto ? ` - Resposta: ${idCurto}` : ""}`,
      M_ESQ,
      hy,
      { maxWidth: M_DIR - M_ESQ - 130 },
    );
    hy += 13;
    doc.setFontSize(8);
    texto(`Criado por: ${r.respondente_nome || r.respondente_email || "—"}`, M_ESQ, hy);
    hy += 11;
    texto(`Criado em: ${fmtData(r.created_at)}`, M_ESQ, hy);
    hy += 17;

    doc.setFont("helvetica", "normal");
    texto(`Gerado por ${geradoPor || "Macro Ambiental"} em ${agora}`, M_ESQ, hy);

    y = hy + 18;

    // --- Perguntas ---
    for (const c of campos) {
      if (c.tipo === "secao") {
        garantirEspaco(22);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(0);
        texto(c.rotulo, M_ESQ, y + 10);
        doc.setFont("helvetica", "normal");
        y += 20;
        continue;
      }

      if (c.tipo !== "foto" && c.tipo !== "arquivo") {
        linhaValor(c.rotulo, valorTexto(c, r));
        continue;
      }

      // Pergunta de foto/arquivo
      const doCampo = (r.arquivos ?? []).filter((a) => a.campo_id === c.id);
      const imagens = resolverUrls ? doCampo.filter(ehImagem) : [];
      const outros = doCampo.filter((a) => !imagens.includes(a));

      if (imagens.length === 0) {
        linhaValor(
          c.rotulo,
          doCampo.length ? doCampo.map((a) => a.nome).join("; ") : "—",
        );
        continue;
      }

      // Rótulo à esquerda, alinhado ao topo da primeira linha de miniaturas
      garantirEspaco(TH_H + 4);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(40);
      const rotLinhas = doc.splitTextToSize(c.rotulo, ROTULO_LARG - 6) as string[];
      texto(rotLinhas.join("\n"), ROTULO_FIM, y + 10, { align: "right" });
      doc.setTextColor(0);

      let coluna = 0;
      for (const arq of imagens) {
        const mini = cacheFotos.get(arq.path) ?? null;


        if (coluna === 0 && y + TH_H > LIMITE_INF) {
          // a grade continua na página seguinte, sem repetir o cabeçalho
          novaPagina();
        }
        const x = VALOR_X + coluna * (TH_W + TH_GAP);
        if (mini) {
          try {
            doc.addImage(mini.dataUrl, "JPEG", x, y, TH_W, TH_H);
          } catch {
            /* miniatura problemática: deixa o espaço em branco */
          }
        } else {
          doc.setDrawColor(200);
          doc.rect(x, y, TH_W, TH_H);
        }
        coluna++;
        if (coluna >= TH_POR_LINHA) {
          coluna = 0;
          y += TH_H + TH_GAP;
        }
      }
      if (coluna > 0) y += TH_H + TH_GAP; // fecha a linha incompleta
      y += ESPACO_LINHAS;

      if (outros.length) {
        linhaValor("Outros anexos", outros.map((a) => a.nome).join("; "));
      }
    }
  }

  // --- Rodapé em todas as páginas ---
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(200);
    doc.line(M_ESQ, PAG_ALT - 42, M_DIR, PAG_ALT - 42);
    doc.setFont("helvetica", "bolditalic");
    doc.setFontSize(7);
    doc.setTextColor(0);
    texto(`Página ${p} de ${total}`, M_DIR, PAG_ALT - 30, { align: "right" });
  }
  doc.setFont("helvetica", "normal");

  doc.save(`${titulo}-detalhado.pdf`);
}
