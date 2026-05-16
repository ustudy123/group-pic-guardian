import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { gerarRFO } from "@/lib/gerar-rfo";

export const Route = createFileRoute("/painel/$encarregado")({
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
  const [gerando, setGerando] = useState<string | null>(null);

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

  const handleRFO = async (dataPasta: string) => {
    setGerando(dataPasta);
    try {
      const { data: fotos, error } = await supabase
        .from("vw_fotos_completas")
        .select("storage_url, caption, data_envio")
        .eq("encarregado_nome", encarregado)
        .eq("data_pasta", dataPasta)
        .order("data_envio", { ascending: true });
      if (error) throw error;
      if (!fotos || fotos.length === 0) {
        toast.error("Nenhuma foto nesse dia");
        return;
      }
      await gerarRFO({ encarregado, dataPasta, fotos });
      toast.success("RFO gerado");
    } catch (e) {
      toast.error("Erro ao gerar RFO: " + (e as Error).message);
    } finally {
      setGerando(null);
    }
  };

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

      {data?.map((mes) => (
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
                  <button
                    onClick={() => handleRFO(d.dataPasta)}
                    disabled={gerando === d.dataPasta}
                    className="text-[11px] rounded-md border border-input px-2 py-1 hover:bg-accent disabled:opacity-50 w-full"
                  >
                    {gerando === d.dataPasta ? "Gerando..." : "📄 Gerar RFO"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
