-- Corrige os meses que "sumiram" na tela do encarregado.
--
-- Causa: a tela baixava as fotos linha a linha só pra contar quantas tem por dia.
-- O PostgREST corta a resposta em 1000 linhas (o .limit(5000) do client não muda isso),
-- e como as 1000 fotos mais recentes já cabiam todas no mês atual, os meses anteriores
-- nunca chegavam ao navegador. As fotos NUNCA foram perdidas — continuam no banco.
--
-- Correção: esta função devolve a contagem já agregada por dia (poucas linhas),
-- então não importa o volume de fotos.

CREATE INDEX IF NOT EXISTS idx_fotos_encarregado_data_pasta
  ON public.fotos(encarregado_id, data_pasta);

-- Nomes de saída propositalmente diferentes das colunas da tabela (dia_pasta/total),
-- para não conflitar com f.data_pasta dentro do corpo da função.
CREATE OR REPLACE FUNCTION public.fotos_dias_por_encarregado(_encarregado_id uuid)
RETURNS TABLE (dia_pasta text, total bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT f.data_pasta, count(*)::bigint
  FROM public.fotos f
  WHERE f.encarregado_id = _encarregado_id
    AND f.data_pasta IS NOT NULL
  GROUP BY f.data_pasta
  ORDER BY f.data_pasta DESC;
$$;
