import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Camera, Clock, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EditarEncarregadoDialog } from "@/components/editar-encarregado-dialog";
import waGroupLogo from "@/assets/wa-group.png";

export const Route = createFileRoute("/painel/")({
  component: PainelHome,
});

type Row = {
  id: string;
  nome: string;
  grupo_whatsapp_nome: string | null;
  foto_url: string | null;
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
        .select("id, nome, grupo_whatsapp_nome, foto_url, ativo")
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
          foto_url: (e as { foto_url: string | null }).foto_url ?? null,
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

  const [busca, setBusca] = useState("");
  const [filtroAtividade, setFiltroAtividade] = useState<"todos" | "hoje" | "semana" | "mes" | "inativos">("todos");

  const filtrados = useMemo(() => {
    if (!data) return [];
    const q = busca.trim().toLowerCase();
    const agora = Date.now();
    const DIA = 24 * 60 * 60 * 1000;
    return data.filter((e) => {
      if (q) {
        const match =
          e.nome.toLowerCase().includes(q) ||
          (e.grupo_whatsapp_nome ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filtroAtividade === "todos") return true;
      if (filtroAtividade === "inativos") return !e.ultima;
      if (!e.ultima) return false;
      const diff = agora - new Date(e.ultima).getTime();
      if (filtroAtividade === "hoje") return diff < DIA;
      if (filtroAtividade === "semana") return diff < 7 * DIA;
      if (filtroAtividade === "mes") return diff < 30 * DIA;
      return true;
    });
  }, [data, busca, filtroAtividade]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent-orange)" }}>
            <span className="w-6 h-px" style={{ background: "var(--accent-orange)" }} /> Equipe de campo
          </div>
          <h1 className="text-3xl font-black tracking-tight">Encarregados</h1>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border bg-card">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por encarregado ou grupo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full rounded-md border border-input bg-background pl-9 pr-8 py-2 text-sm"
          />
          {busca && (
            <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {([
            ["todos", "Todos"],
            ["hoje", "Hoje"],
            ["semana", "7 dias"],
            ["mes", "30 dias"],
            ["inativos", "Sem fotos"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFiltroAtividade(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold border transition ${
                filtroAtividade === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent border-input"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground ml-auto">
          {filtrados.length} de {data?.length ?? 0}
        </div>
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
            Acesse "Grupos novos" para ativar os grupos onde o bot foi adicionado.
          </p>
        </div>
      )}

      {!isLoading && data && data.length > 0 && filtrados.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground border rounded-xl">
          Nenhum encarregado corresponde aos filtros.
        </div>
      )}

      {!isLoading && filtrados.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3" style={{ perspective: "1200px" }}>
          {filtrados.map((e, idx) => {
            const p = palettes[idx % palettes.length];
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
                <EditarEncarregadoDialog id={e.id} nome={e.nome} grupoNome={e.grupo_whatsapp_nome} fotoUrl={e.foto_url} />
                {/* WhatsApp green header banner */}
                <div
                  className="relative h-16 overflow-hidden"
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
                  <svg className="absolute -bottom-1 right-4 opacity-20" width="56" height="28" viewBox="0 0 80 40" fill="none">
                    <path d="M10 30 Q 10 10 30 10 L 60 10 Q 80 10 80 30 L 80 35 L 70 30 L 30 30 Q 10 30 10 30 Z" fill="white"/>
                  </svg>


                  {/* Online dot */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 text-[9px] font-semibold text-white/90 uppercase tracking-wider">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-70" />
                      <span className="relative rounded-full h-1.5 w-1.5 bg-white" />
                    </span>
                    Ativo
                  </div>
                </div>

                {/* Avatar - WhatsApp group logo for all */}
                <div className="relative px-3 pb-3 -mt-6">
                  <div className="w-11 h-11 rounded-xl shadow-lg ring-[3px] ring-card overflow-hidden bg-white">
                    <img src={waGroupLogo} alt="Grupo WhatsApp" className="w-full h-full object-cover" />
                  </div>

                  <div className="mt-2">
                    <h2 className="font-bold text-sm leading-tight truncate">{e.nome}</h2>
                    {e.grupo_whatsapp_nome && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                        <img src={waGroupLogo} alt="" className="w-3 h-3 inline-block" />
                        {e.grupo_whatsapp_nome}
                      </p>
                    )}
                  </div>

                  {/* Stats as chat bubbles */}
                  <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                    <div
                      className="rounded-xl rounded-bl-sm p-2 relative"
                      style={{ background: p.tint, color: p.dark }}
                    >
                      <div className="flex items-center gap-1 text-[8px] uppercase tracking-wider font-bold opacity-70">
                        <Camera size={9} /> Hoje
                      </div>
                      <div className="text-lg font-black leading-tight mt-0.5">{e.hoje}</div>
                    </div>
                    <div className="rounded-xl rounded-br-sm p-2 bg-muted/60 border">
                      <div className="flex items-center gap-1 text-[8px] uppercase tracking-wider font-bold text-muted-foreground">
                        <Camera size={9} /> Total
                      </div>
                      <div className="text-lg font-black leading-tight mt-0.5">{e.total}</div>
                    </div>
                  </div>

                  {e.ultima && (
                    <p className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                      <Clock size={10} />
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

