import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { useEffect } from "react";
import { ehErroDeCarregamento, reportarErroCliente } from "@/lib/erro-cliente";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error }: { error: Error; reset: () => void }) {
  console.error(error);

  useEffect(() => {
    reportarErroCliente("tela-de-erro", error);
    // Arquivo da página que não baixou (rede oscilando, versão nova publicada
    // com a aba aberta): recarregar resolve. Uma vez por minuto no máximo, para
    // nunca entrar em loop.
    if (ehErroDeCarregamento(error)) {
      try {
        const ultima = Number(sessionStorage.getItem("recarregou-apos-erro") || 0);
        if (Date.now() - ultima > 60_000) {
          sessionStorage.setItem("recarregou-apos-erro", String(Date.now()));
          window.location.reload();
        }
      } catch {
        /* sem sessionStorage: segue mostrando a tela */
      }
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Não foi possível abrir esta página
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pode ter sido uma falha de internet. Toque em "Tentar de novo". Se continuar, feche e
          abra o link outra vez.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Macro Ambiental" },
      { name: "description", content: "Gestão Macro Ambiental" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Macro Ambiental" },
      { property: "og:description", content: "Gestão Macro Ambiental" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Macro Ambiental" },
      { name: "twitter:description", content: "Gestão Macro Ambiental" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/8b3c52ca-4fc4-4c09-adeb-955ac8682fc7/id-preview-1a42dd5d--07528081-b16b-457c-89ce-f6cbc3387af7.lovable.app-1778637189913.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/8b3c52ca-4fc4-4c09-adeb-955ac8682fc7/id-preview-1a42dd5d--07528081-b16b-457c-89ce-f6cbc3387af7.lovable.app-1778637189913.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster position="top-center" richColors closeButton />
      </AuthProvider>
    </QueryClientProvider>
  );
}
