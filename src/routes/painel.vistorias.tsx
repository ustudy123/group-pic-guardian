import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { ClipboardList, Settings } from "lucide-react";

export const Route = createFileRoute("/painel/vistorias")({
  component: VistoriasLayout,
});

function VistoriasLayout() {
  const loc = useLocation();
  const isAdminTab = loc.pathname.startsWith("/painel/vistorias/admin");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <span className="w-6 h-px bg-primary" /> Vistorias
          </div>
          <h1 className="text-3xl font-black tracking-tight">Relatório de Vistoria Cautelar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pré e pós-obra · captura com GPS, data, hora e endereço
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/painel/vistorias"
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition ${!isAdminTab ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"}`}
          >
            <ClipboardList size={15} /> Minhas vistorias
          </Link>
          <Link
            to="/painel/vistorias/admin"
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition ${isAdminTab ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"}`}
          >
            <Settings size={15} /> Cadastros
          </Link>
        </div>
      </div>
      <Outlet />
    </div>
  );
}
