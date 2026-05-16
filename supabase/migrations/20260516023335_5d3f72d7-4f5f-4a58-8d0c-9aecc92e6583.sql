
ALTER TABLE public.grupos ALTER COLUMN encarregado DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.descobrir_grupo_de_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_group boolean;
  v_jid text;
  v_nome text;
  v_is_image boolean;
BEGIN
  v_is_group := COALESCE((NEW.payload->>'isGroup')::boolean, false);
  v_jid := NEW.chat_id;
  IF NOT v_is_group OR v_jid IS NULL OR v_jid = '' THEN
    RETURN NEW;
  END IF;

  v_nome := COALESCE(NULLIF(NEW.payload->>'chatName', ''), v_jid);
  v_is_image := (NEW.payload ? 'image') OR NEW.tipo_evento = 'image';

  INSERT INTO public.grupos (whatsapp_jid, nome_exibicao, ultima_foto_em)
  VALUES (
    v_jid,
    v_nome,
    CASE WHEN v_is_image THEN NOW() ELSE NULL END
  )
  ON CONFLICT (whatsapp_jid) DO UPDATE
    SET nome_exibicao = EXCLUDED.nome_exibicao,
        ultima_foto_em = CASE
          WHEN v_is_image THEN NOW()
          ELSE public.grupos.ultima_foto_em
        END,
        updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS eventos_raw_descobrir_grupo ON public.eventos_raw;
CREATE TRIGGER eventos_raw_descobrir_grupo
  AFTER INSERT ON public.eventos_raw
  FOR EACH ROW
  EXECUTE FUNCTION public.descobrir_grupo_de_evento();

-- Popular grupos a partir dos eventos já existentes
INSERT INTO public.grupos (whatsapp_jid, nome_exibicao, ultima_foto_em)
SELECT
  e.chat_id,
  COALESCE(NULLIF(MAX(e.payload->>'chatName'), ''), e.chat_id) AS nome,
  MAX(CASE WHEN (e.payload ? 'image') OR e.tipo_evento = 'image' THEN e.created_at END) AS ultima
FROM public.eventos_raw e
WHERE COALESCE((e.payload->>'isGroup')::boolean, false) = true
  AND e.chat_id IS NOT NULL
GROUP BY e.chat_id
ON CONFLICT (whatsapp_jid) DO UPDATE
  SET nome_exibicao = EXCLUDED.nome_exibicao,
      ultima_foto_em = COALESCE(EXCLUDED.ultima_foto_em, public.grupos.ultima_foto_em);
