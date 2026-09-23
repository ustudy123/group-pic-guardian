CREATE POLICY "fotos_obras_insert_anon_formularios"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'fotos-obras' AND (storage.foldername(name))[1] = 'formularios');