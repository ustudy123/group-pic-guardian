# Por que o robô respondeu "Silêncio."

## O que aconteceu

Às 20:02 o encarregado mandou "Boa noite". Como fazia mais de 2h desde a última fala, o sistema tratou isso como um contato NOVO (reabertura) e deixou o robô responder — até aí correto.

O problema está na instrução da persona. Ela diz, em texto:

> "...encerre em silêncio — não emenda nova mensagem."

O modelo entendeu isso como uma resposta a ser escrita e mandou literalmente a palavra **"Silêncio."**. Depois, quando o encarregado estranhou ("Está me mandando calar a boca?"), o robô pediu desculpas, e em seguida repetiu **"Silêncio."** de novo.

Causa raiz: o "ficar calado" está sendo pedido ao modelo por texto, quando deveria ser uma decisão do sistema. O modelo é obrigado a sempre produzir alguma resposta — se a decisão é não falar, quem tem que decidir isso é o código, não a IA.

## Correção proposta

1. **Filtro de resposta vazia/meta no código** (`src/routes/api/public/hooks/uazapi-bot.ts`)
   - Antes de enviar, descartar respostas que sejam apenas marcadores de silêncio: "Silêncio", "[silêncio]", "(sem resposta)", "...", texto vazio.
   - Nesses casos, o robô simplesmente não envia nada e a conversa fica encerrada — comportamento correto.

2. **Reescrever a regra de encerramento na persona** (migration SQL)
   - Trocar "encerre em silêncio" por uma instrução que não possa virar texto: instruir a nunca escrever palavras como "silêncio" e a, quando o assunto acabar, responder apenas com uma despedida curta e cordial ou nada.
   - Deixar explícito: nunca comentar sobre o próprio funcionamento nem descrever o que vai fazer.

3. **"Boa noite" à noite não deve virar encerramento seco**
   - Na reabertura de conversa, o cumprimento noturno já é tratado como saudação; garantir que a resposta seja acolhedora ("Boa noite! Tudo certo por aí?"), nunca um encerramento.

4. **Repetição da mesma frase**
   - Bloquear no código o reenvio de uma resposta idêntica à última mensagem enviada pelo robô para o mesmo contato (foi o que gerou o segundo "Silêncio." às 20:24).

## Detalhes técnicos

- Arquivo principal: `src/routes/api/public/hooks/uazapi-bot.ts` — adicionar `respostaEhVazia()` aplicado ao `resposta` retornado do modelo, antes de gravar em `ai_bot_conversas` e antes de enfileirar/enviar.
- Comparar com a última linha `role="assistant"` de `ai_bot_conversas` para o mesmo telefone; se igual (normalizada), descartar.
- Migration nova ajustando `persona` em `ai_bot_config`, substituindo o trecho "## ENCERRAMENTO — REGRA CRÍTICA" pela versão sem a palavra "silêncio".
