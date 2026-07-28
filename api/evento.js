// Serve a página de evento com as tags de título/OG/Twitter corretas por evento,
// antes de a página chegar no navegador (WhatsApp/Facebook/Twitter não executam JS,
// então a versão estática servida direto do disco nunca mostraria o evento certo).
// Rota via rewrite em vercel.json: /evento/:slug e /evento?id=<uuid> (link antigo).

// Mesma anon key pública já usada em assets/js/supabase-client.js — leitura de
// `events` já é liberada pelo RLS pra qualquer um, não é um segredo novo aqui.
const SUPABASE_URL = 'https://ygbmjiosphwkwbvmgorm.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnYm1qaW9zcGh3a3didm1nb3JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMTU1MzMsImV4cCI6MjA5ODU5MTUzM30.MWlbSeKa-pL4goeKmTzrANRMva6-GydkNPAyhjfHPI8';
const SITE_URL = 'https://seupromoterfloripa.com.br';

const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = async (req, res) => {
  try {
    const slug = typeof req.query.slug === 'string' ? req.query.slug : null;
    const id = typeof req.query.id === 'string' ? req.query.id : null;

    // Busca o próprio evento.html já publicado neste deployment — evita duplicar
    // o HTML dentro da função e mantém tudo sincronizado com o arquivo real.
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const templateRes = await fetch(`${proto}://${host}/evento`);
    if (!templateRes.ok) {
      res.status(502).send('Erro ao carregar a página do evento.');
      return;
    }
    let html = await templateRes.text();

    if (!slug && !id) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(html);
      return;
    }

    const filterField = slug ? 'slug' : 'id';
    const filterValue = slug || id;
    const apiUrl = `${SUPABASE_URL}/rest/v1/events?select=title,subtitle,slug,image_url&${filterField}=eq.${encodeURIComponent(filterValue)}&active=eq.true&limit=1`;
    const eventRes = await fetch(apiUrl, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }
    });
    const rows = eventRes.ok ? await eventRes.json() : [];
    const ev = Array.isArray(rows) ? rows[0] : null;

    if (!ev) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(404).send(html);
      return;
    }

    const title = `${esc(ev.title)} | Seu Promoter`;
    const description = esc(
      ev.subtitle || 'Confira data, local e garanta seu ingresso com segurança na plataforma oficial do Seu Promoter.'
    );
    const canonicalUrl = `${SITE_URL}/evento/${encodeURIComponent(ev.slug)}`;

    const seoBlock = `<!-- SEO:START -->
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="event">
  <meta property="og:image" content="${SITE_URL}/assets/images/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${canonicalUrl}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${SITE_URL}/assets/images/og-image.png">
  <!-- SEO:END -->`;

    html = html.replace(/<!--\s*SEO:START[\s\S]*?SEO:END\s*-->/, seoBlock);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    res.status(200).send(html);
  } catch (err) {
    res.status(500).send('Erro ao carregar o evento.');
  }
};
