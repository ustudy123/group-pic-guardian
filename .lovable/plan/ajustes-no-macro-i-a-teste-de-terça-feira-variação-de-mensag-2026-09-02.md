# Ajustes no Macro I.A. — teste de terça-feira + variação de mensagens

## O que o usuário pediu (transcrição)

1. **Implantação em modo teste na quarta-feira:** todos os encarregados autorizados recebem a mensagem programada **somente na quarta-feira**. No restante da semana, ninguém recebe nada.
2. **Mensagem nunca repetida:** quando a pessoa não responde e chega o próximo dia de envio, a mensagem deve ser **diferente da anterior** — para não parecer "copiar e colar".

## Estado atual (verificado no código)

- O hook `mensagens-programadas.ts` já sorteia uma mensagem da lista `msg_manha_variacoes` — mas o sorteio é aleatório puro, então **pode repetir a mesma mensagem** para a mesma pessoa em dias seguidos.
- A tabela `ai_bot_envios_programados` já guarda o texto exato enviado para cada telefone em cada dia — dá para comparar e evitar repetição sem criar tabela nova.
- Os dias de envio são controlados pelo campo `dias_semana` em `ai_bot_config` (hoje seg/qua/sex).

## O que será feito

### 1. Modo "só terça-feira" (semana de teste)

- Ajustar `dias_semana` para `[2]` (quarta-feira) em `ai_bot_config` — via SQL direto, na véspera.
- Manter o follow-up de alertas desligado nessa semana de teste para garantir que **ninguém** receba fora da terça (ou manter ligado se quiser que quem gerou alerta receba — decisão abaixo).
- Ao fim da semana de teste, voltar `dias_semana` para a configuração definitiva.

### 2. Anti-repetição de mensagem (variação garantida)

No hook `src/routes/api/public/hooks/mensagens-programadas.ts`:

- Antes de sortear a variação, buscar em `ai_bot_envios_programados` a **última mensagem enviada para aquele telefone**.
- Filtrar a lista de variações removendo a última usada (comparação normalizada); sortear entre as restantes.
- Se só existir 1 variação cadastrada, usa ela mesmo (não há o que variar).
- Resultado: quem não respondeu recebe, no próximo envio, uma mensagem visivelmente diferente da anterior.

### 3. (Opcional, incluído se aprovado) Enriquecer as variações

- Se a lista `msg_manha_variacoes` estiver curta, sugerir/cadastrar mais variações de "bom dia" via SQL, para a anti-repetição ter material de sobra.

## Detalhes técnicos

- Arquivo alterado: `src/routes/api/public/hooks/mensagens-programadas.ts` (função de escolha da variação — hoje `Math.random()` puro na linha ~369).
- SQL: `UPDATE ai_bot_config SET dias_semana = '{2}'` para a semana de teste (e reversão depois).
- A comparação usa o texto gravado em `ai_bot_envios_programados.mensagem` do envio mais recente daquele telefone no mesmo período.
- Idempotência existente (telefone+período+data) continua intacta — ninguém recebe duas vezes no mesmo dia.

## Decisão necessária

Na semana de teste (só quarta), o **follow-up de quem gerou alerta** deve ficar ligado ou desligado? O plano padrão assume **desligado** (teste limpo: só a terça-feira, para todos).