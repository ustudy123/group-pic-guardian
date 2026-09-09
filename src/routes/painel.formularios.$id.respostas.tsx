import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FORM_GRAD, FORM_SHADOW } from "@/lib/ui-form";
import {
  exportarCSV,
  exportarExcel,
  exportarPDFTabela,
  exportarPDFDetalhado,
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

function Respostas() {
  const { id } = Route.useParams();
  const [aberta, setAberta] = useState<string | null>(null);
  const [formato, setFormato] = useState<Formato>("pdf-detalhado");
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
      if (formato === "pdf-tabela") return exportarPDFTabela(titulo, campos as any, lista);
      await exportarPDFDetalhado(titulo, campos as any, lista, resolverUrls, (feitas, total) => {
        if (total > 4 && feitas % 5 === 0) {
          toast.loading(`Montando PDF — ${feitas} de ${total} fotos`, { id: "pdf-fotos" });
        }
      });
      toast.dismiss("pdf-fotos");
    } catch (e: any) {
      toast.dismiss("pdf-fotos");
      toast.error(e?.message ?? "Não foi possível gerar o arquivo.");
    } finally {
      setExportando(null);
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
            <option value="pdf-tabela">PDF (tabela)</option>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV</option>
          </select>
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
    </div>
  );
}
