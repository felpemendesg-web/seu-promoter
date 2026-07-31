-- ═══════════════════════════════════════════════════════
--  006 — Adiciona imagem de hero opcional em categories
--  (exibida como fundo do banner na página de gênero, genero.html)
-- ═══════════════════════════════════════════════════════

alter table public.categories add column if not exists hero_image_url text;
