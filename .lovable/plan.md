## Objetivo
Eliminar o Railway criando um endpoint webhook dentro do próprio app Lovable que replica 100% do comportamento atual visível nos logs.

## O que os screenshots me revelaram

**Do log do Railway:**
- Quando chega foto de grupo **cadastrado** → baixa, salva com nome `{encarregado} / {data} / {hash}` e tamanho em KB
- Quando chega de grupo **não cadastrado** → ignora e loga aviso (não cria nada)
- Fotos chegam em rajadas (várias do mesmo grupo no mesmo segundo)

**Da Z-API:**
- Webhook único configurado em "Ao receber": `https://bot-macro-ambiental-production.up.railway.app/webhook/zapi/123456`
- Filtros desligados (recebe grupos, texto, imagem, vídeo, áudio, documento)
- Instância conectada, multi-device, assinatura **expirada mas ainda PAGA/ativa** (vai cair logo)

## Arquitetura proposta

```
WhatsApp → Z-API → POST https://gestaomacroambiental.com.br/api/public/hooks/zapi-bot
                                          ↓
                          Lovable Server Route (TanStack)
                                          ↓
                ┌─────────────────────────┼─────────────────────────┐
                ↓                         ↓                         ↓
        eventos_raw              Storage (obras-fotos)      foto_analise_jobs
        (auditoria)              + tabela fotos             (trigger automático)
```

## Implementação

### 1. Nova rota pública: `src/routes/api/public/hooks/zapi-bot.ts`

Recebe POST da Z-API. Lógica do handler:

1. **Validação leve**: token na URL (ex: `?token=XXX`) comparado com secret `ZAPI_WEBHOOK_TOKEN` (Z-API não assina HMAC, então usamos token na URL — mesma técnica do Railway hoje com `/123456`).
2. **Insert em `eventos_raw`** sempre (auditoria completa, igual hoje).
3. **Trigger `descobrir_grupo_de_evento`** já existe — ele auto-cria/atualiza `grupos` a partir do `eventos_raw`. Não precisa duplicar.
4. **Se for imagem em grupo**:
   - Buscar `encarregado` ativo pelo `grupo_whatsapp_id` (JID do grupo)
   - Se **não achar** → só loga "grupo não cadastrado" e retorna 200 (igual Railway)
   - Se achar → baixar imagem da URL do payload Z-API (`payload.image.imageUrl`)
   - Upload para bucket `obras-fotos` com path `{encarregado_id}/{YYYY-MM-DD}/{messageId}.jpg`
   - Insert em `fotos` com `status='processada'`, `storage_path`, `encarregado_id`, `tirada_em`
   - Trigger `enfileirar_analise_foto` (já existe) cria job automaticamente

### 2. Novo secret: `ZAPI_WEBHOOK_TOKEN`
Token aleatório gerado, usado na URL pública do webhook.

### 3. Atualização no painel Z-API (você faz)
Substituir a URL "Ao receber" por:
```
https://gestaomacroambiental.com.br/api/public/hooks/zapi-bot?token=XXX
```

### 4. Cancelar Railway (depois de validar)
Após 1-2 dias rodando estável, cancela a assinatura do Railway.

## O que NÃO muda

- Banco de dados, Storage, painel, encarregados, fotos antigas, análises por IA — tudo intacto
- Fluxo de descoberta de grupos novos (trigger já faz)
- Análise automática de fotos (trigger já faz)

## Pontos que preciso confirmar com você antes de implementar

1. **Formato exato do payload da Z-API para imagem**: vou assumir o padrão público (`payload.image.imageUrl` em base64 ou URL HTTPS direta). Se o Railway faz algo diferente (ex: chama outro endpoint Z-API para baixar), só vou descobrir no primeiro teste real — pode precisar de 1 ajuste rápido.
2. **Bucket correto**: existem dois (`obras-fotos` e `fotos-obras`). Qual o Railway está usando hoje? Vou olhar uma foto existente na tabela `fotos` para descobrir o `storage_path` real.
3. **Coluna `tirada_em` vs `momento`**: preciso checar o schema da tabela `fotos` para mapear corretamente.

## Riscos

- **Baixo**: se eu errar o formato do payload Z-API, fotos novas param de cair até eu ajustar. Fotos antigas continuam no banco.
- **Zero**: nenhum dado existente é tocado.
- **Mitigação**: deixar Railway rodando em paralelo por 1 dia. As duas pontas escrevem no mesmo banco — vai ter foto duplicada por 1 dia, depois você desliga o Railway.

## Próximo passo
Se aprovar este plano, ao entrar em build mode eu:
1. Leio o schema real da tabela `fotos` e descubro o bucket usado
2. Crio a rota `/api/public/hooks/zapi-bot`
3. Crio o secret `ZAPI_WEBHOOK_TOKEN`
4. Te entrego a URL pra colar na Z-API
