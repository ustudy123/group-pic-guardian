UPDATE public.ai_bot_config
SET delay_resposta_min_seg = 30,
    delay_resposta_max_seg = 90,
    resumo_alertas_hora = 1030,
    updated_at = now()
WHERE id = 'default';