import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, Settings, Camera, MapPin, FileCheck2 } from "lucide-react";
import { VistoriasManual } from "@/components/vistorias-manual";
import { listMinhasRuas } from "@/lib/vistorias.functions";

export const Route = createFileRoute("/painel/vistorias")({
  component: VistoriasLayout,
});

function VistoriasLayout() {
  const loc = useLocation();
  const isAdminTab = loc.pathname.startsWith("/painel/vistorias/admin");
  const isDetailTab = /^\/painel\/vistorias\/[^/]+$/.test(loc.pathname) && !isAdminTab;

  const fn = useServerFn(listMinhasRuas);
  const { data } = useQuery({
    queryKey: ["minhas-ruas"],
    queryFn: () => fn(),
    enabled: !isDetailTab,
  });
  const ruas = (data?.ruas ?? []) as any[];
  const totalRuas = ruas.length;
  const totalContratos = new Set(ruas.map((r) => r.bairros?.contrato_id).filter(Boolean)).size;
  const totalBairros = new Set(ruas.map((r) => r.bairro_id).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      {/* Header hero */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary to-[color:var(--primary-glow)] text-primary-foreground p-6 md:p-8 shadow-sm">
        <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-white/5 blur-2xl" />
        <div className="absolute -right-4 -bottom-16 w-72 h-72 rounded-full bg-white/5 blur-3xl" />

        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/80">
              <span className="w-6 h-px bg-primary-foreground/60" /> Vistorias
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight mt-1">
              Relatório de Vistoria Cautelar
            </h1>
            <p className="text-sm text-primary-foreground/80 mt-1 max-w-2xl">
              Registro fotográfico pré e pós-obra com GPS, data, hora e endereço carimbados automaticamente.
            </p>
          </div>

          <div className="flex gap-2 self-start">
            <Link
              to="/painel/vistorias"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                !isAdminTab
                  ? "bg-primary-foreground text-primary shadow"
                  : "bg-white/10 text-primary-foreground hover:bg-white/20"
              }`}
            >
              <ClipboardList size={15} /> Minhas vistorias
            </Link>
            <Link
              to="/painel/vistorias/admin"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                isAdminTab
                  ? "bg-primary-foreground text-primary shadow"
                  : "bg-white/10 text-primary-foreground hover:bg-white/20"
              }`}
            >
              <Settings size={15} /> Cadastros
            </Link>
          </div>
        </div>

        {/* Stats */}
        {!isDetailTab && !isAdminTab && (
          <div className="relative mt-6 grid grid-cols-3 gap-3 max-w-xl">
            <StatPill icon={<FileCheck2 size={16} />} label="Contratos" value={totalContratos} />
            <StatPill icon={<MapPin size={16} />} label="Bairros" value={totalBairros} />
            <StatPill icon={<Camera size={16} />} label="Ruas" value={totalRuas} />
          </div>
        )}
      </div>

      {!isDetailTab && <VistoriasManual />}
      <Outlet />
    </div>
  );
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/10 backdrop-blur border border-white/15 px-3 py-2.5 flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">{icon}</div>
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-wider text-primary-foreground/70 font-semibold">
          {label}
        </div>
        <div className="text-lg font-bold">{value}</div>
      </div>
    </div>
  );
}
