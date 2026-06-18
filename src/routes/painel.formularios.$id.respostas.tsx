import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Download, FileText, Paperclip } from "lucide-react";
import { useMemo, useState } from "react";

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

  const exportar = () => {
    const camposExp = campos.filter((c: any) => c.tipo !== "secao");
    const header = ["Data", "Respondente", ...camposExp.map((c: any) => c.rotulo)];
    const linhas = respostas.map((r: any) => {
      const dados = r.dados ?? {};
      return [
        new Date(r.created_at).toLocaleString("pt-BR"),
        r.respondente_nome || r.respondente_email || "—",
        ...camposExp.map((c: any) => {
          const v = dados[c.id];
          return Array.isArray(v) ? v.join("; ") : String(v ?? "");
        }),
      ];
    });
    const csv = [header, ...linhas]
      .map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form?.titulo ?? "respostas"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        <button
          onClick={exportar}
          disabled={respostas.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
        >
          <Download size={14} /> Exportar CSV
        </button>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText size={20} /> {form?.titulo}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {respostas.length} resposta{respostas.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="rounded-xl border bg-card divide-y">
        {respostas.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma resposta recebida ainda.
          </div>
        )}
        {respostas.map((r: any) => {
          const open = aberta === r.id;
          return (
            <div key={r.id}>
              <button
                onClick={() => setAberta(open ? null : r.id)}
                className="w-full flex items-center gap-3 p-3 hover:bg-accent/40 text-left"
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
