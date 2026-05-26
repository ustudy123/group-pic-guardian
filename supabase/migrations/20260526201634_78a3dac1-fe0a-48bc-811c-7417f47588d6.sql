CREATE TABLE public.vistoria_relatorio_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bairro_id uuid NOT NULL,
  contrato_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('pre','pos')),
  status text NOT NULL DEFAULT 'na_fila' CHECK (status IN ('na_fila','processando','pronto','erro')),
  progresso_atual int NOT NULL DEFAULT 0,
  progresso_total int NOT NULL DEFAULT 0,
  fotos_processadas int NOT NULL DEFAULT 0,
  mensagem_erro text,
  pdf_path text,
  chunks_path text,
  solicitado_por uuid NOT NULL,
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_relatorio_jobs_status ON public.vistoria_relatorio_jobs(status, solicitado_em);
CREATE INDEX idx_relatorio_jobs_bairro ON public.vistoria_relatorio_jobs(bairro_id, solicitado_em DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vistoria_relatorio_jobs TO authenticated;
GRANT ALL ON public.vistoria_relatorio_jobs TO service_role;

ALTER TABLE public.vistoria_relatorio_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_select_priv" ON public.vistoria_relatorio_jobs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

CREATE POLICY "jobs_insert_priv" ON public.vistoria_relatorio_jobs
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

CREATE POLICY "jobs_update_priv" ON public.vistoria_relatorio_jobs
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON public.vistoria_relatorio_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();