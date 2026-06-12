-- Mensagens programadas (check-in proativo manhã/noite) — aprovado por Arthur em 10/06
-- Templates ficam na config; envios são registrados para idempotência (1 envio por telefone/período/dia)

ALTER TABLE public.ai_bot_config
  ADD COLUMN IF NOT EXISTS msg_programadas_ativas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS msg_manha text NOT NULL DEFAULT 'Bom dia {nome}, como que tá aí? Agarrou alguma coisa? Conseguiu sair do canteiro no horário certinho?',
  ADD COLUMN IF NOT EXISTS msg_noite text NOT NULL DEFAULT 'Boa noite {nome}, como foi o dia hoje? Agarrou alguma coisa? Os engenheiros conseguiram atender todas as demandas que você fez?';

CREATE TABLE IF NOT EXISTS public.ai_bot_envios_programados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone text NOT NULL,
  nome text,
  periodo text NOT NULL CHECK (periodo IN ('manha', 'noite')),
  data_ref date NOT NULL,
  mensagem text NOT NULL,
  sucesso boolean NOT NULL DEFAULT false,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telefone, periodo, data_ref)
);

CREATE INDEX IF NOT EXISTS idx_envios_programados_data
  ON public.ai_bot_envios_programados (data_ref, periodo);

ALTER TABLE public.ai_bot_envios_programados ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_bot_envios_programados_select
  ON public.ai_bot_envios_programados FOR SELECT TO authenticated USING (true);
