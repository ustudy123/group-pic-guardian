// Fila de gravação do checklist: um envio por vez, juntando as mudanças
// feitas enquanto um envio está em andamento (a mais nova de cada item vale).
//
// Bug de 22/10 que isto corrige: a versão anterior, chamada com a fila VAZIA
// (ao clicar em "Começar" ou ao gerar a imagem), terminava na hora mas ficava
// marcada para sempre como "gravando" — dali em diante nenhum clique era
// enviado ao servidor até recarregar a página.

export type FilaGravacao<K, V> = {
  /** Põe mudanças na fila e começa a enviar (se já não estiver enviando). */
  adicionar: (mudancas: Iterable<[K, V]>) => Promise<void>;
  /** Espera tudo o que está na fila ser enviado. Com a fila vazia, resolve na hora. */
  esvaziar: () => Promise<void>;
  /** Tem algo na fila ou sendo enviado? */
  ocupada: () => boolean;
  /** Descarta o que ainda não foi enviado. */
  limpar: () => void;
};

export function criarFilaGravacao<K, V>(opcoes: {
  enviar: (lote: Array<[K, V]>) => Promise<void>;
  /** Erro ao enviar um lote: o que estava na fila é descartado. */
  aoFalhar?: (erro: unknown) => void | Promise<void>;
  /** Começou / terminou de enviar (para mostrar "Salvando…"). */
  aoMudarEstado?: (enviando: boolean) => void;
}): FilaGravacao<K, V> {
  const pendentes = new Map<K, V>();
  let emAndamento: Promise<void> | null = null;

  const rodar = (): Promise<void> => {
    if (emAndamento) return emAndamento;
    if (pendentes.size === 0) return Promise.resolve();
    opcoes.aoMudarEstado?.(true);
    const rodada = (async () => {
      try {
        while (pendentes.size > 0) {
          const lote = [...pendentes.entries()];
          pendentes.clear();
          try {
            await opcoes.enviar(lote);
          } catch (erro) {
            pendentes.clear();
            await opcoes.aoFalhar?.(erro);
            break;
          }
        }
      } finally {
        emAndamento = null;
        opcoes.aoMudarEstado?.(false);
      }
    })();
    // A rodada só termina depois de pelo menos um await (o envio), então esta
    // atribuição sempre acontece antes do finally acima.
    emAndamento = rodada;
    return rodada;
  };

  return {
    adicionar: (mudancas) => {
      for (const [k, v] of mudancas) pendentes.set(k, v);
      return rodar();
    },
    esvaziar: () => rodar(),
    ocupada: () => emAndamento !== null || pendentes.size > 0,
    limpar: () => pendentes.clear(),
  };
}
