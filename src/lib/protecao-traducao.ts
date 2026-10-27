// Proteção contra a tradução automática do navegador (Google Tradutor no
// Chrome do computador e do iPhone).
//
// A página dizia ser em inglês (<html lang="en">), então o Chrome oferecia —
// ou fazia sozinho — a "tradução" para português. O tradutor troca os textos
// da página por outros elementos; quando o React ia atualizar a tela, não
// achava mais o que tinha desenhado e a página caía na tela de erro
// ("removeChild"/"insertBefore": NotFoundError). Foi o que derrubou o
// formulário de vistoria cautelar no iPhone e o painel ao recarregar (78
// registros de 14/10 a 27/10).
//
// A causa é tratada no __root (lang="pt-BR" e translate="no"). Isto aqui é a
// rede de segurança se alguém forçar a tradução ou uma extensão mexer na
// página: em vez de derrubar a tela, a operação inválida é ignorada.
// É uma função (e não um import solto) porque o package.json marca o projeto
// como "sideEffects": false e o build descartaria um import sem uso.

import { reportarErroCliente } from "@/lib/erro-cliente";

let reportado = false;

function avisar(operacao: string) {
  if (reportado) return;
  reportado = true;
  const traduzido = /\btranslated-(ltr|rtl)\b/.test(document.documentElement.className);
  reportarErroCliente("pagina-alterada-pelo-navegador", new Error(`${operacao} ignorado`), {
    traduzido,
  });
}

let instalada = false;

export function instalarProtecaoTraducao(): void {
  if (instalada || typeof window === "undefined" || typeof Node !== "function") return;
  instalada = true;

  const removeChildOriginal = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, filho: T): T {
    if (filho.parentNode !== this) {
      avisar("removeChild");
      return filho;
    }
    return removeChildOriginal.call(this, filho) as T;
  };

  const insertBeforeOriginal = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(
    this: Node,
    novo: T,
    referencia: Node | null,
  ): T {
    if (referencia && referencia.parentNode !== this) {
      avisar("insertBefore");
      return novo;
    }
    return insertBeforeOriginal.call(this, novo, referencia) as T;
  };
}
