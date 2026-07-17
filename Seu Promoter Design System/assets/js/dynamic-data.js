// Carrega dados dinâmicos do Supabase e renderiza no site público.
// O site exibe apenas o que está cadastrado no banco — seções sem dados ficam ocultas.

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadBanners(), loadFeaturedEvents(), loadEvents(), loadGenres()]);
});

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Só deixa passar http(s); bloqueia javascript:, data: etc. vindos do banco.
function safeUrl(u) {
  try { const p = new URL(u, location.origin).protocol; return (p === 'http:' || p === 'https:') ? u : '#'; }
  catch { return '#'; }
}

// ── Banners ───────────────────────────────────────────────
async function loadBanners() {
  const section   = document.getElementById('banner-section');
  const track     = document.querySelector('.main-banner-track');
  const dotsWrap  = document.querySelector('.main-banner-dots');
  if (!track) return;

  const { data: banners } = await db
    .from('banners')
    .select('*')
    .eq('active', true)
    .order('order_index')
    .order('created_at');

  if (!banners || banners.length === 0) {
    // Sem banner: compensa a navbar fixa na primeira seção visível
    const first = document.getElementById('featured-section') || document.querySelector('.hero');
    if (first) first.style.paddingTop = '8rem';
    return;
  }

  track.innerHTML = banners.map(b => `
    <div class="main-banner-slide">
      ${b.link ? `<a href="${esc(safeUrl(b.link))}">` : '<div>'}
        <picture>
          <source media="(max-width: 768px)" srcset="${esc(safeUrl(b.mobile_image_url))}">
          <img src="${esc(safeUrl(b.desktop_image_url))}" alt="${esc(b.title) || 'Banner'}">
        </picture>
      ${b.link ? '</a>' : '</div>'}
    </div>
  `).join('');

  if (dotsWrap) {
    dotsWrap.innerHTML = banners.map((_, i) =>
      `<span class="banner-dot${i === 0 ? ' active' : ''}" data-slide="${i}"></span>`
    ).join('');
  }

  if (section) section.style.display = '';
  initBannerCarousel();
}

// ── Card de evento (compartilhado) ────────────────────────
function eventCard(ev, i, featured = false) {
  const dateStr = `${formatDate(ev.date)}${ev.time ? ' · ' + esc(ev.time) : ''}`;
  const cls = featured ? 'event-card-featured hover-glow hover-lift' : `event-card reveal-on-scroll delay-${((i % 3) + 1) * 100} hover-glow`;
  return `
    <article class="${cls}">
      ${featured ? '<span class="badge-destaque">⭐ Destaque</span>' : ''}
      <div style="overflow:hidden;">
        <img src="${esc(safeUrl(ev.image_url)) || 'assets/images/show.jpg'}" alt="${esc(ev.title)}" class="${featured ? 'feat-img' : 'event-card-img'}">
      </div>
      <div class="event-card-body">
        <span class="event-date">${dateStr}</span>
        <h3 class="event-title">${esc(ev.title)}</h3>
        ${ev.location ? `<p class="event-location"><i data-lucide="map-pin" style="width:14px;height:14px;"></i>${esc(ev.location)}</p>` : ''}
        <div class="event-footer">
          <a href="evento.html?id=${ev.id}" class="btn btn-primary">Ver Evento</a>
        </div>
      </div>
    </article>
  `;
}

// ── Eventos em destaque ────────────────────────────────────
async function loadFeaturedEvents() {
  const grid = document.querySelector('.featured-grid');
  if (!grid) return;

  const { data: events } = await db
    .from('events')
    .select('*')
    .eq('active', true)
    .eq('featured', true)
    .order('date', { ascending: true })
    .limit(8);

  if (!events || events.length === 0) return;

  grid.innerHTML = events.map((ev, i) => eventCard(ev, i, true)).join('');
  const section = document.getElementById('featured-section');
  if (section) section.style.display = '';

  if (typeof lucide !== 'undefined') lucide.createIcons();
  revealAll(grid);
}

// ── Próximos eventos ───────────────────────────────────────
async function loadEvents() {
  const grid = document.getElementById('events-grid');
  if (!grid) return;

  const { data: events } = await db
    .from('events')
    .select('*')
    .eq('active', true)
    .order('date', { ascending: true })
    .limit(9);

  if (!events || events.length === 0) return;

  grid.innerHTML = events.map((ev, i) => eventCard(ev, i)).join('');
  const section = document.getElementById('upcoming-section');
  if (section) section.style.display = '';

  if (typeof lucide !== 'undefined') lucide.createIcons();
  revealAll(grid);
}

// ── Explorar por Gênero ────────────────────────────────────
// Exibe as categorias cadastradas no admin com "Exibir no carrossel" ativo.
async function loadGenres() {
  const grid = document.getElementById('genres-grid');
  if (!grid) return;

  const { data: cats } = await db
    .from('categories')
    .select('name, icon')
    .eq('active', true)
    .eq('show_in_explore', true)
    .order('name');

  const genres = (cats || []).map(c => ({ name: c.name, icon: c.icon || 'music-2' }));
  if (genres.length === 0) return;

  const items = genres.map((g, i) => `
    <a href="genero.html?genero=${encodeURIComponent(g.name)}" class="category-card reveal-on-scroll delay-${(i % 5 + 1) * 100}">
      <div class="category-icon">
        <i data-lucide="${esc(g.icon)}" style="width:24px;height:24px;"></i>
      </div>
      <span class="category-name">${esc(g.name)}</span>
    </a>
  `).join('');

  grid.innerHTML = items + `
    <a href="genero.html" class="category-card reveal-on-scroll">
      <div class="category-icon">
        <i data-lucide="layout-grid" style="width:24px;height:24px;"></i>
      </div>
      <span class="category-name">Ver Todos</span>
    </a>
  `;

  const section = document.getElementById('genres-section');
  if (section) section.style.display = '';

  if (typeof lucide !== 'undefined') lucide.createIcons();
  revealAll(grid);
}

// ── Helpers ───────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

// Elementos inseridos após o DOMContentLoaded não são observados pelo
// IntersectionObserver do interactions.js — revela direto.
function revealAll(root) {
  root.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('is-visible'));
}

function initBannerCarousel() {
  const bannerCarousel = document.querySelector('.main-banner-carousel');
  if (!bannerCarousel) return;

  const track = bannerCarousel.querySelector('.main-banner-track');
  const slides = bannerCarousel.querySelectorAll('.main-banner-slide');
  const prevBtn = bannerCarousel.querySelector('.main-banner-arrow.prev');
  const nextBtn = bannerCarousel.querySelector('.main-banner-arrow.next');
  const dots = bannerCarousel.querySelectorAll('.banner-dot');
  if (!slides.length) return;

  let current = 0;
  let timer = null;

  function goTo(idx) {
    current = (idx + slides.length) % slides.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }

  function autoplay() { stopAutoplay(); timer = setInterval(() => goTo(current + 1), 5000); }
  function stopAutoplay() { if (timer) clearInterval(timer); }

  if (nextBtn) nextBtn.addEventListener('click', () => { goTo(current + 1); autoplay(); });
  if (prevBtn) prevBtn.addEventListener('click', () => { goTo(current - 1); autoplay(); });
  dots.forEach((d, i) => d.addEventListener('click', () => { goTo(i); autoplay(); }));

  bannerCarousel.addEventListener('mouseenter', stopAutoplay);
  bannerCarousel.addEventListener('mouseleave', autoplay);

  let tx = 0;
  bannerCarousel.addEventListener('touchstart', e => { tx = e.touches[0].clientX; stopAutoplay(); }, { passive: true });
  bannerCarousel.addEventListener('touchend', e => {
    const diff = tx - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) goTo(diff > 0 ? current + 1 : current - 1);
    autoplay();
  }, { passive: true });

  autoplay();
}
