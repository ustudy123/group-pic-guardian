-- ============================================================
-- Notificações push do Portal do Encarregado (PWA)
-- ============================================================

-- 1) Inscrições de push por usuário (cada aparelho gera uma inscrição)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuario gerencia proprias inscricoes" ON public.push_subscriptions;
CREATE POLICY "usuario gerencia proprias inscricoes" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);

-- 2) Chaves VAPID do servidor de push (lidas apenas pelo service_role —
-- RLS ligada SEM políticas nega acesso a authenticated/anon)
CREATE TABLE IF NOT EXISTS public.push_config (
  id text PRIMARY KEY DEFAULT 'default',
  vapid_public text NOT NULL,
  vapid_private_jwk text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.push_config TO service_role;
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.push_config (id, vapid_public, vapid_private_jwk)
VALUES (
  'default',
  'BMeQNnVd1aFrpllOvsqDPHdZ9jhHfbdTWKQQ1RilM4UH8AIQiNpckl4f3k1YOd24T8hr0Ra6jdduTDhISWIDEbo',
  '{"kty":"EC","x":"x5A2dV3VoWumWU6-yoM8d1n2OEd9t1NYpBDVGKUzhQc","y":"8AIQiNpckl4f3k1YOd24T8hr0Ra6jdduTDhISWIDEbo","crv":"P-256","d":"PXd0ey6M3Grdz8rwLc44oD0CfRRXTW3_-yAYy7zratA"}'
)
ON CONFLICT (id) DO NOTHING;

-- Recarrega o cache de schema da API
NOTIFY pgrst, 'reload schema';
