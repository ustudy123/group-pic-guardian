import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NovoEncarregadoDialog } from "@/components/novo-encarregado-dialog";

export const Route = createFileRoute("/painel/")({
  component: PainelHome,
});

type Row = {
  id: string;
  nome: string;
  grupo_whatsapp_nome: string | null;
  total: number;
  hoje: number;
  ultima: string | null;
};

function todayBRT(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function PainelHome() {
  const { data, isLoading } = useQuery({
    queryKey: ["painel-encarregados"],
    queryFn: async (): Promise<Row[]> => {
      const { data: encs, error } = await supabase
        .from("encarregados")
        .select("id, nome, grupo_whatsapp_nome, ativo")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;

      const { data: resumo } = await supabase
        .from("vw_resumo_diario")
        .select("encarregado_id, data_pasta, total_fotos, ultima_foto");

      const hoje = todayBRT();
      const map = new Map<string, { total: number; hoje: number; ultima: string | null }>();
      for (const r of resumo ?? []) {
        if (!r.encarregado_id) continue;
        const cur = map.get(r.encarregado_id) ?? { total: 0, hoje: 0, ultima: null };
        cur.total += r.total_fotos ?? 0;
        if (r.data_pasta === hoje) cur.hoje += r.total_fotos ?? 0;
        if (r.ultima_foto && (!cur.ultima || r.ultima_foto > cur.ultima)) cur.ultima = r.ultima_foto;
        map.set(r.encarregado_id, cur);
      }

      return (encs ?? []).map((e) => {
        const v = map.get(e.id) ?? { total: 0, hoje: 0, ultima: null };
        return {
          id: e.id,
          nome: e.nome,
          grupo_whatsapp_nome: e.grupo_whatsapp_nome,
          ...v,
        };
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Encarregados</h1>
        <NovoEncarregadoDialog />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-lg border bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && (!data || data.length === 0) && (
        <div className="text-center py-14 space-y-3 border rounded-lg">
          <h2 className="text-xl font-semibold">Nenhum encarregado cadastrado</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Clique em "+ Novo encarregado" para começar.
          </p>
        </div>
      )}

      {!isLoading && data && data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((e) => (
            <Link
              key={e.id}
              to="/painel/$encarregado"
              params={{ encarregado: e.nome }}
              className="border rounded-lg p-5 hover:bg-accent transition"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">{e.nome}</h2>
              </div>
              {e.grupo_whatsapp_nome && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {e.grupo_whatsapp_nome}
                </p>
              )}
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
                  Última foto:{" "}
                  {new Date(e.ultima).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
