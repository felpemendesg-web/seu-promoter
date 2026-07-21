import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'not_authenticated' }, 401);
    }

    // Client scoped to the caller — respects RLS, used only to identify who is calling.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: 'not_authenticated' }, 401);
    }

    const { data: callerMember, error: callerError } = await callerClient
      .from('panel_members')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (callerError || !callerMember || callerMember.role !== 'admin') {
      return json({ error: 'forbidden' }, 403);
    }

    const body = await req.json().catch(() => null);
    const name = (body?.name ?? '').toString().trim();
    const email = (body?.email ?? '').toString().trim();
    const password = (body?.password ?? '').toString();

    if (!name) return json({ error: 'name_required' }, 400);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'invalid_email' }, 400);
    if (!password || password.length < 6) return json({ error: 'weak_password' }, 400);

    // Client com service_role — cria o usuário já confirmado (sem depender de
    // e-mail de confirmação) e insere o membro do painel, ignorando RLS.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      const msg = createError.message?.toLowerCase() ?? '';
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
        return json({ error: 'email_in_use' }, 409);
      }
      return json({ error: 'create_user_failed', message: createError.message }, 400);
    }

    const newUserId = created.user?.id;
    if (!newUserId) {
      return json({ error: 'create_user_failed', message: 'Usuário não retornado.' }, 500);
    }

    const { error: insertError } = await adminClient.from('panel_members').insert({
      id: newUserId,
      name,
      email,
      role: 'admin',
    });

    if (insertError) {
      // Reverte a criação do usuário de auth para não deixar conta órfã sem membro do painel.
      await adminClient.auth.admin.deleteUser(newUserId);
      return json({ error: 'insert_member_failed', message: insertError.message }, 500);
    }

    return json({ success: true, id: newUserId }, 200);
  } catch (err) {
    return json({ error: 'unexpected_error', message: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
