
-- Pastas para organizar formulários
CREATE TABLE public.form_pastas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cor text DEFAULT '#3b82f6',
  ordem integer NOT NULL DEFAULT 0,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_pastas TO authenticated;
GRANT ALL ON public.form_pastas TO service_role;
ALTER TABLE public.form_pastas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin/analista gerenciam pastas" ON public.form_pastas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'));
CREATE TRIGGER trg_form_pastas_updated BEFORE UPDATE ON public.form_pastas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Formulários
CREATE TABLE public.formularios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pasta_id uuid REFERENCES public.form_pastas(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  descricao text,
  cor text DEFAULT '#3b82f6',
  icone text,
  status text NOT NULL DEFAULT 'rascunho', -- rascunho | publicado | arquivado
  publico boolean NOT NULL DEFAULT false,  -- aceita respostas via link público
  permite_multiplas boolean NOT NULL DEFAULT true,
  modelo boolean NOT NULL DEFAULT false,   -- é um modelo/template
  share_slug text UNIQUE,                  -- slug do link público
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formularios TO authenticated;
GRANT SELECT ON public.formularios TO anon;
GRANT ALL ON public.formularios TO service_role;
ALTER TABLE public.formularios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin/analista gerenciam formularios" ON public.formularios FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'));
CREATE POLICY "logados leem formularios publicados" ON public.formularios FOR SELECT TO authenticated
  USING (status = 'publicado');
CREATE POLICY "anon le formularios publicos publicados" ON public.formularios FOR SELECT TO anon
  USING (status = 'publicado' AND publico = true);
CREATE TRIGGER trg_formularios_updated BEFORE UPDATE ON public.formularios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_formularios_pasta ON public.formularios(pasta_id);

-- Campos
CREATE TABLE public.formulario_campos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario_id uuid NOT NULL REFERENCES public.formularios(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  tipo text NOT NULL, -- texto_curto | texto_longo | numero | data | hora | datahora | escolha_unica | escolha_multipla | dropdown | arquivo | foto | secao
  rotulo text NOT NULL,
  descricao text,
  placeholder text,
  obrigatorio boolean NOT NULL DEFAULT false,
  opcoes jsonb NOT NULL DEFAULT '[]'::jsonb,   -- para escolha/dropdown
  config jsonb NOT NULL DEFAULT '{}'::jsonb,   -- min/max, accept, múltiplo etc.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formulario_campos TO authenticated;
GRANT SELECT ON public.formulario_campos TO anon;
GRANT ALL ON public.formulario_campos TO service_role;
ALTER TABLE public.formulario_campos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin/analista gerenciam campos" ON public.formulario_campos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'));
CREATE POLICY "logados leem campos de formularios publicados" ON public.formulario_campos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.formularios f WHERE f.id = formulario_id AND f.status = 'publicado'));
CREATE POLICY "anon le campos de formularios publicos" ON public.formulario_campos FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.formularios f WHERE f.id = formulario_id AND f.status = 'publicado' AND f.publico = true));
CREATE INDEX idx_form_campos_form ON public.formulario_campos(formulario_id, ordem);

-- Respostas (cabeçalho)
CREATE TABLE public.formulario_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario_id uuid NOT NULL REFERENCES public.formularios(id) ON DELETE CASCADE,
  respondente_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  respondente_nome text,
  respondente_email text,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { campo_id: valor }
  arquivos jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ campo_id, path, nome, tipo, tamanho }]
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formulario_respostas TO authenticated;
GRANT INSERT ON public.formulario_respostas TO anon;
GRANT ALL ON public.formulario_respostas TO service_role;
ALTER TABLE public.formulario_respostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin/analista veem respostas" ON public.formulario_respostas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'));
CREATE POLICY "admin/analista gerenciam respostas" ON public.formulario_respostas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'analista'));
CREATE POLICY "logados respondem formularios publicados" ON public.formulario_respostas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.formularios f WHERE f.id = formulario_id AND f.status='publicado'));
CREATE POLICY "anon responde formularios publicos publicados" ON public.formulario_respostas FOR INSERT TO anon
  WITH CHECK (EXISTS (SELECT 1 FROM public.formularios f WHERE f.id = formulario_id AND f.status='publicado' AND f.publico=true));
CREATE INDEX idx_form_resp_form ON public.formulario_respostas(formulario_id, created_at DESC);
