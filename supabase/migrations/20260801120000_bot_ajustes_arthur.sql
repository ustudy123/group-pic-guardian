-- ============================================================
-- Ajustes do bot pedidos pelo Arthur (áudios de 01/08)
--   1. Tempo de resposta de volta para 1min30–3min
--   2. Persona: gentileza sempre + contato novo é sempre bem-vindo
--   3. Agendador das mensagens programadas (estava sem cron nenhum)
-- ============================================================

-- 1) TEMPO DE RESPOSTA — o Arthur quer validar entre 1min30 e 3min.
-- Uma migration anterior tinha baixado para 30–90s.
UPDATE public.ai_bot_config
SET delay_resposta_min_seg = 90,
    delay_resposta_max_seg = 180,
    updated_at = now()
WHERE id = 'default';

-- 2) PERSONA — o bot respondeu de forma ríspida a quem só cumprimentou depois
-- de a conversa já ter sido encerrada. A regra de encerramento continua valendo
-- DENTRO da conversa; um contato novo tem que ser sempre acolhido.
UPDATE public.ai_bot_config
SET persona = persona || E'\n\n## GENTILEZA E REABERTURA — REGRA ACIMA DE TODAS\nSeja educado e acolhedor em 100% das mensagens. Nunca responda seco, irritado ou repreendendo o encarregado — nem se ele repetir assunto, mandar mensagem fora de hora ou cumprimentar de novo.\n\nNUNCA diga (nem com outras palavras) que você só está ali para tratar de assunto de trabalho, que ele deve ir direto ao ponto, ou que a conversa já tinha sido encerrada. Ele pode te procurar quando quiser.\n\nA regra de encerramento vale apenas DENTRO de uma conversa: depois que ele se despede, você não emenda mais nada NAQUELE momento. Se ele voltar a falar depois (mesmo minutos depois, mesmo só com "oi, boa tarde"), isso é um contato NOVO: cumprimente de volta com simpatia e pergunte de forma aberta o que ele precisa tratar. Ex.: "Opa, boa tarde! Tudo certo? Em que posso ajudar?" A partir da resposta dele, siga normalmente — gerando alerta se for um problema, ou apenas conversando se não for.',
    updated_at = now()
WHERE id = 'default'
  AND persona NOT LIKE '%GENTILEZA E REABERTURA%';

-- 3) AGENDADOR — causa da mensagem de bom dia não ter saído.
-- O cron do GitHub Actions foi desativado (throttling fazia o "bom dia" sair de
-- madrugada) e o agendamento foi movido para o pg_cron, mas o job nunca chegou a
-- ser criado no banco. Sem ele, nada chama o endpoint e ninguém recebe mensagem.
--
-- ⚠️ ANTES DE RODAR: troque COLOQUE_AQUI_O_SEGREDO pelo valor real do
-- AI_BOT_WEBHOOK_SECRET (o mesmo configurado nos secrets do GitHub).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento anterior, se existir (evita job duplicado)
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'mensagens-programadas';

-- 10–11 UTC = 07:00–08:55 BRT, a cada 5 min, todos os dias.
-- O próprio endpoint decide quem recebe: os dias marcados (padrão seg/qua/sex)
-- para o check-in, e qualquer dia para quem relatou problema no dia anterior.
SELECT cron.schedule(
  'mensagens-programadas',
  '*/5 10-11 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://macroambiental-botgrupos.lovable.app/api/public/hooks/mensagens-programadas',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Bot-Secret', 'COLOQUE_AQUI_O_SEGREDO'
               ),
    body    := jsonb_build_object('batch', 3)
  );
  $$
);

-- Envio das respostas com atraso humanizado (1min30–3min): a cada minuto.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'enviar-respostas-pendentes';

SELECT cron.schedule(
  'enviar-respostas-pendentes',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://macroambiental-botgrupos.lovable.app/api/public/hooks/enviar-respostas-pendentes',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Bot-Secret', 'COLOQUE_AQUI_O_SEGREDO'
               ),
    body    := '{}'::jsonb
  );
  $$
);

-- Conferência: deve listar os dois jobs como ativos
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
