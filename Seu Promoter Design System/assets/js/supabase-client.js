// Mesmo config do painel admin — apenas leitura pública (anon key)
const SUPABASE_URL  = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
