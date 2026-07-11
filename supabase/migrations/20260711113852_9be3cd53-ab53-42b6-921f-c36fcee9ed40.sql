-- Novas colunas de configuração
ALTER TABLE public.ai_bot_config
  ADD COLUMN IF NOT EXISTS dias_semana int[] NOT NULL DEFAULT '{1,3,5}',
  ADD COLUMN IF NOT EXISTS resumo_alertas_diario boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS resumo_alertas_hora int NOT NULL DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS delay_resposta_min_seg int NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS delay_resposta_max_seg int NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS follow_up_alertas boolean NOT NULL DEFAULT true;

-- Fila de respostas com atraso (para o bot "esperar" antes de responder)
CREATE TABLE IF NOT EXISTS public.ai_bot_respostas_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone text NOT NULL,
  nome text,
  resposta text NOT NULL,
  mensagem_origem text,
  enviar_em timestamptz NOT NULL,
  enviado boolean NOT NULL DEFAULT false,
  enviado_em timestamptz,
  tentativas int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pendentes_devidas
  ON public.ai_bot_respostas_pendentes (enviar_em)
  WHERE enviado = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_bot_respostas_pendentes TO authenticated;
GRANT ALL ON public.ai_bot_respostas_pendentes TO service_role;
ALTER TABLE public.ai_bot_respostas_pendentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins gerenciam pendentes" ON public.ai_bot_respostas_pendentes;
CREATE POLICY "admins gerenciam pendentes" ON public.ai_bot_respostas_pendentes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Idempotência do resumo diário
CREATE TABLE IF NOT EXISTS public.ai_bot_resumos_diarios (
  data_ref date PRIMARY KEY,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  total_alertas int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_bot_resumos_diarios TO authenticated;
GRANT ALL ON public.ai_bot_resumos_diarios TO service_role;
ALTER TABLE public.ai_bot_resumos_diarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins veem resumos" ON public.ai_bot_resumos_diarios;
CREATE POLICY "admins veem resumos" ON public.ai_bot_resumos_diarios
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Persona: nunca "ficar com a última palavra"
UPDATE public.ai_bot_config
SET persona = persona || E'\n\n## ENCERRAMENTO — REGRA CRÍTICA\nQuando o encarregado sinalizar fim de papo ("valeu", "beleza", "obrigado", "tá bom", "ok", "tchau", "boa noite", "flw", "só isso mesmo", "por enquanto é isso", "acabou", "nada mais", "de boa"), NÃO responda mais nada — nem "de nada", nem "boa noite", nem "fica com Deus", nem "qualquer coisa me chama". A conversa termina na fala DELE. O bot NUNCA deve ter a última palavra numa despedida. Se você já perguntou "tem mais alguma coisa?" e ele respondeu que não, encerre em silêncio — não emenda nova mensagem.\n\n## ANTI-REPETIÇÃO\nNunca comece duas mensagens seguidas com a mesma abertura ("Beleza", "Certo", "Entendi"). Varie. Nunca repita a mesma pergunta com palavras diferentes. Se já perguntou uma coisa e o encarregado respondeu, siga em frente — não reformule a mesma pergunta.'
WHERE id = 'default';