ALTER TABLE public.formularios
  ADD COLUMN IF NOT EXISTS no_menu boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS menu_icone text,
  ADD COLUMN IF NOT EXISTS menu_ordem integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_formularios_no_menu ON public.formularios(no_menu) WHERE no_menu = true;