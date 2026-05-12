DROP POLICY IF EXISTS "grupos_update_authenticated" ON public.grupos;
CREATE POLICY "grupos_update_authenticated" ON public.grupos FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;