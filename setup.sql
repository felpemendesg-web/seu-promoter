-- ═══════════════════════════════════════════════════════
--  Seu Promoter — Setup do Banco de Dados Supabase
--  Execute este SQL no SQL Editor do seu projeto Supabase
-- ═══════════════════════════════════════════════════════

-- 1. Categorias
create table if not exists public.categories (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text unique not null,
  icon            text default 'calendar',
  active          boolean default true,
  created_at      timestamptz default now(),
  show_in_explore boolean default true,  -- aparece no carrossel "Explorar por Gênero" da home
  show_in_menu    boolean default false  -- aparece no menu de navegação do site
);

-- 2. Eventos
create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  subtitle        text,
  date            date,
  time            text,
  location        text,
  image_url       text,
  ticket_url      text,
  about_html      text,          -- descrição completa (HTML livre, sanitizado no site com DOMPurify)
  attractions     jsonb default '[]'::jsonb,      -- [{name, icon}]
  important_info  jsonb default '[]'::jsonb,      -- [texto, texto, ...]
  venue_name      text,
  venue_address   text,
  maps_url        text,
  map_image_url   text,
  featured        boolean default false,
  active          boolean default true,
  created_at      timestamptz default now()
);

-- 2b. Categorias do evento (muitos-para-muitos — um evento pode ter várias)
create table if not exists public.event_categories (
  event_id    uuid not null references public.events(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (event_id, category_id)
);

-- 3. Banners
create table if not exists public.banners (
  id                 uuid primary key default gen_random_uuid(),
  title              text,
  desktop_image_url  text not null,
  mobile_image_url   text not null,
  link               text,
  order_index        int default 0,
  active             boolean default true,
  created_at         timestamptz default now()
);

-- 4. Membros do Painel
-- Único cargo existente é 'admin' (modelo simplificado — sem 'editor').
create table if not exists public.panel_members (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  email      text not null,
  role       text default 'admin' check (role = 'admin'),
  created_at timestamptz default now()
);

-- 5. Convites (LEGADO — não usado pela UI atual)
-- O fluxo de convite por link foi substituído pela Edge Function
-- `create-admin-member`, que cria a conta (email+senha) e o membro do
-- painel em uma única chamada, sem depender de e-mail de confirmação.
-- Tabela/RPCs mantidas apenas por segurança histórica (RLS já restringe
-- a admin); não recebem novos convites.
create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  role       text default 'editor',
  token      uuid default gen_random_uuid() unique not null,
  used       boolean default false,
  created_by uuid references public.panel_members(id) on delete set null,
  created_at timestamptz default now()
);

-- ── Funções auxiliares (SECURITY DEFINER evita recursão de RLS) ──
create or replace function public.is_panel_member()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select exists(select 1 from public.panel_members where id = auth.uid()); $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select exists(select 1 from public.panel_members where id = auth.uid() and role = 'admin'); $$;

-- Checa se já existe algum admin, sem expor dados (só boolean).
create or replace function public.panel_members_exist()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select exists(select 1 from public.panel_members); $$;

revoke all on function public.is_panel_member() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_panel_member()   to anon, authenticated;
grant execute on function public.is_admin()          to anon, authenticated;
grant execute on function public.panel_members_exist() to anon, authenticated;

-- ── RPCs de convite / bootstrap (o cliente nunca insere em panel_members) ──
create or replace function public.validate_invite(p_token uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select exists(select 1 from public.invites where token = p_token and used = false); $$;

revoke all on function public.validate_invite(uuid) from public;
grant execute on function public.validate_invite(uuid) to anon, authenticated;

create or replace function public.redeem_invite(p_token uuid, p_name text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_invite public.invites%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_invite from public.invites where token = p_token and used = false for update;
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

create or replace function public.claim_first_admin(p_name text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  lock table public.panel_members in exclusive mode;
  if exists (select 1 from public.panel_members) then raise exception 'admin_already_exists'; end if;
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

-- ── Row Level Security ───────────────────────────────────
alter table public.categories       enable row level security;
alter table public.events            enable row level security;
alter table public.event_categories  enable row level security;
alter table public.banners           enable row level security;
alter table public.panel_members     enable row level security;
alter table public.invites           enable row level security;

-- Categories: leitura pública, escrita só para membros do painel
create policy "cat_read"   on public.categories for select using (true);
create policy "cat_insert" on public.categories for insert with check (public.is_panel_member());
create policy "cat_update" on public.categories for update using (public.is_panel_member()) with check (public.is_panel_member());
create policy "cat_delete" on public.categories for delete using (public.is_panel_member());

-- Events: leitura pública, escrita só para membros do painel
create policy "ev_read"   on public.events for select using (true);
create policy "ev_insert" on public.events for insert with check (public.is_panel_member());
create policy "ev_update" on public.events for update using (public.is_panel_member()) with check (public.is_panel_member());
create policy "ev_delete" on public.events for delete using (public.is_panel_member());

-- Event <-> Categorias: leitura pública, escrita só para membros do painel.
-- Sem policy de update — o cliente sempre apaga e reinsere os vínculos ao salvar um evento.
create policy "evcat_read"   on public.event_categories for select using (true);
create policy "evcat_insert" on public.event_categories for insert with check (public.is_panel_member());
create policy "evcat_delete" on public.event_categories for delete using (public.is_panel_member());

-- Banners: leitura pública, escrita só para membros do painel
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

-- ── Storage Bucket ───────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

-- Bucket é público: URLs são servidas direto, sem policy de SELECT.
-- (Não criamos SELECT policy para não permitir listagem do bucket via API.)

create policy "img_auth_insert" on storage.objects
  for insert with check (bucket_id = 'images' and public.is_panel_member());

create policy "img_auth_update" on storage.objects
  for update using (bucket_id = 'images' and public.is_panel_member()) with check (bucket_id = 'images' and public.is_panel_member());

create policy "img_auth_delete" on storage.objects
  for delete using (bucket_id = 'images' and public.is_panel_member());

-- ════════════════════════════════════════════════════════
--  Pronto! Após executar este SQL:
--  1. Copie a URL e a anon key do projeto Supabase
--  2. Cole em: admin/assets/js/supabase-client.js
--  3. E em:    assets/js/supabase-client.js
--  4. Faça o deploy da Edge Function supabase/functions/create-admin-member
--  5. Acesse /admin e faça o primeiro cadastro (setup.html — cria o 1º admin)
--  6. Admins seguintes: painel → Membros → "Adicionar Membro" (email + senha,
--     via a Edge Function do passo 4 — não usa mais link de convite)
-- ════════════════════════════════════════════════════════
