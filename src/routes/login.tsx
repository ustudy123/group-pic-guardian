import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { HardHat, Mail, Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — Painel de Obras" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const fn = mode === "signin" ? signIn : signUp;
    const { error } = await fn(email, password);
    setLoading(false);
    if (error) return setError(error);
    if (mode === "signup") {
      setInfo("Conta criada. Verifique seu e-mail se a confirmação estiver ativa.");
      return;
    }
    navigate({ to: "/painel" });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Lado esquerdo — hero blueprint */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-blueprint text-white overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--gradient-hero)", opacity: 0.85 }} />
        <div className="absolute -bottom-10 -right-10 w-96 h-96 rounded-full blur-3xl" style={{ background: "var(--gradient-safety)", opacity: 0.4 }} />
        <div className="absolute top-1/3 -left-20 w-80 h-80 rounded-full blur-3xl" style={{ background: "var(--gradient-steel)", opacity: 0.5 }} />

        <div className="relative z-10 flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shadow-2xl"
            style={{ background: "var(--gradient-safety)", boxShadow: "var(--shadow-glow)" }}
          >
            <HardHat className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">Macro Ambiental</span>
        </div>

        <div className="relative z-10 space-y-6">
          <div className="h-2 w-32 rounded-full bg-construction-stripes" />
          <h1 className="text-5xl font-black leading-tight">
            Fotos de obras,<br />
            <span style={{ color: "var(--accent-yellow)" }}>organizadas</span> automaticamente.
          </h1>
          <p className="text-white/75 text-lg max-w-md">
            Receba, classifique e gere relatórios fotográficos direto do WhatsApp dos encarregados de campo.
          </p>
        </div>

        <div className="relative z-10 flex gap-4 text-xs text-white/60">
          <span>RFO automático</span>
          <span>•</span>
          <span>Storage seguro</span>
          <span>•</span>
          <span>Auditável</span>
        </div>
      </div>

      {/* Lado direito — form */}
      <div className="flex items-center justify-center p-6 lg:p-12 relative">
        <div className="absolute top-6 right-6 lg:hidden flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-safety)" }}>
            <HardHat className="w-5 h-5 text-white" />
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="w-full max-w-md space-y-5 bg-card border rounded-2xl p-8 relative"
          style={{ boxShadow: "var(--shadow-elegant)" }}
        >
          <div className="absolute -top-px left-8 right-8 h-px" style={{ background: "var(--gradient-safety)" }} />

          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent-orange)" }}>
              <span className="w-6 h-px" style={{ background: "var(--accent-orange)" }} /> Acesso restrito
            </div>
            <h2 className="text-3xl font-bold">{mode === "signin" ? "Entrar" : "Criar conta"}</h2>
            <p className="text-sm text-muted-foreground">Painel de fotos de obras Macro Ambiental.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Senha</label>
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

          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-muted-foreground">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="group w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            style={{ background: "var(--gradient-steel)", boxShadow: "var(--shadow-elegant)" }}
          >
            {loading ? "Aguarde..." : mode === "signin" ? "Entrar no painel" : "Criar conta"}
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>

          <button
            type="button"
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setInfo(null); }}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition"
          >
            {mode === "signin" ? "Criar uma conta nova" : "Já tenho conta"}
          </button>

          <div className="text-center">
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">Voltar</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
