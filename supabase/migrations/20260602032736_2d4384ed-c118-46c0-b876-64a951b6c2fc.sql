
-- Singleton de configuração
CREATE TABLE public.ai_bot_config (
  id text PRIMARY KEY DEFAULT 'default',
  ativo boolean NOT NULL DEFAULT false,
  persona text NOT NULL DEFAULT '',
  modelo text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  temperatura numeric NOT NULL DEFAULT 0.7,
  max_historico int NOT NULL DEFAULT 20,
  saudacao_inicial text,
  somente_autorizados boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_bot_config_singleton CHECK (id = 'default')
);
INSERT INTO public.ai_bot_config (id) VALUES ('default') ON CONFLICT DO NOTHING;

CREATE TABLE public.ai_bot_kb (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  conteudo text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_bot_exemplos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pergunta text NOT NULL,
  resposta text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_bot_autorizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone text NOT NULL UNIQUE,
  nome text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_bot_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone text NOT NULL,
  nome text,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  conteudo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_bot_conversas_tel_idx ON public.ai_bot_conversas (telefone, created_at DESC);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_bot_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_bot_kb TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_bot_exemplos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_bot_autorizados TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_bot_conversas TO authenticated;
GRANT ALL ON public.ai_bot_config TO service_role;
GRANT ALL ON public.ai_bot_kb TO service_role;
GRANT ALL ON public.ai_bot_exemplos TO service_role;
GRANT ALL ON public.ai_bot_autorizados TO service_role;
GRANT ALL ON public.ai_bot_conversas TO service_role;

-- RLS
ALTER TABLE public.ai_bot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_bot_kb ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_bot_exemplos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_bot_autorizados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_bot_conversas ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_bot_config_select ON public.ai_bot_config FOR SELECT TO authenticated USING (true);
CREATE POLICY ai_bot_config_admin ON public.ai_bot_config FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY ai_bot_kb_all ON public.ai_bot_kb FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY ai_bot_exemplos_all ON public.ai_bot_exemplos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY ai_bot_autorizados_select ON public.ai_bot_autorizados FOR SELECT TO authenticated USING (true);
CREATE POLICY ai_bot_autorizados_admin ON public.ai_bot_autorizados FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY ai_bot_conversas_select ON public.ai_bot_conversas FOR SELECT TO authenticated USING (true);
CREATE POLICY ai_bot_conversas_admin ON public.ai_bot_conversas FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
