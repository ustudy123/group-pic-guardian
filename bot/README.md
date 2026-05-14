# Bot WhatsApp — Macro Ambiental

Bot Node.js que escuta os grupos de WhatsApp, baixa as fotos enviadas e faz POST no painel.

## ⚠️ Importante

- **Use um número de WhatsApp dedicado** (chip novo / não pessoal). Baileys é uma biblioteca não-oficial e o WhatsApp pode banir o número.
- O bot precisa ser **adicionado como participante** em cada grupo que você quer monitorar.
- Fotos enviadas **antes** da primeira conexão do bot **não** são importadas (só as novas).

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `LOVABLE_API_URL` | URL do app no Lovable, ex.: `https://project--07528081-b16b-457c-89ce-f6cbc3387af7.lovable.app` |
| `WHATSAPP_BOT_SECRET` | A mesma string que você cadastrou nos Secrets do Lovable |

## Rodar localmente (testar)

```bash
cd bot
npm install
LOVABLE_API_URL=https://seu-projeto.lovable.app \
WHATSAPP_BOT_SECRET=sua-string-secreta \
npm start
```

Vai aparecer um **QR code** no terminal. Abra o WhatsApp do número dedicado → Aparelhos conectados → Conectar um aparelho → escaneie.

A pasta `./auth_info/` é criada automaticamente e mantém a sessão (não precisa escanear de novo).

## Deploy na Railway

1. Crie uma conta em https://railway.app
2. **New Project** → **Deploy from GitHub** (suba a pasta `bot/` num repositório) **ou** **Empty Project** + arraste a pasta.
3. Em **Variables**, adicione:
   - `LOVABLE_API_URL`
   - `WHATSAPP_BOT_SECRET`
4. **Settings → Volumes**: crie um volume montado em `/app/auth_info` (importante: sem isso, toda vez que o serviço reiniciar você precisa escanear o QR de novo).
5. Após o deploy, abra **View Logs** → escaneie o QR code que aparece.
6. Adicione o número do bot como participante nos grupos que devem ser monitorados.

A partir daí, toda imagem nova enviada nos grupos aparece automaticamente no painel.

## Comportamento

- Apenas mensagens de **grupos** (`@g.us`) são processadas.
- Apenas **imagens** são enviadas (vídeos, áudios e documentos são ignorados).
- Idempotência: se o bot reiniciar e reprocessar uma mensagem, o servidor identifica pelo `msg_id` e não duplica.
- Em caso de falha de rede no envio para o painel, retenta 5 vezes com backoff exponencial.

## Logs úteis

- `foto enviada` — sucesso.
- `falha no envio` (status 401) — `WHATSAPP_BOT_SECRET` não bate com o do painel.
- `conexão fechada` — desconexão do WhatsApp; o bot tenta reconectar sozinho.
- `conexão fechada` com `statusCode: 403` antes do QR — incompatibilidade de versão do WhatsApp Web no pareamento. O bot agora tenta reiniciar sozinho com uma versão compatível; se ainda persistir, defina `WA_VERSION=2,2413,51` nas variáveis do deploy e reinicie o serviço.
