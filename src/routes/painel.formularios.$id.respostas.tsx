import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Download, FileText, Paperclip, FileSpreadsheet, FileDown } from "lucide-react";
import { useMemo, useState } from "react";
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


function Respostas() {
  const { id } = Route.useParams();
  const [aberta, setAberta] = useState<string | null>(null);

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

  const camposMap = useMemo(() => {
    const m: Record<string, any> = {};
    campos.forEach((c: any) => (m[c.id] = c));
    return m;
  }, [campos]);

  const [formato, setFormato] = useState<Formato>("pdf-detalhado");

  const exportar = (somente?: any) => {
    const titulo = form?.titulo ?? "respostas";
    const lista = (somente ? [somente] : respostas) as any[];
    if (!lista.length) return;
    if (formato === "csv") return exportarCSV(titulo, campos as any, lista);
    if (formato === "xlsx") return exportarExcel(titulo, campos as any, lista);
    if (formato === "pdf-tabela") return exportarPDFTabela(titulo, campos as any, lista);
    return exportarPDFDetalhado(titulo, campos as any, lista);
  };

  const abrirArquivo = async (path: string) => {
    const { data } = await supabase.storage.from("fotos-obras").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

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
            <option value="pdf-detalhado">PDF (uma resposta por página)</option>
            <option value="pdf-tabela">PDF (tabela)</option>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV</option>
          </select>
          <button
            onClick={() => exportar()}
            disabled={respostas.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {formato === "xlsx" ? <FileSpreadsheet size={14} /> : <Download size={14} />} Exportar
            tudo
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl p-5 text-white" style={{ backgroundImage: FORM_GRAD, boxShadow: FORM_SHADOW }}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <h1 className="relative text-2xl font-bold flex items-center gap-2">
          <FileText size={20} /> {form?.titulo}
        </h1>
        <p className="relative text-sm text-white/85 mt-1">
          {respostas.length} resposta{respostas.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="rounded-2xl border bg-card divide-y shadow-lg">
        {respostas.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma resposta recebida ainda.
          </div>
        )}
        {respostas.map((r: any) => {
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
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</div>
                </button>
                <button
                  onClick={() => exportar(r)}
                  title="Baixar esta resposta no formato selecionado"
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-accent"
                >
                  <FileDown size={13} /> Baixar
                </button>
              </div>

              {open && (
                <div className="p-4 bg-muted/30 space-y-3 text-sm">
                  {campos.map((c: any) => {
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
                        {(c.tipo === "arquivo" || c.tipo === "foto") ? (
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
                            {Array.isArray(v) ? v.join(", ") : v || <span className="italic text-muted-foreground">—</span>}
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
