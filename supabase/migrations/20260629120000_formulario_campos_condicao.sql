-- Lógica condicional nos formulários: cada campo pode ter uma condição de exibição.
-- Estrutura do JSON (quando preenchido):
--   { "campo_id": "<id do campo de origem>", "operador": "igual" | "diferente", "valor": "<opção>" }
-- Quando NULL, o campo é sempre exibido.

ALTER TABLE public.formulario_campos
  ADD COLUMN IF NOT EXISTS condicao jsonb;
