
-- Allow authenticated users to insert and delete photos
CREATE POLICY "auth_insert_fotos" ON public.fotos
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_delete_fotos" ON public.fotos
  FOR DELETE TO authenticated
  USING (true);

CREATE POLICY "auth_update_fotos" ON public.fotos
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Storage policies for fotos-obras bucket
CREATE POLICY "fotos_obras_select_authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'fotos-obras');

CREATE POLICY "fotos_obras_insert_authenticated" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fotos-obras');

CREATE POLICY "fotos_obras_delete_authenticated" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'fotos-obras');
