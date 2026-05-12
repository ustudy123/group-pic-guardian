## Objetivo da Fase 1

Eliminar as ~3h diárias gastas baixando fotos manualmente. O bot escuta os grupos de WhatsApp, baixa toda imagem recebida e armazena automaticamente na estrutura `Encarregado/AAAA-MM/DD/foto.jpg` no Supabase Storage, com painel de visualização no Lovable.

Fora do escopo desta fase (ficam para depois): chatbot conversacional com encarregados, análise de conformidade RFO por IA, mapa de rede de água.

---

## Arquitetura

```text
[Grupos WhatsApp]
        |
        v
[Bot Baileys - Node.js, rodando em VPS/Railway do cliente]
        |  (download da mídia + metadados)
        v
[API do Lovable: POST /api/public/whatsapp/ingest]  <-- autenticada por shared secret
        |
        +--> Supabase Storage (bucket "obras-fotos")
        |       caminho: {encarregado}/{YYYY-MM}/{DD}/{timestamp}_{msgId}.jpg
        |
        +--> Supabase DB (tabela "fotos" com metadados)
                |
                v
        [Painel Lovable: lista grupos -> meses -> dias -> grid de fotos]
```

O bot fica fora do Lovable (serverless não mantém sessão WhatsApp Web). O Lovable fica responsável por: endpoint de ingestão, banco, storage, autenticação e painel.

---

## Entregáveis

### 1. Lado Lovable (este projeto)

**Banco (migration Supabase)**

- `grupos` — id, whatsapp_jid (id do grupo no WhatsApp), nome_exibicao, encarregado, ativo, created_at
- `fotos` — id, grupo_id, encarregado, whatsapp_msg_id (único, idempotência), remetente_jid, remetente_nome, caption, mime_type, tamanho_bytes, storage_path, data_envio (timestamp original), ano_mes, dia, created_at
- Índices em (encarregado, ano_mes, dia) e em whatsapp_msg_id (unique)
- RLS: leitura só para usuários autenticados; escrita só via service role (bot)

**Storage**

- Bucket privado `obras-fotos`
- URLs assinadas geradas sob demanda no painel

**Endpoint de ingestão** — `src/routes/api/public/whatsapp/ingest.ts`

- POST multipart: arquivo + JSON com `group_jid`, `group_name`, `sender_jid`, `sender_name`, `caption`, `msg_id`, `timestamp`
- Verifica header `X-Bot-Secret` contra `WHATSAPP_BOT_SECRET` (timing-safe)
- Faz upsert do grupo, ignora msg_id duplicado, faz upload no storage e insere linha em `fotos`
- Resolve `encarregado` a partir do `nome_exibicao` do grupo (regra: extrai do nome, ex.: "Fotos Wilson" → "Wilson"; com override manual via tabela `grupos`)

**Painel autenticado** (`/_authenticated/...`)

- Login (email/senha + Google) via Lovable Cloud Auth
- `/painel` — lista de encarregados com contagem de fotos do dia / total
- `/painel/$encarregado` — navegação por mês → dia
- `/painel/$encarregado/$ano-mes/$dia` — grid de thumbnails, lightbox, download, filtro por horário, busca por caption
- Indicador de "última foto recebida" por grupo (ajuda a detectar bot offline)

**Secrets necessários**

- `WHATSAPP_BOT_SECRET` (compartilhado entre bot e endpoint)

### 2. Bot WhatsApp (repositório separado, entregue como projeto Node.js)

Arquivo `bot/` na raiz do projeto Lovable, contendo um app Node independente:

- `package.json` com `@whiskeysockets/baileys`, `pino`, `qrcode-terminal`, `node-fetch`
- `index.js` — abre sessão Baileys, salva auth em `./auth_info/` (volume persistente), escuta `messages.upsert`, filtra mensagens de grupo com mídia (image/video opcional), baixa via `downloadMediaMessage`, faz POST no endpoint do Lovable com retry exponencial
- `README.md` com:
  - Como rodar local (`npm i && npm start` → escanear QR code)
  - Como deployar em Railway (Dockerfile incluso, volume montado em `/app/auth_info`)
  - Variáveis: `LOVABLE_API_URL`, `WHATSAPP_BOT_SECRET`
  - Aviso sobre risco de ban: usar número dedicado (não pessoal)

---

## Fluxo de uso após pronto

1. Cliente cria conta na Railway, sobe a pasta `bot/` (botão de deploy no README).
2. Configura as 2 variáveis de ambiente.
3. Abre os logs, escaneia o QR code com o WhatsApp do número dedicado.
4. Adiciona esse número como participante nos 20 grupos.
5. A partir daí, toda foto enviada nos grupos aparece no painel do Lovable em segundos.

---

## Detalhes técnicos importantes

- **Idempotência**: `whatsapp_msg_id` é unique — se o bot reiniciar e reprocessar mensagens, não duplica.
- **Resync**: Baileys ao reconectar busca mensagens recentes pendentes; fotos antigas (anteriores à primeira conexão) NÃO são importadas — a importação histórica do OneDrive fica fora do escopo (posso fazer separado se quiserem).
- **Mapeamento grupo → encarregado**: o nome do grupo no WhatsApp é a fonte da verdade na primeira sincronização; o cliente pode editar manualmente o campo `encarregado` no painel se o nome não bater.
- **Fuso horário**: armazenamos UTC no banco e renderizamos em America/Sao_Paulo no painel (data do envio define a pasta dia/mês — não a data de chegada no servidor).
- **Tamanho/custo Storage**: ~20 grupos × 30 fotos × ~500KB ≈ 300MB/dia ≈ 9GB/mês. Plano free do Supabase (1GB) estoura em ~3 dias — precisa Lovable Cloud pago, ou compactação/redimensionamento. Sugiro redimensionar para max 1920px no bot antes do upload (reduz ~70%) — confirmar se mantém qualidade aceitável para evidência de obra.
- **Vídeos**: por ora, ignorar (só imagens) para conter custo. Confirmar.

---

## Pendências que preciso confirmar antes de começar

1. **Redimensionar para 1920px no bot?** (recomendo sim — mantém legível para evidência e corta custo de storage drasticamente)
2. **Vídeos enviados nos grupos: ignorar** 
3. **Login do painel: quem terá acesso?**  [wallasmonteiro019@gmail.com](mailto:wallasmonteiro019@gmail.com) 
4. **Usar supabase. Nunca lovable cloud. Quero usar o supabase.**

&nbsp;