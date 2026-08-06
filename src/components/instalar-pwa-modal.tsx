import { useEffect, useState } from "react";
import { Download, Share, Smartphone } from "lucide-react";

const ehStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true);

const ehIOS = () =>
  typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

const ehMobile = () =>
  typeof navigator !== "undefined" &&
  /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

/** Garante o <link rel="manifest"> (instalação sem service worker). */
function useManifest() {
  useEffect(() => {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/manifest.webmanifest";
      document.head.appendChild(link);
    }
  }, []);
}

/**
 * Popup obrigatório de instalação do app, exibido apenas no formulário público
 * que os encarregados abrem. Bloqueia a tela até instalar (ou seguir no
 * navegador, saída discreta para quem não consegue instalar).
 */
export function InstalarPwaModal() {
  useManifest();
  const [promptEvt, setPromptEvt] = useState<any>(null);
  const [instalado, setInstalado] = useState(true); // evita flash no SSR
  const [ignorar, setIgnorar] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalado(ehStandalone());
    setMobile(ehMobile());
    setIos(ehIOS());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvt(e);
    };
    const onInstalled = () => setInstalado(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (instalado || ignorar || !mobile) return null;
  if (!promptEvt && !ios) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl border bg-card p-6 shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Smartphone size={26} />
        </div>
        <h2 className="mt-4 text-center text-lg font-bold">Instale o aplicativo</h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Para preencher os formulários é necessário instalar o app no celular. Ele fica
          com ícone na tela inicial, abre mais rápido e funciona melhor com fotos.
        </p>

        {promptEvt ? (
          <button
            onClick={async () => {
              promptEvt.prompt();
              const { outcome } = await promptEvt.userChoice;
              if (outcome === "accepted") setInstalado(true);
              setPromptEvt(null);
            }}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Download size={16} /> Instalar agora
          </button>
        ) : (
          <div className="mt-5 rounded-2xl border bg-muted/40 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <Share size={15} /> No iPhone (Safari)
            </p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
              <li>Toque no botão Compartilhar (□↑) na barra do navegador.</li>
              <li>Escolha "Adicionar à Tela de Início".</li>
              <li>Confirme em "Adicionar" e abra o app pelo novo ícone.</li>
            </ol>
          </div>
        )}

        <button
          onClick={() => setIgnorar(true)}
          className="mt-3 w-full text-center text-xs text-muted-foreground underline underline-offset-2"
        >
          Continuar no navegador
        </button>
      </div>
    </div>
  );
}
