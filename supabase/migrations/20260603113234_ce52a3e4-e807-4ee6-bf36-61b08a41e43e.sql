
-- 1) Foreign key entre foto_analises.foto_id e fotos.id (necessário para o embedding do PostgREST)
ALTER TABLE public.foto_analises
  ADD CONSTRAINT foto_analises_foto_id_fkey
  FOREIGN KEY (foto_id) REFERENCES public.fotos(id) ON DELETE CASCADE;

-- 2) Coluna RFO (entra no relatório fotográfico)
ALTER TABLE public.foto_analises
  ADD COLUMN IF NOT EXISTS rfo boolean NOT NULL DEFAULT false;

-- 3) Reseta a fila pendente para reanálise com o novo prompt
UPDATE public.foto_analise_jobs
  SET status = 'pendente', tentativas = 0, erro = NULL
  WHERE status IN ('pendente','erro','processando');
