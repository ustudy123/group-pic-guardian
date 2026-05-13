import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Macro Ambiental — Painel de Fotos de Obras" },
      {
        name: "description",
        content:
          "Painel automático de fotos enviadas pelos encarregados nos grupos de WhatsApp, organizadas por encarregado, mês e dia.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-xl text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">Painel de Fotos de Obras</h1>
        <p className="text-muted-foreground">
          Fotos enviadas pelos encarregados nos grupos de WhatsApp são baixadas
          automaticamente e organizadas por encarregado, mês e dia.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            to="/painel"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Acessar painel
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium hover:bg-accent"
          >
            Entrar
          </Link>
        </div>
      </div>
    </div>
  );
}
