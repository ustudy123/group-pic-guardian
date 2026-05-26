## Objetivo

Substituir a geração síncrona atual de PDF (que estoura memória/timeout no Worker com 200+ páginas) por um fluxo **assíncrono em fila**, capaz de produzir o PDF completo de um bairro (PRÉ com rua + casas, ou PÓS com pares rua PRÉ × PÓS) sem travar a interface e sem limites práticos de tamanho.

## Como vai funcionar pro usuário

1. Na aba **Cadastros**, em cada bairro, dois botões: "Gerar PDF Pré-obra" e "Gerar PDF Pós-obra".
2. Ao clicar, abre um cartão de **job** mostrando: status (Na fila → Processando → Pronto / Erro), barra de progresso ("Rua 12 de 47 — 312 fotos processadas"), e tempo decorrido.
3. O admin pode **fechar a tela** e voltar depois — o job continua rodando em background. A lista de relatórios anteriores mostra todos os jobs (pronto, processando, erro) com link de download quando prontos.
4. Quando termina, aparece botão **"Baixar PDF"** (signed URL de 1 h) e o registro fica salvo em `vistoria_relatorios`.
5. Se falhar (erro de imagem, timeout de lote, etc.), o job vira "Erro" com mensagem e botão "Tentar novamente".

## Arquitetura (parte técnica)

### Por que fila e não geração direta

PDF de bairro tem ~200–600 páginas, ~600 MB–1 GB de fotos JPEG carimbadas em memória. O Worker do Cloudflare tem ~128 MB de RAM e ~30 s de CPU por request — qualquer geração em um único request quebra. A solução é **processar em lotes pequenos** (1 rua por vez) num worker externo que tem tempo e memória de sobra.

### Tabela nova: `vistoria_relatorio_jobs`

Migration adiciona:

```
id uuid pk
bairro_id uuid
tipo text  -- 'pre' | 'pos'
status text  -- 'na_fila' | 'processando' | 'pronto' | 'erro'
progresso_atual int default 0   -- ruas concluídas
progresso_total int default 0   -- total de ruas
fotos_processadas int default 0
mensagem_erro text null
pdf_path text null              -- preenchido quando pronto
chunks_path text null           -- pasta com PDFs parciais (1 por rua) durante processamento
solicitado_por uuid
solicitado_em timestamptz
iniciado_em timestamptz null
concluido_em timestamptz null
```

Mais policies: admin/analista podem ler/escrever; vistoriante não vê.

### Processamento (GitHub Actions como worker)

Job em fila roda fora do Cloudflare Worker. Opção concreta: **GitHub Actions agendado** rodando a cada 1 min, ou disparado via `repository_dispatch` quando um job entra na fila. Vantagens: grátis, sem nova infra, roda Node real com 7 GB de RAM e até 6 h de tempo.

Fluxo do worker:
1. Pega o job mais antigo `status='na_fila'`, marca `processando`, seta `iniciado_em` e `progresso_total = COUNT(ruas)`.
2. Para cada rua (uma de cada vez, em ordem):
   - Baixa fotos aprovadas dessa rua via signed URL (`vistorias-fotos`).
   - Monta um **PDF parcial só dessa rua** com `pdf-lib` (cabeçalho da rua, blocos de fotos no layout PRÉ ou pares PRÉ × PÓS).
   - Salva em `vistorias-fotos/relatorios/jobs/{jobId}/rua-{ordem}.pdf`.
   - Atualiza `progresso_atual++`, `fotos_processadas += N`.
   - Libera a memória das fotos antes da próxima rua.
3. Quando todas as ruas terminam, **concatena os PDFs parciais** + capa + objetivo/escopo/política + índice de bairro num PDF final usando `pdf-lib` (`mergeIntoSelf` página por página, baixo custo de memória pois cada parcial é pequeno).
4. Sobe o final em `vistorias-fotos/relatorios/{bairroId}/{tipo}-{timestamp}.pdf`, registra em `vistoria_relatorios`, marca job `status='pronto'`, salva `pdf_path`, opcional: limpa os parciais.
5. Se qualquer rua estourar, marca `status='erro'` com mensagem, mantém parciais para retry.

### Endpoints novos

- `enfileirarRelatorio({ bairroId, tipo })` — server fn (`createServerFn`) que cria registro em `vistoria_relatorio_jobs` com `status='na_fila'` e dispara `repository_dispatch` no GitHub via fetch (token em `GITHUB_DISPATCH_TOKEN`). Retorna `jobId`.
- `getJobStatus({ jobId })` — server fn lê linha atual; frontend faz polling a cada 2 s enquanto `status in ('na_fila','processando')`.
- `listJobsBairro({ bairroId })` — server fn lista jobs do bairro pra mostrar histórico (substitui a listagem de relatórios atual, que vira "concluídos").
- `/api/public/hooks/processar-relatorios` — server route que o GitHub Action chama; valida `apikey` (anon) + assinatura HMAC com `RELATORIOS_WORKER_SECRET`; dispara o processamento de 1 job (ou retorna 204 se fila vazia).

### Conteúdo do PDF

Mantém o que já está mapeado:
- **Capa** institucional (contrato, regional, município, responsável técnico, período, descrição da obra) — modelo CT 018.
- Seções 1. Objetivo, 2. Dados da obra, 3. Política da qualidade AEGEA, 4. Relatório fotográfico, 5. Conclusão (com nome/CREA do responsável).
- Separador "BAIRRO — {NOME}".
- Por rua: nome da rua, depois fotos.
- **PRÉ**: fotos de rua + fotos de casas (nº + lado E/D), legenda com data/hora/endereço; mesmo layout do PDF de 577 páginas que a Isabella enviou.
- **PÓS**: pares PRÉ × PÓS lado a lado, só `tipo='rua'`, usando `par_pre_id` para parear; mesmo layout do PDF de 198 páginas (RVC_PRÉ_E_PÓS).
- Rodapé "Relatório de Vistoria Cautelar – Revisão 02" + paginação "X de Y".

### Frontend

- Refatorar componente `RelatoriosBairro` em `painel.vistorias.admin.tsx`:
  - Botões "PDF Pré" e "PDF Pós" chamam `enfileirarRelatorio` e abrem cartão de job.
  - Cartão de job: badge de status, barra de progresso (`progresso_atual/progresso_total`), contador de fotos, botão "Baixar" quando pronto, botão "Tentar novamente" quando erro.
  - Polling via `useQuery` com `refetchInterval` enquanto status ativo; para quando pronto/erro.
  - Lista de jobs concluídos abaixo (substitui a lista atual de `vistoria_relatorios`, que continua sendo a fonte verdade dos PDFs prontos).

### Segredos novos

- `GITHUB_DISPATCH_TOKEN` — PAT fine-grained do GitHub com `repo:dispatch` no repositório do worker.
- `RELATORIOS_WORKER_SECRET` — segredo compartilhado HMAC entre o hook e o GitHub Action.

### Arquivos afetados

- **novo** `supabase/migrations/...sql` — tabela `vistoria_relatorio_jobs` + RLS + grants.
- **novo** `src/lib/relatorios-jobs.functions.ts` — `enfileirarRelatorio`, `getJobStatus`, `listJobsBairro`.
- **novo** `src/routes/api/public/hooks/processar-relatorios.ts` — endpoint chamado pelo Action.
- **novo** `src/lib/pdf-builder.ts` — helpers puros (capa, seções, bloco de foto, par PRÉ × PÓS, concatenação) usados tanto pelo Action quanto, eventualmente, por um modo de preview.
- **novo** `.github/workflows/processar-relatorios.yml` + script Node `scripts/processar-relatorios.ts` — o worker em si (lê fila, processa 1 job, monta PDF final).
- **edit** `src/routes/painel.vistorias.admin.tsx` — UI nova de jobs.
- **deprecar** `src/lib/relatorios.functions.ts` (geração síncrona) — manter `listRelatoriosBairro` ou mover pra `relatorios-jobs.functions.ts`.

## Ordem de entrega

1. Migration `vistoria_relatorio_jobs` + helpers de PDF (`pdf-builder.ts`) cobertos por teste manual com 1 rua.
2. Server fns de fila (`enfileirar`, `getJobStatus`, `listJobs`) + UI de cartão de job (sem worker ainda — admin enfileira e vê "Na fila").
3. Endpoint `/api/public/hooks/processar-relatorios` + GitHub Action + script Node. Testar com bairro pequeno (1 rua, 5 fotos), depois bairro médio (10 ruas), depois bairro real (40+ ruas, 500+ fotos).
4. Polimento: retry, limpeza de parciais, link expirando, mensagens de erro amigáveis.

## Riscos e mitigações

- **Concorrência de jobs**: SELECT FOR UPDATE SKIP LOCKED ao puxar o próximo job, ou simplesmente 1 Action por vez (concurrency: cancel-in-progress).
- **Foto corrompida**: try/catch por foto; segue em frente registrando "[falha ao embutir]" no PDF e logando no `mensagem_erro`.
- **PDF final muito grande pra 1 Action**: 600 páginas A4 com fotos comprimidas ficam em ~150–300 MB, dentro do orçamento. Se passar disso, ativar compressão JPEG no embed (redimensionar imagens > 1600 px de largura antes de embutir).
- **GitHub Actions atrasar 1 min na fila**: aceitável (é background). Se quiser instantâneo no futuro, trocar por Inngest (connector já documentado).
