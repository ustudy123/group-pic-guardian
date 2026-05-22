
-- ============ TABELAS ============

CREATE TABLE public.contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL,
  descricao text,
  regional text,
  municipio text,
  responsavel_tecnico text,
  periodo text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bairros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  mapa_url text,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bairros_contrato ON public.bairros(contrato_id);

CREATE TABLE public.ruas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bairro_id uuid NOT NULL REFERENCES public.bairros(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ruas_bairro ON public.ruas(bairro_id);

CREATE TABLE public.vistoria_atribuicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rua_id uuid NOT NULL REFERENCES public.ruas(id) ON DELETE CASCADE,
  vistoriante_id uuid NOT NULL,
  fase text NOT NULL CHECK (fase IN ('pre','pos','ambas')) DEFAULT 'ambas',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rua_id, vistoriante_id)
);
CREATE INDEX idx_atribuicoes_vistoriante ON public.vistoria_atribuicoes(vistoriante_id);
CREATE INDEX idx_atribuicoes_rua ON public.vistoria_atribuicoes(rua_id);

CREATE TABLE public.vistoria_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rua_id uuid NOT NULL REFERENCES public.ruas(id) ON DELETE CASCADE,
  fase text NOT NULL CHECK (fase IN ('pre','pos')),
  tipo text NOT NULL CHECK (tipo IN ('rua','casa')),
  numero_casa text,
  lado text CHECK (lado IN ('E','D')),
  latitude numeric,
  longitude numeric,
  endereco_formatado text,
  captured_at timestamptz NOT NULL,
  storage_path_original text NOT NULL,
  storage_path_carimbada text NOT NULL,
  exif jsonb NOT NULL DEFAULT '{}'::jsonb,
  par_pre_id uuid REFERENCES public.vistoria_fotos(id) ON DELETE SET NULL,
  similaridade_angulo numeric,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','rejeitada')),
  observacao text,
  enviado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fotos_rua ON public.vistoria_fotos(rua_id);
CREATE INDEX idx_fotos_par ON public.vistoria_fotos(par_pre_id);
CREATE INDEX idx_fotos_enviado_por ON public.vistoria_fotos(enviado_por);

CREATE TABLE public.vistoria_relatorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  bairro_id uuid REFERENCES public.bairros(id) ON DELETE CASCADE,
  pdf_path text NOT NULL,
  revisao text NOT NULL DEFAULT '02',
  gerado_por uuid NOT NULL,
  gerado_em timestamptz NOT NULL DEFAULT now()
);

-- ============ TRIGGERS updated_at ============
CREATE TRIGGER trg_contratos_updated BEFORE UPDATE ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_bairros_updated BEFORE UPDATE ON public.bairros
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ruas_updated BEFORE UPDATE ON public.ruas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_fotos_updated BEFORE UPDATE ON public.vistoria_fotos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ HELPER: vistoriante tem acesso à rua? ============
CREATE OR REPLACE FUNCTION public.vistoriante_tem_rua(_user uuid, _rua uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vistoria_atribuicoes
    WHERE rua_id = _rua AND vistoriante_id = _user
  );
$$;

-- ============ RLS ============
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bairros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ruas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistoria_atribuicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistoria_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistoria_relatorios ENABLE ROW LEVEL SECURITY;

-- Contratos / bairros / ruas: leitura para todo autenticado, escrita só admin
CREATE POLICY contratos_select ON public.contratos FOR SELECT TO authenticated USING (true);
CREATE POLICY contratos_admin_all ON public.contratos FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY bairros_select ON public.bairros FOR SELECT TO authenticated USING (true);
CREATE POLICY bairros_admin_all ON public.bairros FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY ruas_select ON public.ruas FOR SELECT TO authenticated USING (true);
CREATE POLICY ruas_admin_all ON public.ruas FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Atribuições: vistoriante vê as suas; admin gerencia
CREATE POLICY atribuicoes_select_self_or_admin ON public.vistoria_atribuicoes FOR SELECT TO authenticated
  USING (vistoriante_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'analista'));
CREATE POLICY atribuicoes_admin_all ON public.vistoria_atribuicoes FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Fotos: vistoriante insere/lê das suas ruas; analista/admin tudo
CREATE POLICY fotos_select ON public.vistoria_fotos FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin')
    OR has_role(auth.uid(),'analista')
    OR public.vistoriante_tem_rua(auth.uid(), rua_id)
  );
CREATE POLICY fotos_insert_vistoriante ON public.vistoria_fotos FOR INSERT TO authenticated
  WITH CHECK (
    enviado_por = auth.uid() AND (
      has_role(auth.uid(),'admin')
      OR public.vistoriante_tem_rua(auth.uid(), rua_id)
    )
  );
CREATE POLICY fotos_update_analista ON public.vistoria_fotos FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'analista'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'analista'));
CREATE POLICY fotos_delete_admin ON public.vistoria_fotos FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

-- Relatórios: leitura autenticado, escrita analista/admin
CREATE POLICY relatorios_select ON public.vistoria_relatorios FOR SELECT TO authenticated USING (true);
CREATE POLICY relatorios_write ON public.vistoria_relatorios FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'analista'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'analista'));

-- ============ STORAGE BUCKET ============
INSERT INTO storage.buckets (id, name, public) VALUES ('vistorias-fotos','vistorias-fotos', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "vistorias_fotos_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vistorias-fotos');
CREATE POLICY "vistorias_fotos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vistorias-fotos');
CREATE POLICY "vistorias_fotos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vistorias-fotos' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'analista')));
CREATE POLICY "vistorias_fotos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vistorias-fotos' AND has_role(auth.uid(),'admin'));
