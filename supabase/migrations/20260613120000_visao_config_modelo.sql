-- Config da Visão IA: permite escolher o modelo OpenAI (gpt-4o / gpt-4o-mini) pela tela.

CREATE TABLE IF NOT EXISTS public.visao_config (
  id text PRIMARY KEY DEFAULT 'default',
  modelo text NOT NULL DEFAULT 'gpt-4o',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.visao_config (id, modelo)
  VALUES ('default', 'gpt-4o')
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.visao_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY visao_config_select ON public.visao_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY visao_config_admin ON public.visao_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
