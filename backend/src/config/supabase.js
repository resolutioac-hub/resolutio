require('dotenv').config();
let supabase = null;

try {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && url.startsWith('http')) {
    supabase = createClient(url, key);
    console.log('[Supabase] Cliente configurado:', url);
  } else {
    console.log('[Supabase] Variáveis não configuradas — usando mock em memória. Configure .env para ativar.');
  }
} catch (e) {
  console.warn('[Supabase] @supabase/supabase-js não instalado ou erro:', e.message);
}

module.exports = supabase;
