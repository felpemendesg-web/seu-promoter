// Mesmo config do painel admin — apenas leitura pública (anon key)
const SUPABASE_URL  = 'https://ygbmjiosphwkwbvmgorm.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnYm1qaW9zcGh3a3didm1nb3JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMTU1MzMsImV4cCI6MjA5ODU5MTUzM30.MWlbSeKa-pL4goeKmTzrANRMva6-GydkNPAyhjfHPI8';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
