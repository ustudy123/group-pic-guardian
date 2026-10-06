import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  Download,
  FileText,
  Paperclip,
  FileSpreadsheet,
  FileDown,
  Filter,
  X,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FORM_GRAD, FORM_SHADOW } from "@/lib/ui-form";
import { useAuth } from "@/lib/auth-context";
import { lerConfigRelatorio, nomeCabecalhoDe } from "@/lib/relatorio-config";
import {
  exportarCSV,
  exportarExcel,
  exportarPDFTabela,
  exportarPDFDetalhado,
  LOGO_FORM_PATH,
  baixar,
} from "@/lib/exportar-respostas";

type Formato = "pdf-detalhado" | "pdf-tabela" | "xlsx" | "csv";

export const Route = createFileRoute("/painel/formularios/$id/respostas")({
  component: Respostas,
});

/** minúsculas e sem acento, para comparar rótulo de pergunta com apelidos. */
const normalizar = (s: string) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/** Apelidos aceitos para cada filtro de localidade. */
const APELIDOS = {
  rua: ["rua", "logradouro", "endereco", "endereço", "via"],
  bairro: ["bairro", "distrito"],
  cidade: ["cidade", "municipio", "município"],
  vistoriante: ["vistoriante", "vistoriador", "encarregado", "responsavel", "tecnico", "inspetor"],
} as const;

const dataSP = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));

/** Nome de arquivo seguro (Windows/celular): sem / \\ : * ? " < > | */
const nomeArquivo = (t: string) =>
  t.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "arquivo";

/**
 * Separa as respostas por rua para o .zip "um PDF por rua" (pedido da equipe
 * de vistorias, 08/10). A mesma rua em bairros diferentes vira arquivos
 * diferentes, com o bairro no nome; várias vistorias da mesma rua (dias
 * diferentes, pré e pós-obra) ficam juntas no PDF dela, da mais antiga para a
 * mais nova.
 */
function separarPorRua<T extends { created_at: string }>(
  respostas: T[],
  ruaDe: (r: T) => string,
  bairroDe: (r: T) => string,
): { nome: string; respostas: T[] }[] {
  const grupos = new Map<string, { rua: string; bairro: string; respostas: T[] }>();
  for (const r of respostas) {
    const rua = ruaDe(r).trim();
    const bairro = bairroDe(r).trim();
    const chave = `${normalizar(rua)}|${normalizar(bairro)}`;
    const g = grupos.get(chave) ?? { rua, bairro, respostas: [] };
    g.respostas.push(r);
    grupos.set(chave, g);
  }
  // Rua que aparece em mais de um bairro leva o bairro no nome do arquivo.
  const bairrosPorRua = new Map<string, number>();
  for (const g of grupos.values()) {
    const k = normalizar(g.rua);
    bairrosPorRua.set(k, (bairrosPorRua.get(k) ?? 0) + 1);
  }
  const usados = new Map<string, number>();
  return [...grupos.values()]
    .sort((a, b) => a.rua.localeCompare(b.rua, "pt-BR") || a.bairro.localeCompare(b.bairro, "pt-BR"))
    .map((g) => {
      let nome = g.rua || "Sem rua";
      if (g.rua && g.bairro && (bairrosPorRua.get(normalizar(g.rua)) ?? 0) > 1) {
        nome = `${g.rua} - ${g.bairro}`;
      }
      nome = nomeArquivo(nome);
      const n = (usados.get(nome.toLowerCase()) ?? 0) + 1;
      usados.set(nome.toLowerCase(), n);
      if (n > 1) nome = `${nome} (${n})`;
      return {
        nome,
        respostas: [...g.respostas].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      };
    });
}

function Respostas() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [aberta, setAberta] = useState<string | null>(null);
  const [formato, setFormato] = useState<Formato>("pdf-detalhado");
  // "Exportar tudo" em PDF: um arquivo por rua dentro de um .zip (padrão) ou
  // tudo num PDF só, como antes. A escolha fica lembrada neste navegador.
  const [porRua, setPorRuaState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("respostas-pdf-por-rua") !== "0";
    } catch {
      return true;
    }
  });
  const setPorRua = (v: boolean) => {
    setPorRuaState(v);
    try {
      localStorage.setItem("respostas-pdf-por-rua", v ? "1" : "0");
    } catch {
      /* navegador sem armazenamento: vale só nesta tela */
    }
  };
  const [exportando, setExportando] = useState<string | null>(null);

  // --- filtros ---
  const [dataIni, setDataIni] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [fRua, setFRua] = useState("");
  const [fBairro, setFBairro] = useState("");
  const [fCidade, setFCidade] = useState("");
  const [fVistoriante, setFVistoriante] = useState("");

  const { data: form } = useQuery({
    queryKey: ["formulario", id],
    queryFn: async () => {
      const { data } = await supabase.from("formularios").select("*").eq("id", id).single();
      return data;
    },
  });
  const { data: campos = [] } = useQuery({
    queryKey: ["formulario-campos", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("formulario_campos")
        .select("*")
        .eq("formulario_id", id)
        .order("ordem");
      return data ?? [];
    },
  });
  const { data: respostas = [] } = useQuery({
    queryKey: ["formulario-respostas", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("formulario_respostas")
        .select("*")
        .eq("formulario_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Rua/bairro/cidade não são colunas da resposta: saem das próprias perguntas
  // do formulário. Localizamos pelo rótulo — se o formulário não tiver a
  // pergunta, aquele filtro simplesmente não aparece.
  const campoPor = useMemo(() => {
    const acha = (apelidos: readonly string[]) =>
      (campos as any[]).find(
        (c) => c.tipo !== "secao" && apelidos.some((a) => normalizar(c.rotulo).includes(a)),
      );
    return {
      rua: acha(APELIDOS.rua),
      bairro: acha(APELIDOS.bairro),
      cidade: acha(APELIDOS.cidade),
      vistoriante: acha(APELIDOS.vistoriante),
    };
  }, [campos]);

  const valorDe = (r: any, campo: any): string => {
    if (!campo) return "";
    const v = r.dados?.[campo.id];
    return Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
  };

  // Quem preencheu: a pergunta do formulário quando existir, senão o respondente.
  const vistorianteDe = (r: any): string =>
    campoPor.vistoriante
      ? valorDe(r, campoPor.vistoriante)
      : r.respondente_nome || r.respondente_email || "";

  const opcoesDe = (fn: (r: any) => string) =>
    Array.from(new Set((respostas as any[]).map(fn).filter((v) => v.trim() !== ""))).sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );

  const opcoes = useMemo(
    () => ({
      rua: campoPor.rua ? opcoesDe((r) => valorDe(r, campoPor.rua)) : [],
      bairro: campoPor.bairro ? opcoesDe((r) => valorDe(r, campoPor.bairro)) : [],
      cidade: campoPor.cidade ? opcoesDe((r) => valorDe(r, campoPor.cidade)) : [],
      vistoriante: opcoesDe(vistorianteDe),
    }),
    [respostas, campoPor],
  );

  const filtradas = useMemo(() => {
    return (respostas as any[]).filter((r) => {
      const dia = dataSP(r.created_at);
      if (dataIni && dia < dataIni) return false;
      if (dataFim && dia > dataFim) return false;
      if (fRua && valorDe(r, campoPor.rua) !== fRua) return false;
      if (fBairro && valorDe(r, campoPor.bairro) !== fBairro) return false;
      if (fCidade && valorDe(r, campoPor.cidade) !== fCidade) return false;
      if (fVistoriante && vistorianteDe(r) !== fVistoriante) return false;
      return true;
    });
  }, [respostas, campoPor, dataIni, dataFim, fRua, fBairro, fCidade, fVistoriante]);

  const filtroAtivo =
    Boolean(dataIni || dataFim || fRua || fBairro || fCidade || fVistoriante);

  const limparFiltros = () => {
    setDataIni("");
    setDataFim("");
    setFRua("");
    setFBairro("");
    setFCidade("");
    setFVistoriante("");
  };

  /** Assina em lote os caminhos das fotos para o PDF conseguir baixá-las. */
  const resolverUrls = async (paths: string[]): Promise<Record<string, string>> => {
    const mapa: Record<string, string> = {};
    const unicos = Array.from(new Set(paths));
    for (let i = 0; i < unicos.length; i += 100) {
      const lote = unicos.slice(i, i + 100);
      const { data, error } = await supabase.storage
        .from("fotos-obras")
        .createSignedUrls(lote, 3600);
      if (error) continue;
      for (const item of data ?? []) {
        if (item.signedUrl && item.path) mapa[item.path] = item.signedUrl;
      }
    }
    return mapa;
  };

  const exportar = async (somente?: any) => {
    const titulo = form?.titulo ?? "respostas";
    // Sem seleção individual, exporta exatamente o que está filtrado na tela.
    const lista = (somente ? [somente] : filtradas) as any[];
    if (!lista.length) return;
    const chave = somente ? somente.id : "todos";
    setExportando(chave);
    try {
      if (formato === "csv") return exportarCSV(titulo, campos as any, lista);
      if (formato === "xlsx") return exportarExcel(titulo, campos as any, lista);

      const progresso = (feitas: number, total: number) => {
        if (total > 4 && feitas % 5 === 0) {
          toast.loading(`Montando PDF — ${feitas} de ${total} fotos`, { id: "pdf-fotos" });
        }
      };
      // Quem está gerando o relatório (vai no cabeçalho, como no modelo do Coletum)
      const geradoPor =
        (user?.user_metadata as any)?.display_name || user?.email || undefined;

      // Um PDF por rua, todos num .zip (só no "exportar tudo/filtrados").
      if (!somente && porRua && campoPor.rua) {
        const grupos = separarPorRua(
          lista,
          (r) => valorDe(r, campoPor.rua),
          (r) => valorDe(r, campoPor.bairro),
        );
        const [{ default: JSZip }, logo, cfgRel] = await Promise.all([
          import("jszip"),
          formato === "pdf-detalhado"
            ? supabase.storage.from("fotos-obras").createSignedUrl(LOGO_FORM_PATH(id), 3600)
            : Promise.resolve({ data: null }),
          formato === "pdf-detalhado" ? lerConfigRelatorio(id) : Promise.resolve(null),
        ]);
        const zip = new JSZip();
        for (let i = 0; i < grupos.length; i++) {
          const g = grupos[i];
          toast.loading(`Montando PDFs por rua — ${i + 1} de ${grupos.length}: ${g.nome}`, {
            id: "pdf-fotos",
          });
          const blob =
            formato === "pdf-tabela"
              ? await exportarPDFTabela(titulo, campos as any, g.respostas, resolverUrls, undefined, false)
              : await exportarPDFDetalhado(
                  titulo,
                  campos as any,
                  g.respostas,
                  resolverUrls,
                  undefined,
                  geradoPor,
                  (logo as any)?.data?.signedUrl ?? undefined,
                  cfgRel ? nomeCabecalhoDe(cfgRel as any) : undefined,
                  false,
                );
          zip.file(`${g.nome}.pdf`, blob);
        }
        toast.loading("Compactando o .zip…", { id: "pdf-fotos" });
        const arquivoZip = await zip.generateAsync({ type: "blob" });
        baixar(arquivoZip, `${nomeArquivo(titulo)} - por rua.zip`);
        toast.dismiss("pdf-fotos");
        toast.success(`${grupos.length} PDF(s), um por rua, no arquivo .zip`);
        return;
      }

      if (formato === "pdf-tabela") {
        await exportarPDFTabela(titulo, campos as any, lista, resolverUrls, progresso);
      } else {
        // Logo próprio do formulário (se foi enviado no construtor); senão o padrão
        const [{ data: logoAssinado }, cfgRelatorio] = await Promise.all([
          supabase.storage.from("fotos-obras").createSignedUrl(LOGO_FORM_PATH(id), 600),
          lerConfigRelatorio(id),
        ]);
        await exportarPDFDetalhado(
          titulo,
          campos as any,
          lista,
          resolverUrls,
          progresso,
          geradoPor,
          logoAssinado?.signedUrl ?? undefined,
          nomeCabecalhoDe(cfgRelatorio),
        );
      }
      toast.dismiss("pdf-fotos");
    } catch (e: any) {
      toast.dismiss("pdf-fotos");
      toast.error(e?.message ?? "Não foi possível gerar o arquivo.");
    } finally {
      setExportando(null);
    }
  };

  // --- exclusão (respostas de teste etc.) ---
  const qc = useQueryClient();
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [paraExcluir, setParaExcluir] = useState<any[] | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const alternarSelecao = (rid: string) =>
    setSelecionadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(rid)) nova.delete(rid);
      else nova.add(rid);
      return nova;
    });
  const todasFiltradasMarcadas =
    filtradas.length > 0 && filtradas.every((r: any) => selecionadas.has(r.id));

  /**
   * Apaga as respostas e os arquivos delas. As fotos que o encarregado logado
   * mandou pelo formulário também foram para o acervo (tabela fotos), então
   * saem de lá junto.
   */
  const excluirRespostas = async (lista: any[]) => {
    setExcluindo(true);
    try {
      const ids = lista.map((r) => r.id);
      const { data: apagadas, error } = await supabase
        .from("formulario_respostas")
        .delete()
        .in("id", ids)
        .select("id");
      if (error) throw error;
      if (!apagadas || apagadas.length === 0) {
        throw new Error("Sem permissão para excluir respostas (só administrador ou analista).");
      }
      const caminhos = lista
        .flatMap((r) => (r.arquivos ?? []) as Array<{ path?: string }>)
        .map((a) => a.path)
        .filter((c): c is string => Boolean(c));
      if (caminhos.length > 0) {
        await (supabase.from("fotos") as any)
          .delete()
          .eq("formulario_id", id)
          .in("storage_path", caminhos);
        for (let i = 0; i < caminhos.length; i += 100) {
          await supabase.storage.from("fotos-obras").remove(caminhos.slice(i, i + 100));
        }
      }
      toast.success(
        apagadas.length === 1 ? "Resposta excluída." : `${apagadas.length} respostas excluídas.`,
      );
      setSelecionadas(new Set());
      setAberta(null);
      await qc.invalidateQueries({ queryKey: ["formulario-respostas", id] });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível excluir.");
    } finally {
      setExcluindo(false);
      setParaExcluir(null);
    }
  };

  const abrirArquivo = async (path: string) => {
    const { data } = await supabase.storage.from("fotos-obras").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const selectFiltro = (
    label: string,
    valor: string,
    setValor: (v: string) => void,
    lista: string[],
  ) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        className="rounded-lg border bg-background px-2 py-1.5 text-sm min-w-40 max-w-56"
      >
        <option value="">Todos</option>
        {lista.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link
          to="/painel/formularios/$id"
          params={{ id }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={15} /> Voltar ao editor
        </Link>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Formato</label>
          <select
            value={formato}
            onChange={(e) => setFormato(e.target.value as Formato)}
            className="rounded-lg border bg-background px-2 py-2 text-sm"
          >
            <option value="pdf-detalhado">PDF (com as fotos)</option>
            <option value="pdf-tabela">PDF (tabela com miniaturas)</option>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV</option>
          </select>
          {formato.startsWith("pdf") && campoPor.rua && (
            <label
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"
              title="Marcado: um PDF para cada rua, todos num arquivo .zip. Desmarcado: tudo num PDF só."
            >
              <input
                type="checkbox"
                checked={porRua}
                onChange={(e) => setPorRua(e.target.checked)}
                className="size-4"
              />
              Um PDF por rua (.zip)
            </label>
          )}
          <button
            onClick={() => exportar()}
            disabled={filtradas.length === 0 || exportando !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {exportando === "todos" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : formato === "xlsx" ? (
              <FileSpreadsheet size={14} />
            ) : (
              <Download size={14} />
            )}
            {filtroAtivo
              ? `Exportar filtrados (${filtradas.length})`
              : `Exportar tudo (${filtradas.length})`}
          </button>
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-3xl p-5 text-white"
        style={{ backgroundImage: FORM_GRAD, boxShadow: FORM_SHADOW }}
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <h1 className="relative text-2xl font-bold flex items-center gap-2">
          <FileText size={20} /> {form?.titulo}
        </h1>
        <p className="relative text-sm text-white/85 mt-1">
          {filtroAtivo
            ? `${filtradas.length} de ${respostas.length} resposta${respostas.length === 1 ? "" : "s"} (filtrado)`
            : `${respostas.length} resposta${respostas.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Filter size={14} /> Filtros
          </span>
          {filtroAtivo && (
            <button
              onClick={limparFiltros}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
            >
              <X size={12} /> Limpar
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">De</span>
            <input
              type="date"
              value={dataIni}
              onChange={(e) => setDataIni(e.target.value)}
              className="rounded-lg border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Até</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="rounded-lg border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          {selectFiltro("Vistoriante", fVistoriante, setFVistoriante, opcoes.vistoriante)}
          {campoPor.cidade && selectFiltro("Cidade", fCidade, setFCidade, opcoes.cidade)}
          {campoPor.bairro && selectFiltro("Bairro", fBairro, setFBairro, opcoes.bairro)}
          {campoPor.rua && selectFiltro("Rua", fRua, setFRua, opcoes.rua)}
        </div>
        {!campoPor.rua && !campoPor.bairro && !campoPor.cidade && (
          <p className="mt-2 text-xs text-muted-foreground">
            Para filtrar por rua, bairro ou cidade, o formulário precisa ter perguntas com esses
            nomes — os filtros aparecem sozinhos assim que elas existirem.
          </p>
        )}
      </div>

      {filtradas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={todasFiltradasMarcadas}
              onChange={() =>
                setSelecionadas(
                  todasFiltradasMarcadas ? new Set() : new Set(filtradas.map((r: any) => r.id)),
                )
              }
            />
            Selecionar todas{filtroAtivo ? " as filtradas" : ""}
          </label>
          {selecionadas.size > 0 && (
            <button
              onClick={() =>
                setParaExcluir((respostas as any[]).filter((r) => selecionadas.has(r.id)))
              }
              disabled={excluindo}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 size={14} /> Excluir selecionadas ({selecionadas.size})
            </button>
          )}
        </div>
      )}

      <div className="rounded-2xl border bg-card divide-y shadow-lg">
        {filtradas.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {respostas.length === 0
              ? "Nenhuma resposta recebida ainda."
              : "Nenhuma resposta corresponde aos filtros."}
          </div>
        )}
        {filtradas.map((r: any) => {
          const open = aberta === r.id;
          return (
            <div key={r.id}>
              <div className="flex items-center gap-2 pr-3">
                <input
                  type="checkbox"
                  checked={selecionadas.has(r.id)}
                  onChange={() => alternarSelecao(r.id)}
                  aria-label="Selecionar resposta"
                  className="ml-3"
                />
                <button
                  onClick={() => setAberta(open ? null : r.id)}
                  className="flex-1 flex items-center gap-3 p-3 hover:bg-accent/40 text-left"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-sm">
                      {r.respondente_nome || r.respondente_email || "Anônimo"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                      {campoPor.rua && valorDe(r, campoPor.rua) && ` · ${valorDe(r, campoPor.rua)}`}
                      {campoPor.bairro &&
                        valorDe(r, campoPor.bairro) &&
                        ` · ${valorDe(r, campoPor.bairro)}`}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</div>
                </button>
                <button
                  onClick={() => exportar(r)}
                  disabled={exportando !== null}
                  title="Baixar esta resposta no formato selecionado"
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                >
                  {exportando === r.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <FileDown size={13} />
                  )}
                  Baixar
                </button>
                <button
                  onClick={() => setParaExcluir([r])}
                  disabled={excluindo}
                  title="Excluir esta resposta"
                  className="inline-flex items-center rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {open && (
                <div className="p-4 bg-muted/30 space-y-3 text-sm">
                  {(campos as any[]).map((c: any) => {
                    if (c.tipo === "secao") {
                      return (
                        <div key={c.id} className="font-bold border-b pb-1">
                          {c.rotulo}
                        </div>
                      );
                    }
                    const v = r.dados?.[c.id];
                    const arquivosCampo = (r.arquivos ?? []).filter(
                      (a: any) => a.campo_id === c.id,
                    );
                    return (
                      <div key={c.id}>
                        <div className="text-xs font-semibold text-muted-foreground">
                          {c.rotulo}
                        </div>
                        {c.tipo === "arquivo" || c.tipo === "foto" ? (
                          arquivosCampo.length ? (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {arquivosCampo.map((a: any, i: number) => (
                                <button
                                  key={i}
                                  onClick={() => abrirArquivo(a.path)}
                                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
                                >
                                  <Paperclip size={12} /> {a.nome}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="italic text-muted-foreground">—</div>
                          )
                        ) : (
                          <div className="whitespace-pre-wrap">
                            {Array.isArray(v) ? (
                              v.join(", ")
                            ) : (
                              v || <span className="italic text-muted-foreground">—</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <AlertDialog open={paraExcluir !== null} onOpenChange={(o) => !o && !excluindo && setParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {paraExcluir?.length === 1
                ? "Excluir esta resposta?"
                : `Excluir ${paraExcluir?.length ?? 0} respostas?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              As respostas e as fotos/arquivos enviados nelas serão apagados de vez. Não dá para
              desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={excluindo}
              onClick={(e) => {
                e.preventDefault();
                if (paraExcluir) void excluirRespostas(paraExcluir);
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {excluindo ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
