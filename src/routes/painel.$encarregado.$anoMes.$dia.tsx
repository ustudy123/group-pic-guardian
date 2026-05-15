import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/painel/$encarregado/$anoMes/$dia")({
  component: DiaPage,
});

type Foto = {
  id: string;
  caption: string | null;
  storage_path: string;
  data_envio: string;
  remetente_nome: string | null;
  mime_type: string | null;
  signedUrl?: string;
};

function DiaPage() {
  const { encarregado, anoMes, dia } = Route.useParams();
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<Foto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["fotos-dia", encarregado, anoMes, dia],
    queryFn: async (): Promise<Foto[]> => {
      const { data: encs, error: errE } = await supabase
        .from("encarregados")
        .select("id")
        .eq("nome", encarregado);
      if (errE) throw errE;
      const ids = (encs ?? []).map((e) => e.id);
      if (ids.length === 0) return [];

      const dataPasta = `${anoMes}-${dia}`;
      const { data, error } = await supabase
        .from("fotos")
        .select("id, caption, storage_path, data_envio, remetente_nome, mime_type")
        .in("encarregado_id", ids)
        .eq("data_pasta", dataPasta)
        .order("data_envio", { ascending: true });
      if (error) throw error;

      const paths = (data ?? []).map((f) => f.storage_path);
      const { data: urls } = await supabase.storage
        .from("obras-fotos")
        .createSignedUrls(paths, 60 * 60);
      const urlMap = new Map(urls?.map((u) => [u.path, u.signedUrl]));
      return (data ?? []).map((f) => ({ ...f, signedUrl: urlMap.get(f.storage_path) ?? undefined }));
    },
  });

  const filtradas = useMemo(() => {
    if (!busca.trim()) return data ?? [];
    const q = busca.toLowerCase();
    return (data ?? []).filter(
      (f) =>
        f.caption?.toLowerCase().includes(q) || f.remetente_nome?.toLowerCase().includes(q)
    );
  }, [data, busca]);

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/painel/$encarregado"
          params={{ encarregado }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {encarregado}
        </Link>
        <h1 className="text-2xl font-bold mt-2">
          {dia}/{anoMes.split("-")[1]}/{anoMes.split("-")[0]}
        </h1>
        <p className="text-muted-foreground text-sm">{filtradas.length} foto(s)</p>
      </div>

      <input
        type="text"
        placeholder="Buscar por legenda ou remetente..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
      />

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {filtradas.map((f) => (
          <button
            key={f.id}
            onClick={() => setAberta(f)}
            className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
          >
            {f.signedUrl ? (
              <img
                src={f.signedUrl}
                alt={f.caption ?? "Foto"}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                sem preview
              </div>
            )}
            <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-2 py-1 opacity-0 group-hover:opacity-100 transition">
              {new Date(f.data_envio).toLocaleTimeString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </button>
        ))}
      </div>

      {aberta && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setAberta(null)}
        >
          <div
            className="max-w-5xl w-full bg-card rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {aberta.signedUrl && (
              <img src={aberta.signedUrl} alt={aberta.caption ?? ""} className="w-full max-h-[70vh] object-contain bg-black" />
            )}
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{aberta.remetente_nome ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(aberta.data_envio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </p>
                </div>
                <div className="flex gap-2">
                  {aberta.signedUrl && (
                    <a
                      href={aberta.signedUrl}
                      download
                      className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
                    >
                      Baixar
                    </a>
                  )}
                  <button
                    onClick={() => setAberta(null)}
                    className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    Fechar
                  </button>
                </div>
              </div>
              {aberta.caption && <p className="text-sm">{aberta.caption}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
