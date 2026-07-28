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

// Redimensiona (máx. 1600px no maior lado) e recomprime como JPEG antes do
// upload — imagens de evento/banner enviadas direto do celular costumam vir
// com vários MB e sem nenhum tratamento, o que pesava demais no carregamento
// do site. Só usa a versão comprimida se ela sair menor que o arquivo original.
async function compressImage(file, maxDimension = 1600, quality = 0.8) {
  if (file.type === 'image/svg+xml') return file; // vetor, nada a ganhar comprimindo

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    let { width, height } = bitmap;
    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch (err) {
    console.error('Falha ao comprimir imagem, enviando original:', err);
    return file;
  }
}

async function uploadImage(file, folder) {
  const compressed = await compressImage(file);
  const ext = compressed.name.split('.').pop().toLowerCase();
  const name = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;

  // cacheControl longo porque o nome do arquivo é único por upload
  // (timestamp + sufixo aleatório) — nunca é sobrescrito, então é seguro
  // deixar o CDN guardar por bastante tempo.
  const { error } = await db.storage.from('images').upload(name, compressed, {
    cacheControl: '31536000',
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
