
DO $$
DECLARE
  u RECORD;
  new_id uuid;
  pwd_hash text;
BEGIN
  FOR u IN
    SELECT * FROM (VALUES
      ('rmq.qualidade@macroambiental.eng.br', 'RMQ'),
      ('rfo.qualidade@macroambiental.eng.br', 'AEO'),
      ('ligacao.qualidade@macroambiental.eng.br', 'Ligações'),
      ('isabella.moraes@macroambiental.eng.br', 'Isabella'),
      ('victoria.neves@macroambiental.eng.br', 'Victoria'),
      ('mel.sa@macroambiental.eng.br', 'Mel'),
      ('arthur.freitas@macroambiental.eng.br', 'Arthur')
    ) AS t(email, display_name)
  LOOP
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = u.email) THEN
      CONTINUE;
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
      new_id, 'authenticated', 'authenticated', u.email, pwd_hash,
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', u.display_name),
      false, '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), new_id,
      jsonb_build_object('sub', new_id::text, 'email', u.email, 'email_verified', true),
      'email', new_id::text,
      now(), now(), now()
    );
  END LOOP;
END $$;
