# Agente de Análise Visual de Fotos de Obra

Sobrepõe uma camada de IA visual ao fluxo que já existe (encarregado manda foto no grupo → bot Z-API grava em `fotos` + Storage). Cada nova foto será analisada automaticamente pelo Gemini 2.5 Pro, classificada por etapa de obra e checada para EPI, sinalização e acabamento de PV. Resultado fica visível no painel, sem responder no grupo.

## O que será entregue

1. **Análise automática** de toda foto nova (a partir do deploy).
2. **Classificação de etapa**: DDS, sinalização, vala, compactação, PV, drenagem, limpeza, banheiro, mapa de rede, checklist, outros.
3. **Checagens de conformidade**:
   - EPI (capacete, colete, luva, bota, óculos) por pessoa visível
   - Sinalização (cones, placas, fitas)
   - Acabamento/qualidade do PV (tampa, nivelamento, concretagem)
4. **Painel novo** `/painel/visao` para acompanhar análises e filtrar não conformidades.
5. **Indicador na foto** dentro das telas já existentes do encarregado (badge ✅ / ⚠️ / 🚨 / ⏳).

Nada é enviado ao grupo nem ao coordenador — modo silencioso confirmado.

## Como funciona (técnico)

```text
WhatsApp → webhook Z-API → tabela `fotos` (já existe)
                              │
                              ▼
            trigger pg → INSERT em `foto_analise_jobs (pendente)`
                              │
                              ▼
         cron /api/public/hooks/processar-analises (a cada 1 min)
                              │
                              ▼
         signed URL da foto → Gemini 2.5 Pro (multimodal, JSON estruturado)
                              │
                              ▼
       UPDATE `foto_analises` + UPDATE status no job
```

### Banco (nova migração)

- `foto_analises` (1:1 com `fotos`):
  - `foto_id`, `etapa` (enum texto), `etapa_confianca` (0-1)
  - `conformidade_geral` (`conforme | atencao | nao_conforme | critico | inconclusivo`)
  - `epi_detectado` (jsonb: `{ pessoas: [{capacete, colete, luva, bota, oculos}] }`)
  - `sinalizacao` (jsonb: `{ presente, itens: [...], adequada }`)
  - `pv_qualidade` (jsonb: `{ aplicavel, tampa_ok, nivelamento_ok, acabamento_ok, observacoes }`)
  - `problemas` (jsonb array: `[{categoria, criticidade, descricao}]`)
  - `resumo` (texto curto, 1-2 frases)
  - `modelo`, `tokens_in`, `tokens_out`, `analisado_em`
- `foto_analise_jobs` (fila simples):
  - `foto_id`, `status` (`pendente|processando|ok|erro`), `tentativas`, `erro`, `created_at`, `updated_at`
- Trigger `AFTER INSERT ON fotos` → enfileira job.
- RLS: leitura para `authenticated`, escrita só `admin` (worker usa `supabaseAdmin`).
- GRANTs explícitos (authenticated + service_role).

### Server functions e rota

- `src/lib/visao.functions.ts`
  - `listarAnalises({ filtros })` — paginado, com join leve em `fotos` + `encarregados`
  - `reprocessarFoto(fotoId)` — admin only, recria job
  - `getEstatisticas()` — % conformes, top problemas, por encarregado
- `src/routes/api/public/hooks/processar-analises.ts` (público, protegido por `AI_BOT_WEBHOOK_SECRET` que já existe — reaproveitamos, ou criamos `VISAO_WORKER_SECRET`):
  - Pega até 10 jobs pendentes, processa em paralelo controlado.
  - Gera signed URL do bucket `fotos-obras`.
  - Chama Lovable AI Gateway (`google/gemini-2.5-pro`) com a imagem + prompt + JSON schema via `Output.object` (Zod).
  - Grava resultado; em erro, incrementa `tentativas` (máx 3) e marca `erro`.
- Disparo: GitHub Actions cron a cada 1 min batendo no endpoint (mesmo padrão do `processar-relatorios.yml` que já existe).

### Prompt do agente

System prompt focado em Macroambiental:
- Identifica etapa pela tabela fixa do projeto.
- Para cada pessoa visível, marca EPI item a item (presente/ausente/não_visível).
- Marca sinalização só quando contexto sugere (vala aberta, frente de rua).
- PV: só avalia se a foto mostrar PV; senão `aplicavel=false`.
- Criticidade:
  - `critica`: ausência de capacete em frente aberta, vala sem sinalização, risco de queda
  - `alta`: falta de colete em via, PV sem acabamento na entrega
  - `media`: EPI parcial, sinalização insuficiente
  - `baixa`: detalhe estético
- Retorna sempre o JSON do schema (sem texto livre fora).

### Painel `/painel/visao`

- **Topo**: cards de KPI (analisadas hoje, % conformes, # críticos abertos, fila pendente).
- **Filtros**: encarregado, etapa, conformidade, período.
- **Lista** (grade de cards): thumbnail + badge de conformidade + etapa + resumo + chips de problemas. Click abre modal com a foto carimbada original + JSON expandido + botão "Reanalisar".
- **Aba "Pendentes / Erros"** para admin acompanhar a fila.

### Integração leve nas telas existentes

- Em `painel.$encarregado.$anoMes.$dia.tsx` cada foto ganha um badge pequeno no canto (✅/⚠️/🚨/⏳) lendo `foto_analises` por `foto_id`. Sem mudar o layout.

## Modelo e custo

- `google/gemini-2.5-pro` em todas as análises (escolha confirmada).
- ~1 chamada por foto. Imagens reduzidas a max 1280px antes de mandar (worker faz o resize via signed URL + `fetch` + canvas no edge não dá — então mandamos a `carimbada.jpg` que já é ≤2000px; o Gemini aceita). Se custo virar problema, dá pra trocar pra híbrido depois sem mudar schema.

## Itens fora do escopo (desta etapa)

- Resposta automática no grupo do WhatsApp.
- Alerta ao coordenador (já existe no Marcel Virtual via outra trilha).
- Backfill de fotos antigas.
- Fine-tuning de modelo — substituído por iteração do system prompt com exemplos reais durante implantação.

## Pré-requisitos

- `LOVABLE_API_KEY` já existe ✅
- Secret novo `VISAO_WORKER_SECRET` para o cron (vou pedir após aprovar o plano).
- GitHub Actions `processar-analises.yml` (espelho do que já existe para relatórios).

## Arquivos que serão criados / alterados

Criados:
- migração SQL (`foto_analises`, `foto_analise_jobs`, trigger, RLS, GRANTs)
- `src/lib/ai-gateway.server.ts` (helper do AI SDK Lovable, se ainda não existir)
- `src/lib/visao.functions.ts`
- `src/lib/visao-analyzer.server.ts` (prompt + schema Zod + chamada Gemini)
- `src/routes/api/public/hooks/processar-analises.ts`
- `src/routes/painel.visao.tsx` + componentes auxiliares
- `.github/workflows/processar-analises.yml`

Alterados:
- `src/routes/painel.tsx` (link "Visão IA" no header)
- `src/routes/painel.$encarregado.$anoMes.$dia.tsx` (badge na thumbnail)
- `src/integrations/supabase/types.ts` (regenerado após migração)
