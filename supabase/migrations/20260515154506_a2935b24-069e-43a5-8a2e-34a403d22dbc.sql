CREATE TABLE public.whatsapp_bot_status (
  id TEXT PRIMARY KEY,
  connection_status TEXT NOT NULL DEFAULT 'idle' CHECK (connection_status IN ('idle', 'starting', 'qr_ready', 'connected', 'disconnected', 'error')),
  qr_text TEXT,
  last_error TEXT,
  phone_jid TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_bot_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_bot_status_select_authenticated"
ON public.whatsapp_bot_status
FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER update_whatsapp_bot_status_updated_at
BEFORE UPDATE ON public.whatsapp_bot_status
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.whatsapp_bot_status (id, connection_status)
VALUES ('main', 'idle')
ON CONFLICT (id) DO NOTHING;