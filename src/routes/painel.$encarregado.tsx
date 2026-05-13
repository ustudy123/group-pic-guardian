import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/painel/$encarregado")({
  component: EncarregadoPage,
});

function EncarregadoPage() {
  const { encarregado } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["encarregado-meses", encarregado],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fotos")
        .select("ano_mes, dia")
        .eq("encarregado", encarregado);
      if (error) throw error;
      const map = new Map<string, Map<string, number>>();
      for (const f of data ?? []) {
        if (!map.has(f.ano_mes)) map.set(f.ano_mes, new Map());
        const dias = map.get(f.ano_mes)!;
        dias.set(f.dia, (dias.get(f.dia) ?? 0) + 1);
      }
      return Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([anoMes, dias]) => ({
          anoMes,
          dias: Array.from(dias.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([dia, count]) => ({ dia, count })),
        }));
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link to="/painel" className="text-sm text-muted-foreground hover:text-foreground">
          ← Encarregados
        </Link>
        <h1 className="text-2xl font-bold mt-2">{encarregado}</h1>
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {!isLoading && (!data || data.length === 0) && (
        <p className="text-muted-foreground">Nenhuma foto ainda.</p>
      )}

      {data?.map((mes) => {
        const [y, m] = mes.anoMes.split("-");
        const nomeMes = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric",
        });
        return (
          <section key={mes.anoMes}>
            <h2 className="text-lg font-semibold mb-3 capitalize">{nomeMes}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {mes.dias.map((d) => (
                <Link
                  key={d.dia}
                  to="/painel/$encarregado/$anoMes/$dia"
                  params={{ encarregado, anoMes: mes.anoMes, dia: d.dia }}
                  className="border rounded-md p-3 text-center hover:bg-accent"
                >
                  <div className="text-xl font-bold">{d.dia}</div>
                  <div className="text-xs text-muted-foreground">{d.count} foto(s)</div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
