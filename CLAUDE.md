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
    ├── index.html (login), setup.html (1º acesso), forgot-password.html, reset-password.html
    ├── dashboard.html, events.html, categories.html, banners.html, members.html
    └── assets/js/
        ├── supabase-client.js   # client do admin (mesma anon key)
        └── auth.js              # checkAuth(), logout(), esc(), uploadImage(), toasts

supabase/functions/create-admin-member/index.ts  # Edge Function: cria conta admin (email+senha) via service_role
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

### Modelo de dados: eventos e categorias
Um evento pode ter **várias categorias** — relação muitos-para-muitos via `event_categories` (tabela de junção, sem colunas além das duas FKs). Não existe mais o campo de texto livre `events.genre`/`genre_icon` nem o FK escalar `events.category_id` (removidos em 2026-07; a UI nunca usava o segundo, e o primeiro exigia digitar o nome da categoria manualmente sem checagem).

- **Consulta:** o Supabase auto-detecta a relação many-to-many a partir das duas FKs em `event_categories` — não é preciso mencionar essa tabela no `select()`, basta `events.select('*, categories(id, name, icon)')`. Isso só funciona porque existe **um único caminho** entre `events` e `categories`; se algum dia voltar a existir uma segunda FK direta entre as duas tabelas, o embed vira ambíguo e o PostgREST erra.
- **Filtrar por categoria** (usado em `genero.html`): precisa do modificador `!inner` no embed para poder filtrar por ele — `events.select('*, categories!inner(name)').ilike('categories.name', genre)`.
- **Admin (`events.html`):** o campo de categoria é um checklist multi-select das categorias já cadastradas (não cria categoria nova ali). Ao salvar, o cliente sempre apaga todos os vínculos do evento em `event_categories` e reinsere os selecionados — mais simples e correto do que calcular um diff, aceitável pelo volume baixo de categorias por evento.

### Autenticação e autorização
- Login do admin = Supabase Auth (`signInWithPassword`) + checagem de uma linha própria em `panel_members`.
- **Cargo único: `admin`.** Não existe mais distinção editor/admin — `panel_members.role` tem `check (role = 'admin')`. Simplificado em 2026-07 (era `admin`/`editor`, mas nunca havia diferença real de permissão no RLS).
- **Autorização real é 100% RLS**, não o JS. Regras atuais:
  - `panel_members`: sem policy de INSERT — só é criado via `claim_first_admin` (RPC `SECURITY DEFINER`, bootstrap do 1º admin em `setup.html`) ou via a Edge Function `create-admin-member` (usa `service_role`, bypassa RLS por design — é código de servidor confiável, não client-side).
  - `events` / `categories` / `banners`: leitura pública; escrita exige `is_panel_member()`.
  - Storage bucket `images`: público para leitura de objeto (sem listagem), escrita exige `is_panel_member()`.
- `is_panel_member()` / `is_admin()` são funções `SECURITY DEFINER` com `search_path` fixo — usadas nas policies para evitar recursão de RLS.
- **Adicionar membro** (painel → Membros → "Adicionar Membro") chama `create-admin-member` com email+senha: a função verifica que quem chama já é admin, cria a conta via `auth.admin.createUser({ email_confirm: true })` (sem depender de e-mail de confirmação) e insere o membro. Substituiu o antigo fluxo de link de convite (`invites` + `validate_invite`/`redeem_invite`), que quebrava sempre que a confirmação de e-mail do projeto estava ativa. A tabela `invites` e essas duas RPCs continuam no banco (RLS já as restringe a admin), mas são **legado morto** — não recebem novos convites.

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
