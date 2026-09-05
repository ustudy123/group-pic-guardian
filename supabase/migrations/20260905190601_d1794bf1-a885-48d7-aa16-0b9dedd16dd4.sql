CREATE TABLE IF NOT EXISTS public.ai_bot_mensagens_processadas (
  message_id text PRIMARY KEY,
  telefone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_bot_mensagens_processadas TO service_role;
ALTER TABLE public.ai_bot_mensagens_processadas ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ai_bot_msg_proc_created ON public.ai_bot_mensagens_processadas (created_at);
ALTER TABLE public.ai_bot_respostas_pendentes
  ADD COLUMN IF NOT EXISTS cancelado boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_ai_bot_resp_pend_fila
  ON public.ai_bot_respostas_pendentes (telefone, enviado, cancelado, enviar_em);