-- Permitir vistoriantes criarem bairros e ruas (cadastro em campo)
CREATE POLICY "bairros_insert_auth"
ON public.bairros
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "ruas_insert_auth"
ON public.ruas
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Permitir que qualquer autenticado crie sua própria atribuição (para auto-atribuir ao criar rua)
CREATE POLICY "atribuicoes_insert_self"
ON public.vistoria_atribuicoes
FOR INSERT
TO authenticated
WITH CHECK (vistoriante_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));