
ALTER TABLE public.ai_bot_config
  ADD COLUMN IF NOT EXISTS coordenador_telefone text,
  ADD COLUMN IF NOT EXISTS coordenador_nome text,
  ADD COLUMN IF NOT EXISTS alertas_ativos boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.ai_bot_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone text NOT NULL,
  nome text,
  categoria text NOT NULL,
  criticidade text NOT NULL DEFAULT 'media',
  resumo text NOT NULL,
  mensagem_origem text,
  enviado_coordenador boolean NOT NULL DEFAULT false,
  enviado_em timestamptz,
  resolvido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_bot_alertas TO authenticated;
GRANT ALL ON public.ai_bot_alertas TO service_role;

ALTER TABLE public.ai_bot_alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_bot_alertas_select ON public.ai_bot_alertas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ai_bot_alertas_admin ON public.ai_bot_alertas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_ai_bot_alertas_created ON public.ai_bot_alertas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_bot_alertas_criticidade ON public.ai_bot_alertas (criticidade, resolvido);
