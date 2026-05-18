import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import { X, Calendar, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/painel/$encarregado/")({
  component: EncarregadoPage,
});

type Dia = {
  dia: string;
  dataPasta: string;
  count: number;
};
type Mes = { anoMes: string; label: string; dias: Dia[] };

function EncarregadoPage() {
  const { encarregado } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["encarregado-fotos", encarregado],
    queryFn: async (): Promise<Mes[]> => {
      const { data: enc, error: encErr } = await supabase
        .from("encarregados")
        .select("id")
        .eq("nome", encarregado)
        .maybeSingle();
      if (encErr) throw encErr;
      if (!enc) return [];

      const { data: fotos, error } = await supabase
        .from("fotos")
        .select("data_pasta")
        .eq("encarregado_id", enc.id)
        .order("data_envio", { ascending: false })
        .limit(5000);
      if (error) throw error;

      const byDay = new Map<string, number>();
      for (const f of fotos ?? []) {
        if (!f.data_pasta) continue;
        byDay.set(f.data_pasta, (byDay.get(f.data_pasta) ?? 0) + 1);
      }

      const byMonth = new Map<string, Dia[]>();
      for (const [dataPasta, count] of byDay.entries()) {
        const [y, m, d] = dataPasta.split("-");
        const anoMes = `${y}-${m}`;
        const arr = byMonth.get(anoMes) ?? [];
        arr.push({ dia: d, dataPasta, count });
        byMonth.set(anoMes, arr);
      }

      return Array.from(byMonth.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([anoMes, dias]) => {
          const [y, m] = anoMes.split("-");
          const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
          });
          return {
            anoMes,
            label,
            dias: dias.sort((a, b) => b.dia.localeCompare(a.dia)),
          };
        });
    },
    staleTime: 60_000,
  });

  const [filtroAno, setFiltroAno] = useState<string>("todos");
  const [filtroMes, setFiltroMes] = useState<string>("todos");
  const [filtroDia, setFiltroDia] = useState<string>("");

  const anosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    data?.forEach((m) => set.add(m.anoMes.split("-")[0]));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [data]);

  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    data?.forEach((m) => {
      const [y, mm] = m.anoMes.split("-");
      if (filtroAno === "todos" || y === filtroAno) set.add(mm);
    });
    return Array.from(set).sort();
  }, [data, filtroAno]);

  const filtrado = useMemo(() => {
    if (!data) return [];
    return data
      .map((mes) => {
        const [y, mm] = mes.anoMes.split("-");
        if (filtroAno !== "todos" && y !== filtroAno) return null;
        if (filtroMes !== "todos" && mm !== filtroMes) return null;
        const dias = filtroDia
          ? mes.dias.filter((d) => d.dia.includes(filtroDia.padStart(2, "0")) || d.dia.includes(filtroDia))
          : mes.dias;
        if (dias.length === 0) return null;
        return { ...mes, dias };
      })
      .filter(Boolean) as typeof data;
  }, [data, filtroAno, filtroMes, filtroDia]);

  const limparFiltros = () => {
    setFiltroAno("todos");
    setFiltroMes("todos");
    setFiltroDia("");
  };

  const temFiltro = filtroAno !== "todos" || filtroMes !== "todos" || filtroDia !== "";

  const nomesMeses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/painel" className="text-sm text-muted-foreground hover:text-foreground">
          ← Encarregados
        </Link>
        <h1 className="text-2xl font-bold mt-2">{encarregado}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Clique em um dia pra ver todas as fotos em tela cheia
        </p>
      </div>

      {/* Filtros */}
      {!isLoading && data && data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border bg-card">
          <Calendar size={16} className="text-muted-foreground" />
          <select
            value={filtroAno}
            onChange={(e) => { setFiltroAno(e.target.value); setFiltroMes("todos"); }}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="todos">Todos os anos</option>
            {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select
            value={filtroMes}
            onChange={(e) => setFiltroMes(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="todos">Todos os meses</option>
            {mesesDisponiveis.map((m) => (
              <option key={m} value={m}>{nomesMeses[Number(m) - 1]}</option>
            ))}
          </select>
          <div className="relative">
            <input
              type="number"
              min={1}
              max={31}
              placeholder="Dia"
              value={filtroDia}
              onChange={(e) => setFiltroDia(e.target.value)}
              className="w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          {temFiltro && (
            <button
              onClick={limparFiltros}
              className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
            >
              <X size={12} /> Limpar
            </button>
          )}
          <div className="text-xs text-muted-foreground ml-auto">
            {filtrado.reduce((acc, m) => acc + m.dias.length, 0)} dia(s)
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-4">
          <div className="h-6 w-40 rounded bg-muted animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-44 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {!isLoading && (!data || data.length === 0) && (
        <p className="text-muted-foreground py-8 text-center border rounded-md">
          Nenhuma foto registrada ainda.
        </p>
      )}

      {!isLoading && data && data.length > 0 && filtrado.length === 0 && (
        <p className="text-muted-foreground py-8 text-center border rounded-md">
          Nenhum dia corresponde aos filtros aplicados.
        </p>
      )}

      {filtrado.map((mes) => (
        <section key={mes.anoMes}>
          <h2 className="text-lg font-semibold mb-3 capitalize">{mes.label}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {mes.dias.map((d) => {
              const date = new Date(`${d.dataPasta}T12:00:00`);
              const weekday = date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
              return (
                <div key={d.dataPasta} className="flex flex-col items-center gap-2 group">
                  <Link
                    to="/painel/$encarregado/$anoMes/$dia"
                    params={{ encarregado, anoMes: mes.anoMes, dia: d.dia }}
                    className="relative block w-full aspect-[5/4] transition-transform duration-200 group-hover:-translate-y-1"
                    aria-label={`Abrir pasta do dia ${d.dia}`}
                  >
                    {/* Folder tab */}
                    <div
                      className="absolute top-0 left-0 h-[22%] w-[55%] rounded-tl-md rounded-tr-xl"
                      style={{
                        background: "linear-gradient(180deg, #f5b913 0%, #e6a508 100%)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)",
                      }}
                    />
                    {/* Paper peeking */}
                    <div className="absolute top-[18%] left-[3%] right-[3%] bottom-[6%] rounded-md bg-white shadow-sm" />
                    {/* Folder front */}
                    <div
                      className="absolute top-[20%] left-0 right-0 bottom-0 rounded-md rounded-tl-none flex flex-col items-center justify-center text-[#5a3d00]"
                      style={{
                        background:
                          "linear-gradient(160deg, #ffd84a 0%, #fbc419 45%, #e8a909 100%)",
                        boxShadow:
                          "0 10px 20px -8px rgba(180,120,0,0.45), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -3px 0 rgba(0,0,0,0.08)",
                      }}
                    >
                      <div className="text-4xl font-black leading-none drop-shadow-sm">
                        {d.dia}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider opacity-80 mt-1">
                        {weekday}
                      </div>
                      <div className="text-xs font-semibold mt-2 px-2 py-0.5 rounded-full bg-white/40">
                        {d.count} foto{d.count === 1 ? "" : "s"}
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
