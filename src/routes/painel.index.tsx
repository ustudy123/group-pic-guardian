import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, Camera, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NovoEncarregadoDialog } from "@/components/novo-encarregado-dialog";
import waGroupLogo from "@/assets/wa-group.png";

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

  // WhatsApp-inspired green palette variations per card
  const palettes = [
    { primary: "#25D366", deep: "#128C7E", dark: "#075E54", tint: "#DCF8C6", label: "Equipe" },
    { primary: "#1FAD56", deep: "#0F7A65", dark: "#064E45", tint: "#D4F3C2", label: "Obra" },
    { primary: "#34D399", deep: "#0E8C6E", dark: "#0a5d4a", tint: "#D1FAE5", label: "Campo" },
    { primary: "#22C55E", deep: "#15803D", dark: "#14532D", tint: "#DCFCE7", label: "Grupo" },
    { primary: "#2DD4BF", deep: "#0F766E", dark: "#134E4A", tint: "#CCFBF1", label: "Time" },
    { primary: "#10B981", deep: "#047857", dark: "#064E3B", tint: "#D1FAE5", label: "Frente" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent-orange)" }}>
            <span className="w-6 h-px" style={{ background: "var(--accent-orange)" }} /> Equipe de campo
          </div>
          <h1 className="text-3xl font-black tracking-tight">Encarregados</h1>
        </div>
        <NovoEncarregadoDialog />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 rounded-2xl border bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && (!data || data.length === 0) && (
        <div className="text-center py-16 space-y-3 border rounded-2xl bg-card" style={{ boxShadow: "var(--shadow-card)" }}>
          <h2 className="text-xl font-semibold">Nenhum encarregado cadastrado</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Clique em "+ Novo encarregado" para começar.
          </p>
        </div>
      )}

      {!isLoading && data && data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" style={{ perspective: "1200px" }}>
          {data.map((e, idx) => {
            const p = palettes[idx % palettes.length];
            const initials = e.nome.split(" ").map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
            return (
              <Link
                key={e.id}
                to="/painel/$encarregado"
                params={{ encarregado: e.nome }}
                className="card-3d group relative rounded-2xl p-6 bg-card border overflow-hidden block"
              >
                {/* Top color bar */}
                <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: p.grad }} />
                {/* Glow blob */}
                <div
                  className="absolute -right-16 -top-16 w-48 h-48 rounded-full blur-3xl opacity-30 group-hover:opacity-50 transition-opacity"
                  style={{ background: p.grad }}
                />

                <div className="relative flex items-start justify-between gap-3">
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
                    style={{ background: p.grad, boxShadow: `0 10px 25px -10px ${p.ring}` }}
                  >
                    {initials || "?"}
                  </div>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
                    style={{ background: `color-mix(in oklab, ${p.ring} 14%, transparent)`, color: p.ring }}
                  >
                    {p.label}
                  </span>
                </div>

                <div className="relative mt-4">
                  <h2 className="font-bold text-lg leading-tight">{e.nome}</h2>
                  {e.grupo_whatsapp_nome && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{e.grupo_whatsapp_nome}</p>
                  )}
                </div>

                <div className="relative mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3 border" style={{ background: `color-mix(in oklab, ${p.ring} 8%, transparent)` }}>
                    <div className="text-2xl font-black" style={{ color: p.ring }}>{e.hoje}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Fotos hoje</div>
                  </div>
                  <div className="rounded-lg p-3 border bg-muted/40">
                    <div className="text-2xl font-black">{e.total}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total</div>
                  </div>
                </div>

                {e.ultima && (
                  <p className="relative mt-4 text-[11px] text-muted-foreground">
                    Última foto:{" "}
                    {new Date(e.ultima).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

