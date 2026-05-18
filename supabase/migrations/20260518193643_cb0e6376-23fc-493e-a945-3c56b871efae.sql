
DO $$
DECLARE
  new_id uuid;
  pwd_hash text;
  u_email text := 'medicoes@macroambiental.eng.br';
  u_name text := 'Medições';
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = u_email) THEN
    RETURN;
  END IF;

  new_id := gen_random_uuid();
  pwd_hash := crypt('macro@', gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_id, 'authenticated', 'authenticated', u_email, pwd_hash,
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', u_name),
    false, '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_id,
    jsonb_build_object('sub', new_id::text, 'email', u_email, 'email_verified', true),
    'email', new_id::text,
    now(), now(), now()
  );
END $$;
