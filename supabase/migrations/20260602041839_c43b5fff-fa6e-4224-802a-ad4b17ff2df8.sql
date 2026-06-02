
-- ============ Análise visual de fotos ============

-- Tabela 1:1 com fotos: resultado da análise
CREATE TABLE public.foto_analises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foto_id uuid NOT NULL UNIQUE,
  etapa text NOT NULL DEFAULT 'outros',
  etapa_confianca numeric(4,3) NOT NULL DEFAULT 0,
  conformidade_geral text NOT NULL DEFAULT 'inconclusivo',
  epi_detectado jsonb NOT NULL DEFAULT '{}'::jsonb,
  sinalizacao jsonb NOT NULL DEFAULT '{}'::jsonb,
  pv_qualidade jsonb NOT NULL DEFAULT '{}'::jsonb,
  problemas jsonb NOT NULL DEFAULT '[]'::jsonb,
  resumo text NOT NULL DEFAULT '',
  modelo text,
  tokens_in integer,
  tokens_out integer,
  analisado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_foto_analises_foto_id ON public.foto_analises(foto_id);
CREATE INDEX idx_foto_analises_etapa ON public.foto_analises(etapa);
CREATE INDEX idx_foto_analises_conformidade ON public.foto_analises(conformidade_geral);
CREATE INDEX idx_foto_analises_analisado_em ON public.foto_analises(analisado_em DESC);

GRANT SELECT ON public.foto_analises TO authenticated;
GRANT ALL ON public.foto_analises TO service_role;

ALTER TABLE public.foto_analises ENABLE ROW LEVEL SECURITY;

CREATE POLICY foto_analises_select ON public.foto_analises
  FOR SELECT TO authenticated USING (true);

CREATE POLICY foto_analises_admin ON public.foto_analises
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_foto_analises_updated_at
  BEFORE UPDATE ON public.foto_analises
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Fila de jobs para o worker
CREATE TABLE public.foto_analise_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foto_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  tentativas integer NOT NULL DEFAULT 0,
  erro text,
  iniciado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_foto_analise_jobs_status ON public.foto_analise_jobs(status, created_at);
CREATE INDEX idx_foto_analise_jobs_foto_id ON public.foto_analise_jobs(foto_id);

GRANT SELECT ON public.foto_analise_jobs TO authenticated;
GRANT ALL ON public.foto_analise_jobs TO service_role;

ALTER TABLE public.foto_analise_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY foto_analise_jobs_select ON public.foto_analise_jobs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY foto_analise_jobs_admin ON public.foto_analise_jobs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_foto_analise_jobs_updated_at
  BEFORE UPDATE ON public.foto_analise_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: enfileira automaticamente toda foto nova que terminou de processar
CREATE OR REPLACE FUNCTION public.enfileirar_analise_foto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'processada' AND NEW.storage_path IS NOT NULL THEN
    INSERT INTO public.foto_analise_jobs (foto_id, status)
    VALUES (NEW.id, 'pendente')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fotos_enfileira_analise
  AFTER INSERT ON public.fotos
  FOR EACH ROW EXECUTE FUNCTION public.enfileirar_analise_foto();
