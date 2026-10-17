# Macro Ambiental — Documentação técnica do sistema

Documento de referência para quem vai manter o sistema ou integrá-lo a outros
sistemas da Macro. Atualizado em outubro/2026.

> **Segurança:** este repositório é **público**. Nenhuma chave, senha ou token
> deve ser escrita aqui nem no código — elas ficam nas variáveis de ambiente do
> servidor (Lovable Cloud) e nos *Secrets* do GitHub Actions. Acesso ao banco de
> dados é liberado por usuário, com o mínimo de permissão necessário (ver §8).

---

## 1. Visão geral

O sistema reúne quatro frentes:

| Módulo | O que faz | Onde fica no painel |
|---|---|---|
| **Fotos de obra** | Recebe as fotos enviadas nos grupos de WhatsApp de cada encarregado, salva no storage e organiza por encarregado → mês → dia. | Tela inicial, "Grupos novos", "Qualidade" |
| **Visão IA** | Analisa as fotos com IA (EPI, sinalização, etapa da obra, qualidade do PV) e gera avaliação. | "Visão IA", "Qualidade" |
| **Macro I.A (bot de WhatsApp)** | Conversa com os encarregados, faz check-in programado, detecta problemas de obra e envia alertas/resumos aos coordenadores, separados por área. | "Macro I.A" |
| **Formulários / Vistorias** | Construtor de formulários (estilo Google Forms) com link público, fotos e exportação em PDF/Excel; vistorias pré e pós-obra por rua com relatório em PDF. | "Rede" (formulários), "Vistorias" |

**Endereço publicado:** https://macroambiental-botgrupos.lovable.app

---

## 2. Arquitetura

```
 WhatsApp (grupos de fotos)          WhatsApp (conversa com encarregados)
          │                                       │
   UazAPI – instância FOTOS              UazAPI – instância MACRO I.A
          │ webhook                               │ webhook
          ▼                                       ▼
 ┌───────────────────────────────────────────────────────────────────┐
 │  Aplicação web (TanStack Start / React) em Cloudflare Workers     │
 │   • páginas do painel (/painel/...)                               │
 │   • rotas de API e webhooks (/api/public/hooks/...)               │
 │   • server functions (chamadas do painel com login)               │
 └───────────────┬───────────────────────────────┬───────────────────┘
                 │                               │
          Supabase (Postgres + Auth + Storage)   OpenAI (conversa, análise
                 │                                de alertas, Visão IA,
         pg_cron (jobs a cada minuto/horário)     transcrição de áudio)
                 │
      GitHub Actions (crons de apoio e diagnóstico)
```

### Tecnologias

| Camada | Tecnologia |
|---|---|
| Front-end | React 19, TanStack Router/Start, TanStack Query, Tailwind CSS, shadcn/ui (Radix) |
| Servidor | TanStack Start em **Cloudflare Workers** (`wrangler.jsonc`, entrada `src/server.ts`) |
| Banco de dados | **Supabase** — PostgreSQL com RLS, Auth (e-mail/senha), Storage |
| Agendamentos | `pg_cron` no Supabase + GitHub Actions (`.github/workflows`) |
| WhatsApp | **UazAPI** (duas instâncias: fotos e Macro I.A) |
| IA | OpenAI (`gpt-4o-mini` para conversa/alertas; modelo configurável na Visão IA; Whisper/TTS para áudio) |
| PDFs | jsPDF, pdf-lib |
| Hospedagem / deploy | Lovable (edição + publicação); o GitHub é sincronizado com o Lovable nos dois sentidos |

---

## 3. Estrutura do código

```
src/
  routes/                  páginas e rotas de API (roteamento por arquivo)
    painel.*.tsx           telas do painel (login obrigatório)
    f.$slug.tsx            formulário público (link compartilhado)
    api/public/hooks/      webhooks e endpoints chamados por cron
  lib/                     regras de negócio
    *.functions.ts         server functions (chamadas pelo painel, exigem login)
    *.server.ts            código só de servidor
    mensagens-programadas.server.ts   check-in programado do bot
    areas-alerta.ts        roteamento de alertas por área
    frente-parada.ts       regras de "obra parada" do bot
    exportar-respostas.ts  exportação de formulários (CSV, Excel, PDF, ZIP por rua)
    uazapi-grupos.server.ts lista de grupos da UazAPI e recuperação de fotos
  integrations/supabase/   clientes Supabase (navegador, servidor) e tipos gerados
  components/              componentes de interface
supabase/migrations/       histórico do esquema do banco (SQL)
.github/workflows/         crons de apoio e diagnóstico
docs/                      esta documentação
```

---

## 4. Fluxos principais

### 4.1 Fotos dos grupos de WhatsApp
1. Alguém manda foto num grupo onde está o número da **instância de fotos**.
2. A UazAPI chama `POST /api/public/hooks/uazapi-fotos/{TOKEN}`.
3. Todo evento é gravado em `eventos_raw` (auditoria).
4. O grupo (`chat_id`, ex.: `120363…@g.us`) é procurado em `encarregados.grupo_whatsapp_id`.
   - **Não cadastrado:** o grupo é registrado em `grupos` e aparece em "Grupos novos" para ativação. Ao ativar, as fotos dos últimos 7 dias guardadas em `eventos_raw` são recuperadas.
   - **Cadastrado:** a imagem é baixada (UazAPI `/message/download`), salva no bucket `fotos-obras` em `{encarregado}/{AAAA-MM-DD}/…` e registrada em `fotos` (idempotente por `message_id`).
5. A foto entra na fila da Visão IA (`foto_analise_jobs`).

### 4.2 Macro I.A — conversa e alertas
1. Mensagem do encarregado → instância Macro I.A → `POST /api/public/hooks/uazapi-bot`.
2. Só atende números em `ai_bot_autorizados`. Áudio é transcrito.
3. Monta o contexto (persona, base de conhecimento, exemplos, histórico em `ai_bot_conversas`) e gera a resposta com a OpenAI.
4. A resposta vai para `ai_bot_respostas_pendentes` com atraso "humanizado" e é enviada pelo job de minuto.
5. Uma segunda análise decide se há **alerta** (categoria, criticidade, resumo) → `ai_bot_alertas`. Só vira alerta o que é novidade em relação aos últimos 7 dias.
6. Destinatários dos alertas: definidos em **Áreas de alerta** (JSON em `fotos-obras/config/areas-alerta.json`); sem áreas, os coordenadores de `ai_bot_config`.
   - Crítico: enviado na hora.
   - Demais: resumo às 08:30 e a cada 2 horas (seg–sáb), um por destinatário, só com os encarregados da área dele.

### 4.3 Check-in programado
Executado a cada minuto junto com a fila de respostas
(`src/lib/mensagens-programadas.server.ts`): nos dias e janelas configurados em
`ai_bot_config`, manda a mensagem da manhã aos autorizados **ativos**. Quem
relatou problema no dia anterior recebe um retorno sobre aquele problema.
Domingo não há envio proativo (o retorno de sábado vai na segunda).

### 4.4 Formulários
Construtor em `/painel/formularios` (`formularios`, `formulario_campos` com
lógica condicional). O link público `/f/{slug}` grava em `formulario_respostas`
(arquivos no bucket `fotos-obras`). Exportação em CSV, Excel, PDF detalhado com
fotos, PDF em tabela, ou um PDF por rua dentro de um `.zip`.

### 4.5 Vistorias pré/pós-obra
Contratos → bairros → ruas (`contratos`, `bairros`, `ruas`), vistoriantes
atribuídos por rua (`vistoria_atribuicoes`), fotos com GPS/EXIF
(`vistoria_fotos`, bucket `vistorias-fotos`) e relatório PDF gerado em partes
por um worker (`vistoria_relatorio_jobs` → `vistoria_relatorios`).

---

## 5. Banco de dados (Supabase / PostgreSQL)

Esquema `public`. Todas as tabelas têm RLS; o painel acessa com o login do
usuário e as rotas de servidor usam a chave de serviço. O esquema completo está
em `supabase/migrations/` e os tipos em `src/integrations/supabase/types.ts`.

### Fotos de obra
| Tabela | Conteúdo | Colunas principais |
|---|---|---|
| `encarregados` | Encarregado e o grupo de WhatsApp dele | `id`, `nome`, `grupo_whatsapp_id`, `grupo_whatsapp_nome`, `telefone`, `ativo`, `user_id` |
| `grupos` | Grupos que a instância de fotos conhece | `whatsapp_jid`, `nome_exibicao`, `ativo`, `ultima_foto_em` |
| `fotos` | Cada foto recebida | `encarregado_id`, `data_envio`, `data_pasta`, `storage_path`, `storage_url`, `caption`, `remetente_nome`, `remetente_telefone`, `message_id`, `status`, `formulario_id` |
| `localizacoes` | Localizações enviadas nos grupos | `encarregado_id`, `latitude`, `longitude`, `endereco`, `data_envio` |
| `eventos_raw` | Todo evento recebido do webhook (auditoria) | `tipo_evento`, `chat_id`, `message_id`, `payload` (JSON), `processado`, `erro` |
| `whatsapp_bot_status` | Status da conexão da instância | `connection_status`, `last_event_at`, `last_error` |

### Visão IA e qualidade
| Tabela | Conteúdo |
|---|---|
| `foto_analise_jobs` | Fila de análise (`foto_id`, `status`, `tentativas`) |
| `foto_analises` | Resultado da IA (`etapa`, `epi_detectado`, `sinalizacao`, `pv_qualidade`, `rfo`, `problemas`, `conformidade_geral`, `resumo`) |
| `foto_avaliacoes` | Aprovação/reprovação humana (`status`, `motivo_id`, `observacao`, `correcao_foto_id`, `notificado`) |
| `motivos_reprovacao` | Lista de motivos de reprovação |
| `visao_config` | Configuração da Visão IA (modelo, manual de fotos, aprendizado) |

### Macro I.A
| Tabela | Conteúdo |
|---|---|
| `ai_bot_config` | Configuração única (`id = 'default'`): persona, modelo, janelas e dias do check-in, mensagens, coordenadores, opções de alerta |
| `ai_bot_autorizados` | Números que o bot atende (`telefone`, `nome`, `ativo` = recebe check-in) |
| `ai_bot_conversas` | Histórico (`telefone`, `role` user/assistant, `conteudo`, `created_at`) |
| `ai_bot_respostas_pendentes` | Fila de respostas com atraso (`enviar_em`, `enviado`, `cancelado`, `tentativas`) |
| `ai_bot_envios_programados` | Registro dos check-ins enviados (`telefone`, `data_ref`, `periodo`, `sucesso`) |
| `ai_bot_alertas` | Alertas detectados (`telefone`, `nome`, `categoria`, `criticidade`, `resumo`, `enviado_coordenador`, `resolvido`) |
| `ai_bot_resumos_diarios` | Controle dos resumos enviados |
| `ai_bot_kb` / `ai_bot_exemplos` | Base de conhecimento e exemplos de resposta |
| `ai_bot_mensagens_processadas` | Anti-duplicidade de webhook (`message_id`) |

### Formulários
| Tabela | Conteúdo |
|---|---|
| `formularios` | Formulário (`titulo`, `status`, `publico`, `share_slug`, `pasta_id`, menu) |
| `formulario_campos` | Perguntas (`tipo`, `rotulo`, `opcoes`, `obrigatorio`, `condicao`, `ordem`) |
| `formulario_respostas` | Respostas (`dados` JSON por id de campo, `arquivos` JSON, `respondente_*`, `created_at`) |
| `formulario_acessos` | Quem pode ver cada formulário |
| `form_pastas` | Pastas de organização |

### Vistorias
| Tabela | Conteúdo |
|---|---|
| `contratos` → `bairros` → `ruas` | Estrutura do contrato |
| `vistoria_atribuicoes` | Vistoriante por rua e fase (pré/pós) |
| `vistoria_fotos` | Fotos com GPS, EXIF, lado, número da casa, par pré/pós |
| `vistoria_relatorio_jobs` / `vistoria_relatorios` | Geração e histórico dos relatórios PDF |

### Usuários e notificações
| Tabela | Conteúdo |
|---|---|
| `profiles` | Nome e e-mail do usuário (ligado ao Supabase Auth) |
| `user_roles` | Papéis: `admin`, `analista`, `vistoriante`, `user` |
| `push_subscriptions` / `push_config` | Notificações push do app instalado (PWA) |

### Storage (buckets privados)
| Bucket | Conteúdo |
|---|---|
| `fotos-obras` | Fotos dos grupos (`{encarregado}/{data}/…`), arquivos de formulários, configs JSON (`config/`), registro de erros do navegador (`diagnostico/`) |
| `vistorias-fotos` | Fotos e relatórios das vistorias |

Arquivos são acessados por **URL assinada** (temporária), nunca públicos.

---

## 6. Rotas de API e webhooks

Todas em `src/routes/api/public/hooks/`. São "públicas" no sentido de não
exigirem login do painel, mas **todas exigem um segredo** (no caminho ou em
cabeçalho).

| Rota | Quem chama | Autenticação | Função |
|---|---|---|---|
| `POST /uazapi-fotos/{token}` | UazAPI (fotos) | token no caminho | Recebe fotos dos grupos |
| `POST /uazapi-bot` | UazAPI (Macro I.A) | token do webhook | Conversa do bot e alertas |
| `POST /enviar-respostas-pendentes` | pg_cron (1/min) | `X-Bot-Secret` | Envia respostas da fila + check-in programado |
| `POST /mensagens-programadas` | GitHub Actions / manual | `X-Bot-Secret` | Check-in (rede de segurança, testes) |
| `POST /resumo-alertas-diario` | pg_cron (08:30 e a cada 2 h) | `X-Bot-Secret` | Resumo de alertas por área |
| `POST /reenviar-alertas` | manual | `X-Bot-Secret` | Reenvia alertas não entregues |
| `POST /notificar-reprovacoes` | GitHub Actions | `X-Bot-Secret` | Avisa encarregados de fotos reprovadas |
| `POST /processar-analises` | GitHub Actions (2 min) | `x-visao-secret` | Processa a fila da Visão IA |
| `POST /processar-relatorios` | GitHub Actions (5 min) | `x-relatorios-secret` | Gera relatórios de vistoria em partes |
| `POST /erro-cliente` | navegador | — (só grava log) | Registra erros de tela/envio de formulário |
| `POST /diagnostico-conversa` | GitHub Actions (manual) | `X-Bot-Secret` | Diagnósticos (conversa, envios, alertas, erros, grupos) |
| `POST /ai-bot` | — | `X-Bot-Secret` | Versão antiga do bot (legado) |

As **server functions** (`src/lib/*.functions.ts`) são chamadas pelo painel e
validam o login (token do Supabase Auth) e o papel do usuário.

---

## 7. Agendamentos

| Onde | Job | Quando | O que faz |
|---|---|---|---|
| pg_cron | `ai-bot-respostas-pendentes` | a cada minuto | `enviar-respostas-pendentes` (fila + check-in) |
| pg_cron | `ai-bot-resumo-manha` | 08:30 BRT, seg–sáb | Resumo de alertas da manhã |
| pg_cron | `ai-bot-resumo-2h` | 09:15, 11:15, 13:15, 15:15, 17:15 BRT, seg–sáb | Resumos ao longo do dia |
| GitHub Actions | `mensagens-programadas.yml` | a cada 10 min, 07:00–10:59 BRT | Rede de segurança do check-in |
| GitHub Actions | `notificar-reprovacoes.yml` | a cada 20 min, 07:00–19:55 BRT, seg–sáb | Aviso de fotos reprovadas |
| GitHub Actions | `processar-analises.yml` | a cada 2 min | Visão IA |
| GitHub Actions | `processar-relatorios.yml` | a cada 5 min | Relatórios de vistoria |
| GitHub Actions | `diagnostico-bot.yml` | manual | Diagnósticos |

---

## 8. Integração com outros sistemas

Formas recomendadas, da mais simples à mais controlada:

1. **Leitura direta do banco (somente leitura).** Criar um usuário Postgres
   próprio para a integração, com `SELECT` apenas nas tabelas necessárias.
   Conexão pelo *connection string* do Supabase (porta 5432 direta ou 6543 via
   pooler). Revogável a qualquer momento. Exemplo:
   ```sql
   create role integracao_macro login password '<<definir>>';
   grant usage on schema public to integracao_macro;
   grant select on public.encarregados, public.fotos, public.ai_bot_alertas,
                   public.formularios, public.formulario_campos,
                   public.formulario_respostas to integracao_macro;
   -- RLS: liberar leitura para este papel nas tabelas acima, ou usar
   -- "alter role integracao_macro bypassrls" se a leitura total for aprovada.
   ```
2. **API REST do Supabase (PostgREST)** — `https://<projeto>.supabase.co/rest/v1/<tabela>`,
   com um usuário do Supabase Auth de papel adequado (respeita RLS).
3. **Endpoint de integração dedicado** — uma rota nova em
   `src/routes/api/public/hooks/` com chave própria, devolvendo só os dados
   combinados. Indicado quando o outro sistema precisa **enviar** dados.

**Nunca** usar a `service_role key` em sistemas externos: ela ignora todas as
permissões.

Arquivos (fotos, PDFs) ficam no Storage; para baixar, gerar URL assinada com
`storage.from('fotos-obras').createSignedUrl(path, segundos)` a partir do
`storage_path` gravado na tabela.

---

## 9. Variáveis de ambiente (nomes — sem valores)

Configuradas no servidor (Lovable Cloud) e, as dos crons, nos *Secrets* do GitHub.

| Grupo | Variáveis |
|---|---|
| Supabase | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` / `APP_SUPABASE_SERVICE_ROLE_KEY` |
| UazAPI – fotos | `UAZAPI_BASE_URL`, `UAZAPI_INSTANCE_TOKEN`, `UAZAPI_FOTOS_WEBHOOK_TOKEN` |
| UazAPI – Macro I.A | `UAZAPI_MACRO_IA_BASE_URL`, `UAZAPI_MACRO_IA_TOKEN`, `UAZAPI_BOT_WEBHOOK_TOKEN` |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_API_KEY_VISAO` / `VISAO_OPENAI_KEY`, `VISAO_OPENAI_MODEL` |
| Segredos dos hooks | `AI_BOT_WEBHOOK_SECRET`, `VISAO_WORKER_SECRET`, `RELATORIOS_WORKER_SECRET` |
| Outros | `APP_PUBLIC_URL`, `GOOGLE_MAPS_API_KEY`, `LOVABLE_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_JWK`, `GITHUB_DISPATCH_REPO`, `GITHUB_DISPATCH_TOKEN` |

---

## 10. Desenvolvimento e publicação

```sh
npm install
npm run dev      # ambiente local (precisa das variáveis de ambiente)
npm run build    # build de produção
```

- Alterações enviadas ao branch `main` sincronizam com o projeto no Lovable;
  a publicação é feita pelo Lovable ("Publish").
- Mudanças de banco: novo arquivo em `supabase/migrations/` (aplicado no
  Supabase) e tipos regenerados em `src/integrations/supabase/types.ts`.
- Diagnósticos sem acesso ao banco: workflow **"Diagnóstico do bot"** no
  GitHub Actions (a saída é pública, por isso mascara telefones e não mostra
  conteúdo de mensagens).
