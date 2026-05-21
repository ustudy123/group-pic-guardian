import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { BotStatusIndicator } from "@/components/bot-status-indicator";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { Inbox, BookOpen, ShieldCheck } from "lucide-react";

function AdminLink() {
  const { data } = useQuery({
    queryKey: ["is-admin-header"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data: row } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!row;
    },
  });
  if (!data) return null;
  return (
    <Link
      to="/painel/admin"
      className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent transition"
      title="Painel administrativo"
    >
      <ShieldCheck size={15} />
      <span className="hidden sm:inline">Admin</span>
    </Link>
  );
}

function GruposPendentesLink() {
  const { data: count = 0 } = useQuery({
    queryKey: ["grupos-pendentes-count"],
    queryFn: async () => {
      const [{ data: grupos }, { data: encs }] = await Promise.all([
        supabase.from("grupos").select("whatsapp_jid").eq("ativo", true),
        supabase.from("encarregados").select("grupo_whatsapp_id"),
      ]);
      const ativados = new Set((encs ?? []).map((e) => e.grupo_whatsapp_id));
      return (grupos ?? []).filter((g) => !ativados.has(g.whatsapp_jid)).length;
    },
    refetchInterval: 30_000,
  });

  return (
    <Link
      to="/painel/grupos"
      className="relative inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent transition"
      title="Grupos descobertos pelo bot"
    >
      <Inbox size={15} />
      <span className="hidden sm:inline">Grupos novos</span>
      {count > 0 && (
        <span className="ml-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
          {count}
        </span>
      )}
    </Link>
  );
}

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
            <GruposPendentesLink />
            <AdminLink />
            <Link
              to="/painel/guia"
              className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent transition"
              title="Guia do usuário"
            >
              <BookOpen size={15} />
              <span className="hidden sm:inline">Guia</span>
            </Link>
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
