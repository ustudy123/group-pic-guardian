import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/painel/")({
  component: PainelHome,
});

function todayStr() {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return {
    anoMes: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    dia: String(d.getUTCDate()).padStart(2, "0"),
  };
}

function PainelHome() {
  const { data, isLoading } = useQuery({
    queryKey: ["painel-encarregados"],
    queryFn: async () => {
      const { data: grupos, error } = await supabase
        .from("grupos")
        .select("id, encarregado, nome_exibicao, ultima_foto_em, ativo")
        .order("encarregado");
      if (error) throw error;

      const { data: fotos } = await supabase
        .from("fotos")
        .select("encarregado, ano_mes, dia");

      const { anoMes, dia } = todayStr();
      const map = new Map<string, { total: number; hoje: number; ultima: string | null; grupos: number }>();
      for (const g of grupos ?? []) {
        const cur = map.get(g.encarregado) ?? { total: 0, hoje: 0, ultima: null, grupos: 0 };
        cur.grupos += 1;
        if (g.ultima_foto_em && (!cur.ultima || g.ultima_foto_em > cur.ultima)) cur.ultima = g.ultima_foto_em;
        map.set(g.encarregado, cur);
      }
      for (const f of fotos ?? []) {
        const cur = map.get(f.encarregado) ?? { total: 0, hoje: 0, ultima: null, grupos: 0 };
        cur.total += 1;
        if (f.ano_mes === anoMes && f.dia === dia) cur.hoje += 1;
        map.set(f.encarregado, cur);
      }
      return Array.from(map.entries()).map(([nome, v]) => ({ nome, ...v }));
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-20 space-y-3">
        <h2 className="text-xl font-semibold">Nenhum grupo registrado ainda</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Quando o bot do WhatsApp for conectado e a primeira foto for enviada num grupo,
          ele aparece aqui automaticamente.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Encarregados</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((e) => (
          <Link
            key={e.nome}
            to="/painel/$encarregado"
            params={{ encarregado: e.nome }}
            className="border rounded-lg p-5 hover:bg-accent transition"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">{e.nome}</h2>
              <span className="text-xs text-muted-foreground">{e.grupos} grupo(s)</span>
            </div>
            <div className="mt-3 flex items-baseline gap-4 text-sm">
              <div>
                <div className="text-2xl font-bold">{e.hoje}</div>
                <div className="text-muted-foreground text-xs">fotos hoje</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{e.total}</div>
                <div className="text-muted-foreground text-xs">total</div>
              </div>
            </div>
            {e.ultima && (
              <p className="mt-3 text-xs text-muted-foreground">
                Última foto: {new Date(e.ultima).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
