import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ChevronRight, Loader2, ClipboardList, LogOut, Mail, Lock, ArrowRight } from "lucide-react";
import { FORM_GRAD, FORM_GRAD_BTN, FORM_BG, FORM_SHADOW } from "@/lib/ui-form";
import { InstalarPwaModal } from "@/components/instalar-pwa-modal";

export const Route = createFileRoute("/formularios")({
  head: () => ({
    meta: [
      { title: "Meus formulários — Macro Ambiental" },
      {
        name: "description",
        content:
          "Área do encarregado: acesse e responda os formulários de obra liberados para o seu login.",
      },
      { property: "og:title", content: "Meus formulários — Macro Ambiental" },
      {
        property: "og:description",
        content: "Acesse os formulários de obra liberados para o seu login.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeusFormularios,
});

function MeusFormularios() {
  const { user, loading } = useAuth();

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 size={18} className="animate-spin" /> Carregando…
      </div>
    );

  if (!user) return <LoginFormularios />;
  return <ListaMeusFormularios userId={user.id} />;
}

function LoginFormularios() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await signIn(email, senha);
    setEnviando(false);
    if (error) setErro(error);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ backgroundImage: FORM_BG }}
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-3xl border bg-card p-7"
        style={{ boxShadow: FORM_SHADOW }}
      >
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white"
          style={{ backgroundImage: FORM_GRAD, boxShadow: FORM_SHADOW }}
        >
          <ClipboardList size={26} />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold">Meus formulários</h1>
          <p className="text-sm text-muted-foreground">
            Entre com seu e-mail e senha para ver os formulários liberados para você.
          </p>
        </div>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="email"
            required
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2"
            style={{ ["--tw-ring-color" as any]: "#8b5cf6" }}
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="password"
            required
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2"
            style={{ ["--tw-ring-color" as any]: "#8b5cf6" }}
          />
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <button
          type="submit"
          disabled={enviando}
          style={{ backgroundImage: FORM_GRAD_BTN, boxShadow: FORM_SHADOW }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
          Entrar
        </button>
      </form>
    </div>
  );
}

function ListaMeusFormularios({ userId }: { userId: string }) {
  const { signOut } = useAuth();

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ["meus-formularios", userId],
    queryFn: async () => {
      // Formulários publicados que o encarregado pode responder:
      // - liberados explicitamente para o login dele (formulario_acessos), ou
      // - marcados para o menu de serviços e sem restrição de login.
      const { data: todos, error } = await (supabase.from("formularios") as any)
        .select("id, titulo, descricao, share_slug, menu_icone, menu_ordem, no_menu")
        .eq("status", "publicado")
        .order("menu_ordem")
        .order("titulo");
      if (error) throw error;
      const ids = (todos ?? []).map((f: any) => f.id);
      if (!ids.length) return [];
      const { data: acessos } = await (supabase.from("formulario_acessos") as any)
        .select("formulario_id, user_id")
        .in("formulario_id", ids);
      const restritos = new Map<string, Set<string>>();
      for (const a of acessos ?? []) {
        if (!restritos.has(a.formulario_id)) restritos.set(a.formulario_id, new Set());
        restritos.get(a.formulario_id)!.add(a.user_id);
      }
      return (todos ?? []).filter((f: any) => {
        const r = restritos.get(f.id);
        if (r) return r.has(userId); // restrito: só quem foi liberado
        return !!f.no_menu; // sem restrição: aparece se estiver no menu de serviços
      });
    },
  });

  return (
    <div className="min-h-screen px-4 py-8" style={{ backgroundImage: FORM_BG }}>
      <InstalarPwaModal />
      <div className="mx-auto max-w-2xl space-y-5">
        <div
          className="relative overflow-hidden rounded-3xl p-7 text-white"
          style={{ backgroundImage: FORM_GRAD, boxShadow: FORM_SHADOW }}
        >
          <div className="relative flex items-center gap-3">
            <ClipboardList size={26} />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold">Meus formulários</h1>
              <p className="text-sm text-white/85">
                Toque no formulário que você precisa preencher agora.
              </p>
            </div>
            <button
              onClick={() => signOut()}
              title="Sair"
              className="shrink-0 rounded-lg bg-white/15 p-2 hover:bg-white/25"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" /> Carregando formulários…
          </div>
        ) : forms.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-md">
            Nenhum formulário liberado para você ainda. Fale com a equipe de Qualidade.
          </div>
        ) : (
          <div className="space-y-3">
            {forms.map((s: any) => (
              <a
                key={s.id}
                href={`/f/${s.share_slug}`}
                className="group flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl text-white"
                  style={{ backgroundImage: FORM_GRAD_BTN }}
                >
                  {s.menu_icone || "📋"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{s.titulo}</div>
                  {s.descricao && (
                    <div className="line-clamp-2 text-sm text-muted-foreground">{s.descricao}</div>
                  )}
                </div>
                <ChevronRight
                  size={20}
                  className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5"
                />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
