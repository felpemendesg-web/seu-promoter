-- Relacionamento muitos-para-muitos entre eventos e categorias.
-- Um evento agora pode ter mais de uma categoria (antes era um campo de
-- texto livre "genre" + um FK escalar "category_id" nunca usado pela UI).

create table if not exists public.event_categories (
  event_id    uuid not null references public.events(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (event_id, category_id)
);

alter table public.event_categories enable row level security;

create policy "evcat_read"   on public.event_categories for select using (true);
create policy "evcat_insert" on public.event_categories for insert with check (public.is_panel_member());
create policy "evcat_delete" on public.event_categories for delete using (public.is_panel_member());

-- Remove o FK escalar antigo (nunca usado pela UI) — precisa sumir para não
-- gerar ambiguidade na relação auto-detectada events -> categories via
-- event_categories (PostgREST erra "more than one relationship found" se
-- os dois caminhos coexistirem).
alter table public.events drop column if exists category_id;

-- genre/genre_icon (texto livre) substituídos pela relação event_categories
-- -> categories (categories.icon já cobre o ícone). Banco pré-lançamento,
-- 0 eventos cadastrados no momento desta migration — nenhum dado a migrar.
alter table public.events drop column if exists genre;
alter table public.events drop column if exists genre_icon;
