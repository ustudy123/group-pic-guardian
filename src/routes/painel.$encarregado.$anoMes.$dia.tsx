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
  storage_url: string | null;
  data_envio: string | null;
  remetente_nome: string | null;
  mime_type: string | null;
};

function DiaPage() {
  const { encarregado, anoMes, dia } = Route.useParams();
  const [busca, setBusca] = useState("");
  const [remetenteFiltro, setRemetenteFiltro] = useState<string>("todos");
  const [horaInicio, setHoraInicio] = useState<string>("");
  const [horaFim, setHoraFim] = useState<string>("");
  const [ordem, setOrdem] = useState<"asc" | "desc">("asc");
  const [aberta, setAberta] = useState<Foto | null>(null);
  const dataPasta = `${anoMes}-${dia}`;

  const { data, isLoading } = useQuery({
    queryKey: ["fotos-dia", encarregado, dataPasta],
    queryFn: async (): Promise<Foto[]> => {
      const { data: enc, error: encErr } = await supabase
        .from("encarregados")
        .select("id")
        .eq("nome", encarregado)
        .maybeSingle();
      if (encErr) throw encErr;
      if (!enc) return [];

      const { data, error } = await supabase
        .from("fotos")
        .select("id, caption, storage_url, data_envio, remetente_nome, mime_type")
        .eq("encarregado_id", enc.id)
        .eq("data_pasta", dataPasta)
        .order("data_envio", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((f) => ({
        id: f.id ?? "",
        caption: f.caption,
        storage_url: f.storage_url,
        data_envio: f.data_envio,
        remetente_nome: f.remetente_nome,
        mime_type: f.mime_type,
      }));
    },
    staleTime: 60_000,
  });

  const remetentes = useMemo(() => {
    const set = new Set<string>();
    data?.forEach((f) => f.remetente_nome && set.add(f.remetente_nome));
    return Array.from(set).sort();
  }, [data]);

  const filtradas = useMemo(() => {
    let arr = data ?? [];
    if (busca.trim()) {
      const q = busca.toLowerCase();
      arr = arr.filter(
        (f) =>
          f.caption?.toLowerCase().includes(q) || f.remetente_nome?.toLowerCase().includes(q)
      );
    }
    if (remetenteFiltro !== "todos") {
      arr = arr.filter((f) => f.remetente_nome === remetenteFiltro);
    }
    if (horaInicio || horaFim) {
      arr = arr.filter((f) => {
        if (!f.data_envio) return false;
        const hora = new Date(f.data_envio).toLocaleTimeString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        if (horaInicio && hora < horaInicio) return false;
        if (horaFim && hora > horaFim) return false;
        return true;
      });
    }
    arr = [...arr].sort((a, b) => {
      const ta = a.data_envio ? new Date(a.data_envio).getTime() : 0;
      const tb = b.data_envio ? new Date(b.data_envio).getTime() : 0;
      return ordem === "asc" ? ta - tb : tb - ta;
    });
    return arr;
  }, [data, busca, remetenteFiltro, horaInicio, horaFim, ordem]);

  const tituloData = useMemo(() => {
    const [y, m, d] = dataPasta.split("-");
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }, [dataPasta]);

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
        <div className="mt-2">
          <h1 className="text-2xl font-bold capitalize">{tituloData}</h1>
          <p className="text-muted-foreground text-sm">{filtradas.length} foto(s)</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border bg-card">
        <input
          type="text"
          placeholder="Buscar por legenda ou remetente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <select
          value={remetenteFiltro}
          onChange={(e) => setRemetenteFiltro(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-2 text-sm"
        >
          <option value="todos">Todos remetentes</option>
          {remetentes.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Hora:</span>
          <input
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
          <span className="text-muted-foreground">até</span>
          <input
            type="time"
            value={horaFim}
            onChange={(e) => setHoraFim(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as "asc" | "desc")}
          className="rounded-md border border-input bg-background px-2 py-2 text-sm"
        >
          <option value="asc">Mais antigas primeiro</option>
          <option value="desc">Mais recentes primeiro</option>
        </select>
        {(busca || remetenteFiltro !== "todos" || horaInicio || horaFim) && (
          <button
            onClick={() => { setBusca(""); setRemetenteFiltro("todos"); setHoraInicio(""); setHoraFim(""); }}
            className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
          >
            Limpar
          </button>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && filtradas.length === 0 && (
        <p className="text-muted-foreground py-8 text-center border rounded-md">
          Nenhuma foto registrada nesse dia
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {filtradas.map((f) => (
          <button
            key={f.id}
            onClick={() => setAberta(f)}
            className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
          >
            {f.storage_url ? (
              <img
                src={f.storage_url}
                alt={f.caption ?? "Foto"}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                sem preview
              </div>
            )}
            <div className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-xs px-2 py-1.5 opacity-0 group-hover:opacity-100 transition flex items-center justify-between gap-2">
              <span className="font-medium">
                {f.data_envio &&
                  new Date(f.data_envio).toLocaleTimeString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
              </span>
              {f.caption && <span className="truncate">{f.caption}</span>}
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
            {aberta.storage_url && (
              <img
                src={aberta.storage_url}
                alt={aberta.caption ?? ""}
                className="w-full max-h-[70vh] object-contain bg-black"
              />
            )}
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-medium">{aberta.remetente_nome ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {aberta.data_envio &&
                      new Date(aberta.data_envio).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}
                  </p>
                </div>
                <div className="flex gap-2">
                  {aberta.storage_url && (
                    <a
                      href={aberta.storage_url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
                    >
                      Baixar foto
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
