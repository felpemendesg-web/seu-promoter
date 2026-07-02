-- ═══════════════════════════════════════════════════════
--  Seu Promoter — Setup do Banco de Dados Supabase
--  Execute este SQL no SQL Editor do seu projeto Supabase
-- ═══════════════════════════════════════════════════════

-- 1. Categorias
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  icon       text default 'calendar',
  active     boolean default true,
  created_at timestamptz default now()
);

-- 2. Eventos
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  date        date,
  time        text,
  location    text,
  image_url   text,
  ticket_url  text,
  category_id uuid references public.categories(id) on delete set null,
  featured    boolean default false,
  active      boolean default true,
  created_at  timestamptz default now()
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
create table if not exists public.panel_members (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  email      text not null,
  role       text default 'editor' check (role in ('admin', 'editor')),
  created_at timestamptz default now()
);

-- 5. Convites
create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  role       text default 'editor',
  token      uuid default gen_random_uuid() unique not null,
  used       boolean default false,
  created_by uuid references public.panel_members(id) on delete set null,
  created_at timestamptz default now()
);

-- ── Row Level Security ───────────────────────────────────
alter table public.categories   enable row level security;
alter table public.events        enable row level security;
alter table public.banners       enable row level security;
alter table public.panel_members enable row level security;
alter table public.invites       enable row level security;

-- Categories: leitura pública, escrita autenticada
create policy "cat_read"   on public.categories for select using (true);
create policy "cat_insert" on public.categories for insert with check (auth.role() = 'authenticated');
create policy "cat_update" on public.categories for update using (auth.role() = 'authenticated');
create policy "cat_delete" on public.categories for delete using (auth.role() = 'authenticated');

-- Events: leitura pública, escrita autenticada
create policy "ev_read"   on public.events for select using (true);
create policy "ev_insert" on public.events for insert with check (auth.role() = 'authenticated');
create policy "ev_update" on public.events for update using (auth.role() = 'authenticated');
create policy "ev_delete" on public.events for delete using (auth.role() = 'authenticated');

-- Banners: leitura pública, escrita autenticada
create policy "ban_read"   on public.banners for select using (true);
create policy "ban_insert" on public.banners for insert with check (auth.role() = 'authenticated');
create policy "ban_update" on public.banners for update using (auth.role() = 'authenticated');
create policy "ban_delete" on public.banners for delete using (auth.role() = 'authenticated');

-- Panel Members: leitura/escrita autenticada, qualquer um pode inserir (para setup inicial e convites)
create policy "mem_read"   on public.panel_members for select using (auth.role() = 'authenticated');
create policy "mem_insert" on public.panel_members for insert with check (true);
create policy "mem_update" on public.panel_members for update using (auth.role() = 'authenticated');
create policy "mem_delete" on public.panel_members for delete using (auth.role() = 'authenticated');

-- Invites: autenticado cria, qualquer um lê/atualiza (para validar token)
create policy "inv_insert" on public.invites for insert with check (auth.role() = 'authenticated');
create policy "inv_read"   on public.invites for select using (true);
create policy "inv_update" on public.invites for update using (true);

-- ── Storage Bucket ───────────────────────────────────────
-- Execute no SQL Editor do Supabase:
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

create policy "img_public_read" on storage.objects
  for select using (bucket_id = 'images');

create policy "img_auth_insert" on storage.objects
  for insert with check (bucket_id = 'images' and auth.role() = 'authenticated');

create policy "img_auth_update" on storage.objects
  for update using (bucket_id = 'images' and auth.role() = 'authenticated');

create policy "img_auth_delete" on storage.objects
  for delete using (bucket_id = 'images' and auth.role() = 'authenticated');

-- ════════════════════════════════════════════════════════
--  Pronto! Após executar este SQL:
--  1. Copie a URL e a anon key do projeto Supabase
--  2. Cole em: admin/assets/js/supabase-client.js
--  3. E em:    assets/js/supabase-client.js
--  4. Acesse /admin e faça o primeiro cadastro
-- ════════════════════════════════════════════════════════
