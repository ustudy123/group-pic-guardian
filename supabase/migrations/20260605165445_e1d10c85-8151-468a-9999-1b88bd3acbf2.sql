ALTER TABLE public.ai_bot_config
  ADD COLUMN IF NOT EXISTS coordenador_telefone_2 text,
  ADD COLUMN IF NOT EXISTS coordenador_nome_2 text,
  ADD COLUMN IF NOT EXISTS coordenador_telefone_3 text,
  ADD COLUMN IF NOT EXISTS coordenador_nome_3 text,
  ADD COLUMN IF NOT EXISTS coordenador_telefone_4 text,
  ADD COLUMN IF NOT EXISTS coordenador_nome_4 text;