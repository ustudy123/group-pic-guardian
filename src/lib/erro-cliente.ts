// Registro de erros que acontecem no navegador de quem usa o sistema (tela
// "não foi possível abrir", falha no envio do formulário). Sem isso só ficamos
// sabendo por print, sem a mensagem real do erro.

/** Pasta do bucket fotos-obras onde cada erro vira um JSON. */
export const ERROS_CLIENTE_PASTA = "diagnostico/erros-cliente";

const PADRAO_CARREGAMENTO =
  /dynamically imported module|importing a module script failed|error loading dynamically|loading chunk|chunkloaderror|load failed|failed to fetch|networkerror|network request failed/i;

/** Falha de rede/carregamento (arquivo da página não baixou), não bug de código. */
export function ehErroDeCarregamento(erro: unknown): boolean {
  const e = erro as { message?: unknown; name?: unknown } | null;
  return PADRAO_CARREGAMENTO.test(`${e?.name ?? ""} ${e?.message ?? erro ?? ""}`);
}

export function reportarErroCliente(
  origem: string,
  erro: unknown,
  extra?: Record<string, unknown>,
): void {
  try {
    if (typeof window === "undefined") return;
    const e = erro as { message?: unknown; stack?: unknown; name?: unknown } | null;
    const corpo = {
      origem,
      nome: String(e?.name ?? ""),
      mensagem: String(e?.message ?? erro ?? "").slice(0, 500),
      stack: String(e?.stack ?? "").slice(0, 1500),
      caminho: window.location.pathname,
      navegador: navigator.userAgent.slice(0, 250),
      online: navigator.onLine,
      extra,
    };
    void fetch("/api/public/hooks/erro-cliente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* registrar erro nunca pode gerar outro erro */
  }
}
