-- ============================================================
-- Painel Visão Qualidade (reunião 25/06):
-- aprovar/reprovar fotos com motivo pré-cadastrado (dropdown)
-- ============================================================
-- Obs.: a lógica condicional dos formulários já existe
-- (migration 20260629120000_formulario_campos_condicao.sql).

-- 1) Motivos de reprovação pré-cadastrados (lista gerenciável pela equipe).
-- Desativar em vez de excluir preserva a estatística histórica.
CREATE TABLE IF NOT EXISTS public.motivos_reprovacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motivos_reprovacao TO authenticated;
GRANT ALL ON public.motivos_reprovacao TO service_role;
ALTER TABLE public.motivos_reprovacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logados leem motivos" ON public.motivos_reprovacao FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "admin/analista gerenciam motivos" ON public.motivos_reprovacao FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'));
CREATE TRIGGER trg_motivos_reprovacao_updated BEFORE UPDATE ON public.motivos_reprovacao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Semente combinada na reunião (Isabella completa a lista depois pela tela)
INSERT INTO public.motivos_reprovacao (nome, ordem)
VALUES
  ('Erro de classificação', 1),
  ('Colaborador sem EPI', 2),
  ('Organização / limpeza da frente de trabalho', 3);

-- 2) Avaliação humana das fotos (aprovar/reprovar) — 1 avaliação por foto.
-- Reprovação exige motivo (dropdown). "notificado" fica reservado para a Fase 2
-- (aviso ao encarregado no painel dele + resumo via WhatsApp).
CREATE TABLE IF NOT EXISTS public.foto_avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foto_id uuid NOT NULL UNIQUE REFERENCES public.fotos(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('aprovada','reprovada')),
  motivo_id uuid REFERENCES public.motivos_reprovacao(id) ON DELETE RESTRICT,
  observacao text,
  avaliado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  avaliado_em timestamptz NOT NULL DEFAULT now(),
  notificado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reprovada_tem_motivo CHECK (status <> 'reprovada' OR motivo_id IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foto_avaliacoes TO authenticated;
GRANT ALL ON public.foto_avaliacoes TO service_role;
ALTER TABLE public.foto_avaliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logados leem avaliacoes" ON public.foto_avaliacoes FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "admin/analista avaliam fotos" ON public.foto_avaliacoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'));
CREATE TRIGGER trg_foto_avaliacoes_updated BEFORE UPDATE ON public.foto_avaliacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_foto_avaliacoes_status ON public.foto_avaliacoes(status, avaliado_em DESC);

-- 3) O login da equipe de qualidade precisa do papel 'analista'
-- (convenção do app: papel Qualidade = analista) para poder avaliar
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'analista'::public.app_role
FROM auth.users u
WHERE u.email = 'producao.qualidade@macroambiental.eng.br'
ON CONFLICT (user_id, role) DO NOTHING;
