// Carrega dados dinâmicos do Supabase e renderiza no site público

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadBanners(), loadFeaturedEvents(), loadEvents(), loadCategories()]);
});

// ── Banners ───────────────────────────────────────────────
async function loadBanners() {
  const track     = document.querySelector('.main-banner-track');
  const dotsWrap  = document.querySelector('.main-banner-dots');
  if (!track) return;

  const { data: banners } = await db
    .from('banners')
    .select('*')
    .eq('active', true)
    .order('order_index')
    .order('created_at');

  if (!banners || banners.length === 0) return;

  track.innerHTML = banners.map(b => `
    <div class="main-banner-slide">
      ${b.link ? `<a href="${b.link}">` : '<div>'}
        <picture>
          <source media="(max-width: 768px)" srcset="${b.mobile_image_url}">
          <img src="${b.desktop_image_url}" alt="${b.title || 'Banner'}">
        </picture>
      ${b.link ? '</a>' : '</div>'}
    </div>
  `).join('');

  if (dotsWrap) {
    dotsWrap.innerHTML = banners.map((_, i) =>
      `<span class="banner-dot${i === 0 ? ' active' : ''}" data-slide="${i}"></span>`
    ).join('');
  }

  // Re-init banner carousel (interactions.js já cobre se chamado depois do DOM)
  initBannerCarousel();
}

// ── Featured Events ───────────────────────────────────────
async function loadFeaturedEvents() {
  const grid = document.querySelector('.featured-grid');
  if (!grid) return;

  const { data: events } = await db
    .from('events')
    .select('*, categories(name)')
    .eq('active', true)
    .eq('featured', true)
    .order('date', { ascending: true })
    .limit(6);

  if (!events || events.length === 0) return;

  grid.innerHTML = events.map(ev => `
    <article class="event-card-featured hover-glow hover-lift">
      <span class="badge-destaque">⭐ Destaque</span>
      <div style="overflow:hidden;">
        <img src="${ev.image_url || 'assets/images/show.jpg'}" alt="${ev.title}" class="feat-img">
      </div>
      <div class="event-card-body">
        <span class="event-date">${formatDate(ev.date)}${ev.time ? ' · ' + ev.time : ''}</span>
        <h3 class="event-title">${ev.title}</h3>
        ${ev.location ? `<p class="event-location"><i data-lucide="map-pin" style="width:14px;height:14px;"></i>${ev.location}</p>` : ''}
        <div class="event-footer">
          <a href="${ev.ticket_url || 'evento.html?id=' + ev.id}" class="btn btn-primary"${ev.ticket_url ? ' target="_blank" rel="noopener"' : ''}>Ver Evento</a>
        </div>
      </div>
    </article>
  `).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── All Events ─────────────────────────────────────────────
async function loadEvents() {
  const grid = document.getElementById('events-grid');
  if (!grid) return;

  const { data: events } = await db
    .from('events')
    .select('*, categories(name)')
    .eq('active', true)
    .order('date', { ascending: true })
    .limit(9);

  if (!events || events.length === 0) return;

  grid.innerHTML = events.map((ev, i) => `
    <article class="event-card reveal-on-scroll delay-${((i % 3) + 1) * 100} hover-glow">
      <div style="overflow:hidden;">
        <img src="${ev.image_url || 'assets/images/show.jpg'}" alt="${ev.title}" class="event-card-img">
      </div>
      <div class="event-card-body">
        <span class="event-date">${formatDate(ev.date)}${ev.time ? ' · ' + ev.time : ''}</span>
        <h3 class="event-title">${ev.title}</h3>
        ${ev.location ? `<p class="event-location"><i data-lucide="map-pin" style="width:14px;height:14px;"></i>${ev.location}</p>` : ''}
        <div class="event-footer">
          <a href="${ev.ticket_url || 'evento.html?id=' + ev.id}" class="btn btn-primary"${ev.ticket_url ? ' target="_blank" rel="noopener"' : ''}>Ver Evento</a>
        </div>
      </div>
    </article>
  `).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Categories ─────────────────────────────────────────────
async function loadCategories() {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;

  const { data: cats } = await db
    .from('categories')
    .select('*')
    .eq('active', true)
    .order('name');

  if (!cats || cats.length === 0) return;

  const items = cats.map((c, i) => `
    <a href="categoria.html?categoria=${c.slug}" class="category-card reveal-on-scroll delay-${(i % 5 + 1) * 100}">
      <div class="category-icon">
        <i data-lucide="${c.icon || 'calendar'}" style="width:24px;height:24px;"></i>
      </div>
      <span class="category-name">${c.name}</span>
    </a>
  `).join('');

  // Keep "Ver Todos" at the end
  grid.innerHTML = items + `
    <a href="categoria.html" class="category-card reveal-on-scroll">
      <div class="category-icon">
        <i data-lucide="layout-grid" style="width:24px;height:24px;"></i>
      </div>
      <span class="category-name">Ver Todos</span>
    </a>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Helpers ───────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
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
