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
  thumbs: (string | null)[];
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
        .select("data_pasta, storage_url, data_envio")
        .eq("encarregado_id", enc.id)
        .order("data_envio", { ascending: false })
        .limit(2000);
      if (error) throw error;

      const byDay = new Map<string, { storage_url: string | null }[]>();
      for (const f of fotos ?? []) {
        if (!f.data_pasta) continue;
        const arr = byDay.get(f.data_pasta) ?? [];
        arr.push({ storage_url: f.storage_url });
        byDay.set(f.data_pasta, arr);
      }

      const byMonth = new Map<string, Dia[]>();
      for (const [dataPasta, fs] of byDay.entries()) {
        const [y, m, d] = dataPasta.split("-");
        const anoMes = `${y}-${m}`;
        const arr = byMonth.get(anoMes) ?? [];
        arr.push({
          dia: d,
          dataPasta,
          count: fs.length,
          thumbs: fs.slice(0, 4).map((f) => f.storage_url),
        });
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {mes.dias.map((d) => (
              <div
                key={d.dataPasta}
                className="border rounded-md p-3 flex flex-col gap-3"
              >
                <Link
                  to="/painel/$encarregado/$anoMes/$dia"
                  params={{ encarregado, anoMes: mes.anoMes, dia: d.dia }}
                  className="block rounded-md -m-1 p-1 hover:bg-accent transition"
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <div>
                      <div className="text-2xl font-bold leading-none">{d.dia}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {d.count} foto{d.count === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {d.thumbs.map((url, i) => (
                      <div
                        key={i}
                        className="aspect-square rounded overflow-hidden bg-muted"
                      >
                        {url ? (
                          <img
                            src={url}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 4 - d.thumbs.length) }).map(
                      (_, i) => (
                        <div
                          key={`empty-${i}`}
                          className="aspect-square rounded bg-muted/40"
                        />
                      )
                    )}
                  </div>
                  {d.count > 4 && (
                    <div className="text-xs text-muted-foreground mt-2 text-right">
                      + {d.count - 4} foto{d.count - 4 === 1 ? "" : "s"}
                    </div>
                  )}
                </Link>
                <button
                  onClick={() => handleRFO(d.dataPasta)}
                  disabled={gerando === d.dataPasta}
                  className="text-xs rounded-md border border-input px-2 py-1.5 hover:bg-accent disabled:opacity-50"
                >
                  {gerando === d.dataPasta ? "Gerando..." : "📄 Gerar RFO"}
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
