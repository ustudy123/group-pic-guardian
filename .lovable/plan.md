## Problema

Hoje a tabela `grupos` só é alimentada quando **chega uma mensagem** no webhook da Z-API (o trigger `descobrir_grupo_de_evento` roda no `INSERT` em `eventos_raw`). Resultado: grupo onde o bot já foi adicionado, mas ninguém mandou mensagem ainda, **nunca aparece** em "Grupos descobertos".

A Z-API expõe um endpoint que lista **todos os chats (incluindo grupos)** da instância. Vamos usá-lo para puxar a lista completa sob demanda, via botão no painel.

## O que vai mudar

1. **Botão "Sincronizar grupos do WhatsApp"** na página `/painel/grupos`, ao lado do título.
2. Ao clicar:
   - Chama um server function novo (`sincronizarGruposZapi`).
   - O server function pergunta para a Z-API: "me dá todos os grupos dessa instância".
   - Faz `upsert` na tabela `grupos` (por `whatsapp_jid`):
     - Grupos novos entram com `ativo = true` e `ultima_foto_em = null` → caem direto em "Aguardando ativação".
     - Grupos já existentes só têm o `nome_exibicao` atualizado (não mexe em `ativo` nem `ultima_foto_em` para não bagunçar quem você já recusou).
   - Devolve quantos foram criados / atualizados.
3. Toast no painel: *"3 grupos novos importados, 12 atualizados"* e refresh automático da lista.

## Detalhes técnicos

- **Endpoint Z-API**: `GET https://api.z-api.io/instances/{ZAPI_INSTANCE_ID}/token/{ZAPI_INSTANCE_TOKEN}/chats?page=1` (com header `Client-Token: ZAPI_CLIENT_TOKEN`). Filtramos por `isGroup === true`. Paginamos enquanto vier resposta cheia.
- **Arquivo novo**: `src/lib/grupos.functions.ts` com `createServerFn` `sincronizarGruposZapi`, protegido por `requireSupabaseAuth` (só usuário logado dispara).
- **Cliente Supabase**: `supabaseAdmin` (de `client.server`) porque a tabela `grupos` não tem policy de INSERT — apenas service role pode escrever. Continua seguro: a chamada só sai do servidor, autenticada.
- **UI**: edita `src/routes/painel.grupos.tsx` para incluir o botão + `useMutation` que chama o server fn via `useServerFn`.
- **Sem migração**: nada muda no schema. As policies atuais já permitem que o painel leia tudo.

## O que NÃO muda

- Webhook continua igual — a descoberta automática quando chega foto segue funcionando.
- Recusados continuam recusados (preservamos o campo `ativo` no upsert).
- Encarregados já ativados continuam ativados.

## Riscos / observações

- Se a instância Z-API tiver centenas de grupos, a paginação pode demorar alguns segundos. Botão mostra estado "Sincronizando…".
- O endpoint da Z-API às vezes retorna nomes de grupo vazios (grupos sem nome configurado). Nesses casos usamos o próprio JID como `nome_exibicao` como fallback (mesma lógica do trigger atual).