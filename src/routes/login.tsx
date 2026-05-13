import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — Painel de Fotos" }] }),
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const fn = mode === "signin" ? signIn : signUp;
    const { error } = await fn(email, password);
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    if (mode === "signup") {
      setInfo("Conta criada. Se a confirmação por e-mail estiver ativa, verifique sua caixa de entrada.");
      return;
    }
    navigate({ to: "/painel" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={onSubmit} method="post" action="?" className="w-full max-w-sm space-y-4 border rounded-lg p-6 bg-card">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{mode === "signin" ? "Entrar" : "Criar conta"}</h1>
          <p className="text-sm text-muted-foreground">Acesso ao painel de fotos de obras.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">E-mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Senha</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {info && <p className="text-sm text-muted-foreground">{info}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          className="w-full text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Criar uma conta nova" : "Já tenho conta"}
        </button>

        <div className="text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            Voltar
          </Link>
        </div>
      </form>
    </div>
  );
}
