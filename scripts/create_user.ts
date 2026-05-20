import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://pqjismpelxvrvamqcejz.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY não encontrado");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data, error } = await admin.auth.admin.createUser({
    email: 'producao.qualidade@macroambiental.eng.br',
    password: 'macro@',
    email_confirm: true,
  });

  if (error) {
    console.error('Erro:', error.message);
    process.exit(1);
  }

  console.log('Usuário criado com sucesso:', data.user?.email, 'ID:', data.user?.id);
}

main();
