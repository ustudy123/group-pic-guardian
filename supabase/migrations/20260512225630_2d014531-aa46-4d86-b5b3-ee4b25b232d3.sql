-- Profiles for panel users
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grupos
CREATE TABLE public.grupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_jid TEXT NOT NULL UNIQUE,
  nome_exibicao TEXT NOT NULL,
  encarregado TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ultima_foto_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grupos_select_authenticated" ON public.grupos FOR SELECT TO authenticated USING (true);
CREATE POLICY "grupos_update_authenticated" ON public.grupos FOR UPDATE TO authenticated USING (true);
-- INSERT/DELETE só via service role (bypass RLS)

CREATE INDEX idx_grupos_encarregado ON public.grupos(encarregado);

-- Fotos
CREATE TABLE public.fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
  encarregado TEXT NOT NULL,
  whatsapp_msg_id TEXT NOT NULL UNIQUE,
  remetente_jid TEXT,
  remetente_nome TEXT,
  caption TEXT,
  mime_type TEXT NOT NULL,
  tamanho_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  data_envio TIMESTAMPTZ NOT NULL,
  ano_mes TEXT NOT NULL,
  dia TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fotos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fotos_select_authenticated" ON public.fotos FOR SELECT TO authenticated USING (true);
-- INSERT só via service role

CREATE INDEX idx_fotos_encarregado_anomes_dia ON public.fotos(encarregado, ano_mes, dia);
CREATE INDEX idx_fotos_grupo_data ON public.fotos(grupo_id, data_envio DESC);
CREATE INDEX idx_fotos_data_envio ON public.fotos(data_envio DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER update_grupos_updated_at BEFORE UPDATE ON public.grupos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket privado
INSERT INTO storage.buckets (id, name, public) VALUES ('obras-fotos', 'obras-fotos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage: leitura via URL assinada (gerada no servidor com service role); usuários autenticados podem ler diretamente também
CREATE POLICY "obras_fotos_select_authenticated" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'obras-fotos');