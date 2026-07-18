# Seu Promoter

Site de divulgação de eventos (Florianópolis) com painel administrativo. Estático, sem build, hospedado na Vercel, backend no Supabase.

## Arquitetura

- **Sem build step.** HTML puro + CSS + JS vanilla. Não há `package.json`, bundler ou framework.
- **Backend = Supabase.** Postgres + Auth + Storage, acessado direto do navegador com a chave `anon` (pública por design). Toda a segurança de escrita/leitura vive nas **RLS policies** do banco — nunca confiar em checagem client-side como camada de segurança real.
- **Deploy = Vercel**, servindo os arquivos estáticos da pasta `Seu Promoter Design System/`. Rewrites e headers de segurança (CSP etc.) ficam em `vercel.json`.

```
Seu Promoter Design System/
├── index.html, evento.html, busca.html, genero.html, categoria.html   # site público
├── design-system-guideline.html                                       # guia de estilo/componentes
├── assets/
│   ├── css/        (globals.css, components.css, animations.css)
│   ├── js/
│   │   ├── supabase-client.js   # client público (URL + anon key)
│   │   ├── dynamic-data.js      # busca eventos/banners/categorias e injeta no DOM
│   │   ├── site-nav.js          # monta o menu a partir das categorias
│   │   ├── interactions.js      # scroll reveal etc.
│   │   └── vendor/purify.min.js # DOMPurify, vendorizado (sanitiza about_html)
│   └── images/
└── admin/
    ├── index.html (login), setup.html (1º acesso), invite.html (aceitar convite)
    ├── dashboard.html, events.html, categories.html, banners.html, members.html
    └── assets/js/
        ├── supabase-client.js   # client do admin (mesma anon key)
        └── auth.js              # checkAuth(), logout(), esc(), uploadImage(), toasts

setup.sql        # schema + RLS + funções — fonte da verdade do banco
migrations/      # migrations aplicadas incrementalmente, em ordem, nunca editadas retroativamente
vercel.json      # rewrites de /admin/* + headers de segurança (CSP, X-Frame-Options...)
```

### Fluxo de dados
Cada página pública roda um `<script>` inline que, no `DOMContentLoaded`, consulta o Supabase (`db.from('events').select(...)`) e monta HTML via template strings. Todo valor vindo do banco passa por:
- `esc(s)` — escapa `& < > "` antes de ir para `innerHTML`.
- `safeUrl(u)` — só deixa passar `http:`/`https:` em `href`/`src` (bloqueia `javascript:`).
- `about_html` (descrição de evento) — passa por `DOMPurify.sanitize()` antes de `innerHTML`, pois é o único campo com HTML livre vindo do admin.

Esses três helpers estão **duplicados** em cada página com `<script>` inline (não há import/bundler). É intencional — ao copiar um padrão de uma página para outra, copie os três junto.

### Autenticação e autorização
- Login do admin = Supabase Auth (`signInWithPassword`) + checagem de uma linha própria em `panel_members`.
- **Autorização real é 100% RLS**, não o JS. Regras atuais:
  - `panel_members`: sem policy de INSERT — só é criado via RPCs `SECURITY DEFINER` (`claim_first_admin`, `redeem_invite`), que validam convite/estado no servidor.
  - `events` / `categories` / `banners`: leitura pública; escrita exige `is_panel_member()`.
  - `invites`: leitura/escrita só para admin (`is_admin()`); campo `used` só muda dentro de `redeem_invite`.
  - Storage bucket `images`: público para leitura de objeto (sem listagem), escrita exige `is_panel_member()`.
- `is_panel_member()` / `is_admin()` são funções `SECURITY DEFINER` com `search_path` fixo — usadas nas policies para evitar recursão de RLS.

## Fluxo de manutenção

1. **Mudança de schema/RLS/função?** Escreva uma migration nova em `migrations/NNN_descricao.sql` (idempotente — `create or replace`, `drop policy if exists`), aplique com `mcp__supabase__apply_migration` (ou SQL Editor do Supabase), e replique o resultado final em `setup.sql` para ele continuar sendo o retrato atual do banco.
2. **Mudança de schema tem que vir acompanhada da mudança de cliente no mesmo PR/deploy** — client e banco não são versionados juntos automaticamente; um deploy de RLS mais restritivo antes do cliente saber falar com a RPC nova quebra fluxo em produção (aconteceu com convite/setup no hardening de 2026-07).
3. **Nunca commitar a `service_role` key.** Só a `anon` key deve aparecer em `assets/js/supabase-client.js` (público por design). Antes de commitar, `git grep service_role` para garantir.
4. **PRs pequenos para mudanças de risco** (RLS, auth, headers de segurança) — branch → PR → review → merge, nunca direto em `main`.

## Deploy

Projeto Vercel: `mendes-projects5/project-7dhgq`, repo `felpemendesg-web/seu-promoter`.

**Git conectado à Vercel** (branch de produção: `main`). Merge/push em `main` dispara deploy de produção automaticamente; qualquer outra branch/PR gera um preview deployment com URL própria — use o preview para revisar antes do merge.

Deploy manual (só se precisar pular o fluxo de PR, ex. hotfix pontual):
```
vercel --prod --yes
```

Domínio customizado: nenhum conectado ainda (site vive só na URL `*.vercel.app`). Para adicionar: Vercel dashboard → Settings → Domains → seguir os registros DNS indicados (A ou CNAME) no provedor onde o domínio foi registrado.

## Segurança — checklist antes de mexer em RLS/auth

- [ ] Testar com papel `anon` (não logado) e com um `authenticated` que **não** é membro do painel — nenhum dos dois deve conseguir escrever em `events`/`categories`/`banners`/storage nem se inserir em `panel_members`.
- [ ] Rodar `mcp__supabase__get_advisors` (security) depois de qualquer migration.
- [ ] Confirmar que o admin atual continua logando e com CRUD funcionando antes de considerar a mudança concluída.
