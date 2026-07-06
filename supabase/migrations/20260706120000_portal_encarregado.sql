-- ============================================================
-- FASE 2 (reunião 25/06): portal do encarregado
--   - login individual do encarregado (encarregados.user_id)
--   - acesso restrito por formulário (formulario_acessos)
--   - fotos de formulário nas pastas do encarregado (fotos.formulario_id)
--   - correção de foto reprovada (foto_avaliacoes.correcao_foto_id)
-- ============================================================

-- 1) Vínculo encarregado ↔ login (sem papel novo: "é encarregado" =
-- existe registro em encarregados com user_id = auth.uid())
ALTER TABLE public.encarregados
  ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) Fotos enviadas via formulário: mesma pasta do encarregado, tagueadas
-- pelo formulário de origem (filtráveis). status='formulario' NÃO dispara
-- a análise de IA (o trigger só enfileira status='processada').
ALTER TABLE public.fotos
  ADD COLUMN IF NOT EXISTS formulario_id uuid REFERENCES public.formularios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fotos_formulario
  ON public.fotos(formulario_id) WHERE formulario_id IS NOT NULL;

-- 3) Correção de foto reprovada: o encarregado envia uma nova foto que
-- substitui a reprovada; a qualidade reavalia a nova (que nasce pendente).
ALTER TABLE public.foto_avaliacoes
  ADD COLUMN IF NOT EXISTS correcao_foto_id uuid REFERENCES public.fotos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS corrigida_em timestamptz;

-- O encarregado pode marcar a própria avaliação como corrigida
DROP POLICY IF EXISTS "encarregado corrige propria foto" ON public.foto_avaliacoes;
CREATE POLICY "encarregado corrige propria foto" ON public.foto_avaliacoes
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fotos f
    JOIN public.encarregados e ON e.id = f.encarregado_id
    WHERE f.id = foto_avaliacoes.foto_id AND e.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fotos f
    JOIN public.encarregados e ON e.id = f.encarregado_id
    WHERE f.id = foto_avaliacoes.foto_id AND e.user_id = auth.uid()
  ));

-- 4) Acesso restrito por formulário: se um formulário tiver linhas aqui,
-- só os logins listados o veem no portal; sem linhas = liberado a todos
-- os encarregados com login.
CREATE TABLE IF NOT EXISTS public.formulario_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario_id uuid NOT NULL REFERENCES public.formularios(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (formulario_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formulario_acessos TO authenticated;
GRANT ALL ON public.formulario_acessos TO service_role;
ALTER TABLE public.formulario_acessos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin/analista gerenciam acessos" ON public.formulario_acessos;
CREATE POLICY "admin/analista gerenciam acessos" ON public.formulario_acessos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'));
-- Logados leem os acessos de formulários publicados (necessário para o menu
-- do portal saber se um formulário é restrito e a quem)
DROP POLICY IF EXISTS "usuario ve proprios acessos" ON public.formulario_acessos;
DROP POLICY IF EXISTS "logados leem acessos de publicados" ON public.formulario_acessos;
CREATE POLICY "logados leem acessos de publicados" ON public.formulario_acessos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.formularios f
    WHERE f.id = formulario_acessos.formulario_id AND f.status = 'publicado'
  ));
