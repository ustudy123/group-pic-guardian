import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { gerarRFO } from "@/lib/gerar-rfo";

export const Route = createFileRoute("/painel/$encarregado")({
  component: EncarregadoPage,
});

type Dia = { dia: string; count: number; dataPasta: string };
type Mes = { anoMes: string; label: string; dias: Dia[] };

function EncarregadoPage() {
  const { encarregado } = Route.useParams();
  const [gerando, setGerando] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["encarregado-meses", encarregado],
    queryFn: async (): Promise<Mes[]> => {
      const { data, error } = await supabase
        .from("vw_resumo_diario")
        .select("data_pasta, total_fotos")
        .eq("encarregado_nome", encarregado)
        .order("data_pasta", { ascending: false });
      if (error) throw error;

      const map = new Map<string, Dia[]>();
      for (const r of data ?? []) {
        if (!r.data_pasta) continue;
        const [y, m, d] = r.data_pasta.split("-");
        const anoMes = `${y}-${m}`;
        const arr = map.get(anoMes) ?? [];
        arr.push({ dia: d, count: r.total_fotos ?? 0, dataPasta: r.data_pasta });
        map.set(anoMes, arr);
      }
      return Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([anoMes, dias]) => {
          const [y, m] = anoMes.split("-");
          const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
          });
          return { anoMes, label, dias };
        });
    },
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
      </div>

      {isLoading && (
        <div className="space-y-4">
          <div className="h-6 w-40 rounded bg-muted animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-24 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {!isLoading && (!data || data.length === 0) && (
        <p className="text-muted-foreground">Nenhuma foto registrada ainda.</p>
      )}

      {data?.map((mes) => (
        <section key={mes.anoMes}>
          <h2 className="text-lg font-semibold mb-3 capitalize">{mes.label}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {mes.dias.map((d) => (
              <div
                key={d.dataPasta}
                className="border rounded-md p-3 flex flex-col gap-2"
              >
                <Link
                  to="/painel/$encarregado/$anoMes/$dia"
                  params={{ encarregado, anoMes: mes.anoMes, dia: d.dia }}
                  className="text-center hover:bg-accent rounded-md py-2"
                >
                  <div className="text-2xl font-bold">{d.dia}</div>
                  <div className="text-xs text-muted-foreground">{d.count} foto(s)</div>
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
