-- ═══════════════════════════════════════════════════════
--  004 — Adiciona slug amigável em events (URL /evento/<slug>)
-- ═══════════════════════════════════════════════════════

-- unaccent é necessário pra gerar slug de títulos com acento (Réveillon, Turnê, Bão...)
-- instalado em `extensions` (não em `public`), no mesmo padrão de uuid-ossp/pgcrypto.
create extension if not exists unaccent with schema extensions;

-- Nullable por enquanto — vira NOT NULL só depois do backfill abaixo.
alter table public.events add column if not exists slug text;

-- Backfill dos eventos existentes, do mais antigo pro mais novo, resolvendo
-- colisão com sufixo -2, -3... (mesma lógica usada no client em caso de conflito no save).
do $$
declare
  r record;
  base_slug text;
  candidate text;
  n int;
begin
  for r in select id, title from public.events where slug is null order by created_at loop
    base_slug := trim(both '-' from regexp_replace(lower(unaccent(r.title)), '[^a-z0-9]+', '-', 'g'));
    if base_slug = '' then base_slug := 'evento'; end if;
    candidate := base_slug;
    n := 1;
    while exists (select 1 from public.events where slug = candidate) loop
      n := n + 1;
      candidate := base_slug || '-' || n;
    end loop;
    update public.events set slug = candidate where id = r.id;
  end loop;
end $$;

alter table public.events alter column slug set not null;
create unique index if not exists events_slug_key on public.events (slug);
