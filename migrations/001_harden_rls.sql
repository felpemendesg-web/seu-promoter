-- ═══════════════════════════════════════════════════════════════
--  Seu Promoter — Hardening de RLS para produção
--  Idempotente. Mexe APENAS em policies e funções — nenhuma tabela.
--  Ordem: helpers → RPCs → troca de policies.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Funções auxiliares (SECURITY DEFINER evita recursão de RLS) ──
create or replace function public.is_panel_member()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select exists(select 1 from public.panel_members where id = auth.uid()); $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select exists(select 1 from public.panel_members where id = auth.uid() and role = 'admin'); $$;

revoke all on function public.is_panel_member() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_panel_member() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ── 2. RPCs (SECURITY DEFINER) — o cliente nunca insere em panel_members direto ──

-- Valida um token de convite sem expor a tabela (retorna só boolean).
create or replace function public.validate_invite(p_token uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select exists(select 1 from public.invites where token = p_token and used = false); $$;

revoke all on function public.validate_invite(uuid) from public;
grant execute on function public.validate_invite(uuid) to anon, authenticated;

-- Redime um convite: cria o membro do painel para o usuário logado e marca o convite como usado.
create or replace function public.redeem_invite(p_token uuid, p_name text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_invite public.invites%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_invite from public.invites
    where token = p_token and used = false
    for update;
  if not found then raise exception 'invalid_or_used_invite'; end if;

  if exists (select 1 from public.panel_members where id = auth.uid()) then
    raise exception 'already_member';
  end if;

  insert into public.panel_members (id, name, email, role)
  values (
    auth.uid(),
    coalesce(nullif(trim(p_name), ''), 'Membro'),
    coalesce((select email from auth.users where id = auth.uid()), ''),
    case when v_invite.role in ('admin','editor') then v_invite.role else 'editor' end
  );

  update public.invites set used = true where id = v_invite.id;
end; $$;

revoke all on function public.redeem_invite(uuid, text) from public;
grant execute on function public.redeem_invite(uuid, text) to authenticated;

-- Cria o primeiro admin, apenas se nenhum membro existir ainda (bootstrap).
create or replace function public.claim_first_admin(p_name text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  lock table public.panel_members in exclusive mode;
  if exists (select 1 from public.panel_members) then
    raise exception 'admin_already_exists';
  end if;

  insert into public.panel_members (id, name, email, role)
  values (
    auth.uid(),
    coalesce(nullif(trim(p_name), ''), 'Admin'),
    coalesce((select email from auth.users where id = auth.uid()), ''),
    'admin'
  );
end; $$;

revoke all on function public.claim_first_admin(text) from public;
grant execute on function public.claim_first_admin(text) to authenticated;

-- ── 3. Troca de policies ──
-- Dropa TODAS as policies atuais de cada tabela (sobrevive a drift de nomes) e recria.

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where (schemaname = 'public' and tablename in ('categories','events','banners','panel_members','invites'))
       or (schemaname = 'storage' and tablename = 'objects'
           and policyname in ('img_public_read','img_auth_insert','img_auth_update','img_auth_delete'))
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Garante RLS ligado (idempotente)
alter table public.categories   enable row level security;
alter table public.events        enable row level security;
alter table public.banners       enable row level security;
alter table public.panel_members enable row level security;
alter table public.invites       enable row level security;

-- Categories: leitura pública, escrita só para membros do painel
create policy "cat_read"   on public.categories for select using (true);
create policy "cat_insert" on public.categories for insert with check (public.is_panel_member());
create policy "cat_update" on public.categories for update using (public.is_panel_member()) with check (public.is_panel_member());
create policy "cat_delete" on public.categories for delete using (public.is_panel_member());

-- Events
create policy "ev_read"   on public.events for select using (true);
create policy "ev_insert" on public.events for insert with check (public.is_panel_member());
create policy "ev_update" on public.events for update using (public.is_panel_member()) with check (public.is_panel_member());
create policy "ev_delete" on public.events for delete using (public.is_panel_member());

-- Banners
create policy "ban_read"   on public.banners for select using (true);
create policy "ban_insert" on public.banners for insert with check (public.is_panel_member());
create policy "ban_update" on public.banners for update using (public.is_panel_member()) with check (public.is_panel_member());
create policy "ban_delete" on public.banners for delete using (public.is_panel_member());

-- Panel Members: cada um lê a si mesmo; admin lê/gerencia todos; INSERT só via RPC (sem policy)
create policy "mem_read"   on public.panel_members for select using (id = auth.uid() or public.is_admin());
create policy "mem_update" on public.panel_members for update using (public.is_admin()) with check (public.is_admin());
create policy "mem_delete" on public.panel_members for delete using (public.is_admin() and id <> auth.uid());

-- Invites: só admin cria/lê/apaga; 'used' só muda dentro de redeem_invite (sem policy de update)
create policy "inv_insert" on public.invites for insert with check (public.is_admin());
create policy "inv_read"   on public.invites for select using (public.is_admin());
create policy "inv_delete" on public.invites for delete using (public.is_admin());

-- Storage (bucket 'images'): leitura pública, escrita só para membros do painel
create policy "img_public_read" on storage.objects
  for select using (bucket_id = 'images');
create policy "img_auth_insert" on storage.objects
  for insert with check (bucket_id = 'images' and public.is_panel_member());
create policy "img_auth_update" on storage.objects
  for update using (bucket_id = 'images' and public.is_panel_member()) with check (bucket_id = 'images' and public.is_panel_member());
create policy "img_auth_delete" on storage.objects
  for delete using (bucket_id = 'images' and public.is_panel_member());
