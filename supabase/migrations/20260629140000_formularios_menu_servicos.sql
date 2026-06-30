-- Menu de serviços: marca formulários que aparecem na tela de seleção de serviço (/servicos).
--   no_menu     -> aparece no menu de serviços
--   menu_ordem  -> ordem de exibição no menu
--   menu_icone  -> emoji/ícone opcional exibido no card

ALTER TABLE public.formularios
  ADD COLUMN IF NOT EXISTS no_menu boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS menu_ordem integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS menu_icone text;
