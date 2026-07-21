// Shared auth helpers — included on every protected admin page

// Escapa HTML antes de injetar dados do banco via innerHTML.
function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function checkAuth() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }

  const { data: member, error } = await db
    .from('panel_members')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error || !member) {
    await db.auth.signOut();
    window.location.href = 'index.html';
    return null;
  }

  if (typeof hidePageLoader === 'function') hidePageLoader();
  return { session, member };
}

async function logout() {
  await db.auth.signOut();
  window.location.href = 'index.html';
}

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

async function uploadImage(file, folder) {
  const ext = file.name.split('.').pop().toLowerCase();
  const name = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;

  const { error } = await db.storage.from('images').upload(name, file, {
    cacheControl: '3600',
    upsert: false
  });

  if (error) throw error;

  const { data } = db.storage.from('images').getPublicUrl(name);
  return data.publicUrl;
}

function initMobileToggle() {
  const toggle    = document.querySelector('.mobile-toggle');
  const sidebar   = document.querySelector('.admin-sidebar');
  const backdrop  = document.querySelector('.sidebar-backdrop');

  if (!toggle || !sidebar || !backdrop) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('show');
  });

  backdrop.addEventListener('click', () => {
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
  });
}

function setUserInfo(member) {
  const nameEl   = document.getElementById('sidebar-user-name');
  const roleEl   = document.getElementById('sidebar-user-role');
  const avatarEl = document.getElementById('sidebar-avatar');

  if (nameEl)   nameEl.textContent   = member.name;
  if (roleEl)   roleEl.textContent   = 'Administrador';
  if (avatarEl) avatarEl.textContent = member.name.charAt(0).toUpperCase();
}
