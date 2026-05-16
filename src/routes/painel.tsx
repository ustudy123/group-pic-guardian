import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { BotStatusIndicator } from "@/components/bot-status-indicator";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/painel")({
  component: PainelLayout,
});

function PainelLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="h-1 bg-construction-stripes" />
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/painel" className="flex items-center gap-2.5 font-bold">
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm"
                style={{ background: "var(--gradient-safety)", boxShadow: "var(--shadow-glow)" }}
                aria-hidden
              >
                ⛑
              </span>
              <span className="tracking-tight">Fotos de Obras</span>
            </Link>
            <BotStatusIndicator />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground hidden sm:inline">{user.email}</span>
            <button
              onClick={async () => {
                await signOut();
                navigate({ to: "/login" });
              }}
              className="rounded-md border border-input px-3 py-1.5 hover:bg-accent transition"
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
