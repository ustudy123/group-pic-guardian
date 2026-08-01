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

-- 3) AGENDADOR — NÃO recriar aqui.
--
-- Conferido em 01/08: os jobs do pg_cron JÁ EXISTEM e estão ativos, criados
-- manualmente no banco (por isso não havia migration com cron.schedule):
--   mensagens-programadas       */5 10-11 * * *              (07:00–08:55 BRT)
--   ai-bot-respostas-pendentes  * * * * *
--   ai-bot-resumo-manha         30 11 * * 1-6
--   ai-bot-resumo-2h            15 12,14,16,18,20 * * 1-6
--
-- ⚠️ Cuidado ao mexer: agendar um segundo job apontando para o mesmo endpoint
-- (ex.: 'enviar-respostas-pendentes' junto do 'ai-bot-respostas-pendentes')
-- coloca dois workers na mesma fila e pode entregar a MESMA resposta duas vezes
-- para o encarregado. Se precisar alterar um job, use cron.unschedule com o
-- nome exato do existente antes de recriar.
--
-- Diagnóstico quando a mensagem não sair (rode uma consulta por vez):
--   SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
--   SELECT jobname, command FROM cron.job WHERE jobname = 'mensagens-programadas';
--   SELECT status, return_message, start_time
--     FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--   SELECT id, status_code, content, created
--     FROM net._http_response ORDER BY created DESC LIMIT 20;
-- Um status_code 401 nas respostas do pg_net indica segredo errado no job:
-- o cron dispara, mas o endpoint recusa e ninguém recebe mensagem.
