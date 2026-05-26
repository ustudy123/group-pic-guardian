## Contexto

Reunião de 26/05/2026 com Arthur e Isabella (Macro Ambiental) revisando a entrega atual do módulo `/painel/vistorias`. Tudo que já existe (captura no app, GPS, carimbo, pré vs pós, rejeitar/aprovar individual, desfazer rejeição) foi aprovado. Eles pediram pontos de polimento e a parte que ainda falta: **geração dos PDFs**.

## Itens pedidos na reunião

1. **Botões Aprovar / Rejeitar mais visíveis**, com destaque (Rejeitar com cor vermelha forte / fundo, ícone maior), saindo do canto da galeria.
2. **Confirmação ao Rejeitar** ("Deseja realmente rejeitar esta foto?") para evitar clique acidental. Aprovar continua em 1 clique.
3. **Aprovar todas** as fotos pendentes da rua de uma vez, com confirmação ("Aprovar N fotos pendentes?").
4. **Liberar cadastro de bairro e rua para o vistoriante** (hoje só admin/analista pode), para que ele cadastre em campo. Admin/analista continuam podendo.
5. **Dois modelos de PDF distintos** por bairro:
   - **Relatório PRÉ-OBRA** — só fotos PRÉ, organizadas por rua, contendo as fotos da rua e as fotos das casas (com nº e lado).
   - **Relatório PÓS-OBRA** — comparativo PRÉ × PÓS lado a lado, **apenas das fotos de rua** (casas não entram no pós).
   Ambos seguindo o modelo CT 018/BRISAMAR já mapeado em `.lovable/plan.md` (capa, sumário, objetivo, escopo, política da qualidade, separadores por bairro, rodapé "Revisão 02", paginação).
6. Apenas confirmações de cor / contraste: rejeitada com badge vermelho mais visível.

## Fora de escopo desta entrega

Continuam pendentes (Fases 2 e 3 do plano original) e ficam para depois: galeria/busca por metadados, mapa da rua no PDF, score de similaridade por IA. A reunião não voltou a citar.

## Plano de implementação

### 1. UX de aprovação na galeria da rua
Arquivo: `src/routes/painel.vistorias.$ruaId.tsx` (`FotoColuna`).
- Aprovar / Rejeitar viram botões com fundo (verde sólido / vermelho sólido), ícone + texto, tamanho `sm` real, ocupando uma linha própria abaixo da foto — não mais link no canto.
- Rejeitar abre um `AlertDialog` (shadcn) de confirmação antes de chamar `setFotoStatus`.
- "Desfazer" da rejeitada vira botão âmbar mais destacado, mesma linha.

### 2. Aprovar todas
- Novo botão "Aprovar todas pendentes (N)" no topo de cada coluna PRÉ / PÓS, só visível para admin/analista, desabilitado quando N=0.
- Confirma via `AlertDialog`.
- Nova server function `aprovarFotosRua({ ruaId, fase })` em `src/lib/vistorias.functions.ts` que faz `update vistoria_fotos set status='aprovada' where rua_id=? and fase=? and status='pendente'`. Middleware `requireSupabaseAuth` + checagem de role admin/analista. RLS atual de UPDATE já permite.

### 3. Liberar cadastro para vistoriante
- Backend: relaxar as server functions de criação de bairro e rua para aceitar qualquer usuário autenticado (não exigir admin). Continuar exigindo autenticação.
- DB: as policies atuais (`bairros_admin_all`, `ruas_admin_all` + `*_select`) bloqueiam INSERT do vistoriante. Migration nova adiciona policies:
  - `bairros_insert_auth` INSERT to authenticated with check (true)
  - `ruas_insert_auth` INSERT to authenticated with check (true)
  - Edição/exclusão continuam restritas a admin (mantém `*_admin_all`).
- Frontend: a aba **Cadastros** (`painel.vistorias.admin.tsx`) hoje só aparece pra admin no menu — manter. Para o vistoriante, expor um caminho mais leve: na tela "Minhas vistorias" (`painel.vistorias.index.tsx`), botão "+ Adicionar bairro/rua" que abre um diálogo simples (contrato pré-selecionado se só houver 1, senão dropdown apenas dos contratos que ele já tem atribuição; campos: bairro novo OU existente, nome da rua). Após salvar, atribuir automaticamente o vistoriante à rua via `vistoria_atribuicoes` para que ele consiga abrir e fotografar.

### 4. Geração dos PDFs (item maior)
- Dependência: `pdf-lib` (compatível com Cloudflare Workers; `jspdf` já está mas pdf-lib lida melhor com multipágina). Instalar via `bun add pdf-lib`.
- Server function `gerarRelatorioBairro({ bairroId, tipo: "pre" | "pos" })` em novo arquivo `src/lib/relatorios.functions.ts`:
  - Middleware `requireSupabaseAuth`, role admin/analista.
  - Usa `supabaseAdmin` para baixar imagens do bucket `vistorias-fotos` via signed URL.
  - Considera somente fotos com `status='aprovada'`.
  - Layout reproduz CT 018/BRISAMAR: capa (contrato, regional, município, responsável técnico, período, descrição), sumário, objetivo, escopo, política da qualidade, intro do relatório fotográfico, separador por bairro, blocos por rua.
  - **Pré-obra**: por rua, fotos da rua + grupo de casas (nº, lado E/D), uma foto por bloco com legenda data/hora/endereço.
  - **Pós-obra**: por rua, pares PRÉ × PÓS lado a lado (só `tipo='rua'`, usando `par_pre_id` para parear). Se uma pós não tiver `par_pre_id`, lista no fim como "sem par".
  - Rodapé "Relatório de Vistoria Cautelar – Revisão 02" + paginação.
  - Salva PDF em `vistorias-fotos/relatorios/{bairroId}/{tipo}-{timestamp}.pdf` e registra em `vistoria_relatorios` (a tabela existe).
- Frontend: na aba **Cadastros**, em cada bairro listado, dois botões: "Gerar PDF Pré-obra" e "Gerar PDF Pós-obra". Após geração, mostra link de download (signed URL) + lista versões anteriores via `vistoria_relatorios`.

### 5. Polimento visual da rejeição
Badge de status "rejeitada" passa a usar `bg-red-600 text-white` (hoje é `bg-red-100`) para chamar atenção, conforme pedido.

## Ordem sugerida de entrega

1. UX dos botões + confirmação de rejeitar + Aprovar todas (rápido, alto valor visual).
2. Migration + UI de cadastro liberado para vistoriante.
3. Geração dos PDFs (maior esforço, mas é o que destrava a entrega final do produto).

Confirma que sigo nessa ordem, ou prefere que eu já comece direto pelo PDF?
