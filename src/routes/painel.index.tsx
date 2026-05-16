import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, Camera, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NovoEncarregadoDialog } from "@/components/novo-encarregado-dialog";
import { EditarEncarregadoDialog } from "@/components/editar-encarregado-dialog";
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
                className="card-3d group relative rounded-2xl bg-card border overflow-hidden block"
                style={{
                  boxShadow: `0 12px 30px -14px ${p.deep}55, 0 2px 6px -2px ${p.dark}30`,
                }}
              >
                {/* WhatsApp green header banner */}
                <div
                  className="relative h-24 overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${p.primary} 0%, ${p.deep} 60%, ${p.dark} 100%)`,
                  }}
                >
                  {/* Subtle "chat bubbles" pattern */}
                  <div
                    className="absolute inset-0 opacity-20"
                    style={{
                      backgroundImage: `radial-gradient(circle at 20% 30%, #fff 2px, transparent 2.5px), radial-gradient(circle at 70% 70%, #fff 3px, transparent 3.5px), radial-gradient(circle at 90% 20%, #fff 1.5px, transparent 2px)`,
                      backgroundSize: "60px 60px",
                    }}
                  />
                  {/* Speech-bubble tail decoration */}
                  <svg className="absolute -bottom-1 right-6 opacity-20" width="80" height="40" viewBox="0 0 80 40" fill="none">
                    <path d="M10 30 Q 10 10 30 10 L 60 10 Q 80 10 80 30 L 80 35 L 70 30 L 30 30 Q 10 30 10 30 Z" fill="white"/>
                  </svg>

                  {/* Group label pill */}
                  <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/25 text-white backdrop-blur-sm border border-white/30">
                    {p.label}
                  </span>

                  {/* Online dot */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 text-[10px] font-semibold text-white/90 uppercase tracking-wider">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-70" />
                      <span className="relative rounded-full h-2 w-2 bg-white" />
                    </span>
                    Ativo
                  </div>
                </div>

                {/* Avatar with WhatsApp groups icon style - overlapping banner */}
                <div className="relative px-5 pb-5 -mt-9">
                  <div
                    className="w-[68px] h-[68px] rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg ring-4 ring-card relative overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${p.primary}, ${p.deep})`,
                    }}
                  >
                    {/* Group people icon as background watermark */}
                    <Users className="absolute inset-0 m-auto text-white/20" size={56} strokeWidth={2.2} />
                    <span className="relative drop-shadow">{initials || "?"}</span>
                  </div>

                  <div className="mt-3">
                    <h2 className="font-bold text-lg leading-tight">{e.nome}</h2>
                    {e.grupo_whatsapp_nome && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                        <img src={waGroupLogo} alt="" className="w-3.5 h-3.5 inline-block" />
                        {e.grupo_whatsapp_nome}
                      </p>
                    )}
                  </div>

                  {/* Stats as chat bubbles */}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div
                      className="rounded-2xl rounded-bl-sm p-3 relative"
                      style={{ background: p.tint, color: p.dark }}
                    >
                      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-bold opacity-70">
                        <Camera size={11} /> Hoje
                      </div>
                      <div className="text-2xl font-black leading-tight mt-0.5">{e.hoje}</div>
                    </div>
                    <div className="rounded-2xl rounded-br-sm p-3 bg-muted/60 border">
                      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-bold text-muted-foreground">
                        <Camera size={11} /> Total
                      </div>
                      <div className="text-2xl font-black leading-tight mt-0.5">{e.total}</div>
                    </div>
                  </div>

                  {e.ultima && (
                    <p className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock size={11} />
                      Última:{" "}
                      {new Date(e.ultima).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

