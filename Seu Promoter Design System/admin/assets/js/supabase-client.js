// ──────────────────────────────────────────────────────────
//  Supabase Config
//  1. Crie um projeto em https://supabase.com
//  2. Vá em Project Settings → API e copie a URL e a anon key
//  3. Cole os valores abaixo
// ──────────────────────────────────────────────────────────
const SUPABASE_URL  = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
