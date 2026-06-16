
ALTER TABLE public.ai_bot_config
  ADD COLUMN IF NOT EXISTS msg_manha_variacoes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS msg_noite_variacoes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS janela_manha_inicio integer NOT NULL DEFAULT 715,
  ADD COLUMN IF NOT EXISTS janela_manha_fim integer NOT NULL DEFAULT 815,
  ADD COLUMN IF NOT EXISTS janela_noite_inicio integer NOT NULL DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS janela_noite_fim integer NOT NULL DEFAULT 1900;
