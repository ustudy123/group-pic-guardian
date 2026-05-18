## Mudança em `/painel/grupos`

Botão **Ativar** passa a ativar o grupo imediatamente, sem abrir o input de renome.

### O que muda
- Remover o estado de edição (`editingId`, `nomeEnc`) e o formulário inline.
- O clique em **Ativar** chama direto `ativar.mutate(...)` usando `sugerirNome(g.nome_exibicao)` como nome do encarregado.
- Demais botões (Arquivar, Excluir, Reativar) continuam iguais.

### O que NÃO muda
- A edição de nome continua disponível depois, pelo ícone de lápis no card do encarregado (`EditarEncarregadoDialog`).
- Sincronização, arquivamento e exclusão seguem idênticos.
