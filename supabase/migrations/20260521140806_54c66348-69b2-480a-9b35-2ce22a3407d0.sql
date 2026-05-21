INSERT INTO public.user_roles (user_id, role) VALUES
  ('2d37054e-2908-42a9-8b2e-0567d25e4cfc', 'admin'),
  ('002d053c-d7a4-4485-8d43-faf5bfefef57', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;