// Monta o menu de navegação a partir das categorias marcadas com "Exibir no menu do site".
// Requer supabase-client.js carregado antes.

document.addEventListener('DOMContentLoaded', async () => {
  const nav = document.querySelector('.nav-links');
  if (!nav) return;

  const { data: cats } = await db
    .from('categories')
    .select('name')
    .eq('active', true)
    .eq('show_in_menu', true)
    .order('name');

  if (!cats || cats.length === 0) return;

  const escNav = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  nav.innerHTML = `
    <li><a href="index.html">Início</a></li>
    ${cats.map(c => `<li class="animate-fade-in"><a href="genero.html?genero=${encodeURIComponent(c.name)}">${escNav(c.name)}</a></li>`).join('')}
  `;
});
