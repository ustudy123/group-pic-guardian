import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppBotStatusCard } from "@/components/whatsapp-bot-status-card";

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
      const { data: encarregados, error } = await supabase
        .from("encarregados")
        .select("id, nome, grupo_whatsapp_nome")
        .order("nome");
      if (error) throw error;

      const { data: grupos } = await supabase
        .from("grupos")
        .select("encarregado, ultima_foto_em");

      const { data: fotos } = await supabase
        .from("fotos")
        .select("encarregado_id, data_pasta");

      const { anoMes, dia } = todayStr();
      const hojeStr = `${anoMes}-${dia}`;
      const map = new Map<string, { total: number; hoje: number; ultima: string | null; grupos: number }>();
      for (const e of encarregados ?? []) {
        map.set(e.nome, { total: 0, hoje: 0, ultima: null, grupos: 1 });
      }
      for (const g of grupos ?? []) {
        const cur = map.get(g.encarregado) ?? { total: 0, hoje: 0, ultima: null, grupos: 0 };
        if (g.ultima_foto_em && (!cur.ultima || g.ultima_foto_em > cur.ultima)) cur.ultima = g.ultima_foto_em;
        map.set(g.encarregado, cur);
      }
      const idToNome = new Map((encarregados ?? []).map((e) => [e.id, e.nome]));
      for (const f of fotos ?? []) {
        const nome = idToNome.get(f.encarregado_id);
        if (!nome) continue;
        const cur = map.get(nome) ?? { total: 0, hoje: 0, ultima: null, grupos: 0 };
        cur.total += 1;
        if (f.data_pasta === hojeStr) cur.hoje += 1;
        map.set(nome, cur);
      }
      return Array.from(map.entries()).map(([nome, v]) => ({ nome, ...v }));
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;

  if (!data || data.length === 0) {
    return (
      <div className="space-y-6">
        <WhatsAppBotStatusCard />
        <div className="text-center py-14 space-y-3">
          <h2 className="text-xl font-semibold">Nenhum grupo registrado ainda</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Quando o bot do WhatsApp for conectado e a primeira foto for enviada num grupo,
            ele aparece aqui automaticamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WhatsAppBotStatusCard />
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
    </div>
  );
}
