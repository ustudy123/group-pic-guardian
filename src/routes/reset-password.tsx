import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { HardHat, Lock, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Redefinir senha — Painel de Obras" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pronto, setPronto] = useState(false);
  const [password, setPassword] = useState("");
  const [confirma, setConfirma] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase entrega a sessão de recovery via hash. O listener captura.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setPronto(true);
    });
    // Caso a sessão já tenha sido restaurada antes do listener montar
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPronto(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 6) return setError("A senha deve ter no mínimo 6 caracteres.");
    if (password !== confirma) return setError("As senhas não coincidem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);
    setInfo("Senha redefinida com sucesso! Redirecionando...");
    setTimeout(() => navigate({ to: "/painel" }), 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-5 bg-card border rounded-2xl p-8 relative"
        style={{ boxShadow: "var(--shadow-elegant)" }}
      >
        <div className="absolute -top-px left-8 right-8 h-px" style={{ background: "var(--gradient-safety)" }} />

        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: "var(--gradient-safety)" }}
          >
            <HardHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold leading-tight">Redefinir senha</h2>
            <p className="text-xs text-muted-foreground">Crie uma nova senha de acesso</p>
          </div>
        </div>

        {!pronto && (
          <p className="text-sm text-muted-foreground">
            Validando link de recuperação... Se você abriu esta página manualmente, solicite um novo link em
            "Esqueci minha senha".
          </p>
        )}

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nova senha</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confirmar senha</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="password"
              required
              minLength={6}
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
              className="w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {info && <p className="text-sm text-emerald-600">{info}</p>}

        <button
          type="submit"
          disabled={loading || !pronto}
          className="group w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
          style={{ background: "var(--gradient-steel)", boxShadow: "var(--shadow-elegant)" }}
        >
          {loading ? "Salvando..." : "Salvar nova senha"}
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </button>

        <div className="text-center">
          <Link to="/login" className="text-xs text-muted-foreground hover:text-foreground">Voltar ao login</Link>
        </div>
      </form>
    </div>
  );
}
