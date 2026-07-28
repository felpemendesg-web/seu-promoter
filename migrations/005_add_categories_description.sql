-- ═══════════════════════════════════════════════════════
--  005 — Adiciona descrição opcional em categories (exibida
--  abaixo do título na página de gênero, genero.html)
-- ═══════════════════════════════════════════════════════

alter table public.categories add column if not exists description text;
