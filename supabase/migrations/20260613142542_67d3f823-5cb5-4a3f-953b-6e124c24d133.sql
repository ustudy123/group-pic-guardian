ALTER TABLE public.visao_config
  ADD COLUMN IF NOT EXISTS aprendizado text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS manual_fotos text NOT NULL DEFAULT '';