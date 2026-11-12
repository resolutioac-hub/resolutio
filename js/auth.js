// === AUTH - Controle de acesso por perfil ===
const ROLES = {
  admin: { label:'Admin', home:'../admin/dashboard.html', color:'#2F5233' },
  funcionario: { label:'Funcionário', home:'../funcionario/dashboard.html', color:'#3B82F6' },
  cliente: { label:'Cliente', home:'../cliente/dashboard.html', color:'#8B5CF6' }
};

// Versao da sessao. Sessoes antigas (que dependiam de dados no localStorage)
// sao descartadas para forcar um novo login com o Supabase.
const SESSION_VERSION = 'v3-supabase';

function normalizeLogin(value) {
  return String(value || '').trim().toLowerCase();
}

function getSession() {
  try {
    if (localStorage.getItem('resolutio_session_version') !== SESSION_VERSION) {
      localStorage.removeItem('resolutio_role');
      localStorage.removeItem('resolutio_user');
      return { role: null, user: null };
    }
    const role = localStorage.getItem('resolutio_role');
    const user = JSON.parse(localStorage.getItem('resolutio_user') || 'null');
    return { role, user };
  } catch {
    return { role: null, user: null };
  }
}

function setSession(role, user) {
  localStorage.setItem('resolutio_session_version', SESSION_VERSION);
  localStorage.setItem('resolutio_role', role);
  localStorage.setItem('resolutio_user', JSON.stringify(user || null));
}

function updateSessionUser(patch) {
  const { role, user } = getSession();
  if (!role || !user) return;
  setSession(role, { ...user, ...(patch || {}) });
}

function requireAuth(allowedRoles) {
  const { role, user } = getSession();
  if (!role) {
    window.location.href = '../index.html';
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(role)) {
    const dest = ROLES[role]?.home || '../index.html';
    window.location.href = dest;
    return null;
  }
  if (role === 'cliente' && !window.location.pathname.includes('definir-senha')) {
    if (clienteNeedsPasswordSetup(user)) {
      window.location.href = '../cliente/definir-senha.html';
      return null;
    }
  }
  return role;
}

function logout() {
  localStorage.removeItem('resolutio_session_version');
  localStorage.removeItem('resolutio_role');
  localStorage.removeItem('resolutio_user');
  window.location.href = '../index.html';
}

// Cliente ainda nao definiu senha propria (primeiro acesso com 123).
function clienteNeedsPasswordSetup(user) {
  return !!user && user.role === 'cliente' && user.hasPassword === false;
}

// Autentica no Supabase. Retorna { role, user } ou null.
async function authenticate(identifier, password) {
  if (window.ResolutioCloud?.ready) await window.ResolutioCloud.ready;
  const rows = await API.auth.verify(identifier, password);
  if (!Array.isArray(rows) || !rows.length) return null;
  const row = rows[0];
  return {
    role: row.found_role,
    user: {
      id: row.found_id || '',
      email: String(row.found_email || '').toLowerCase(),
      nome: row.found_nome || '',
      cpf: row.found_cpf || '',
      funcao: row.found_funcao || '',
      role: row.found_role,
      hasPassword: row.found_has_password === true
    }
  };
}

async function verifyCredentials(identifier, password) {
  try {
    const result = await authenticate(identifier, password);
    return Boolean(result);
  } catch (err) {
    console.error('[Resolutio] Falha ao verificar credenciais:', err);
    return false;
  }
}

// Remove a senha do cliente para que o primeiro acesso volte a funcionar com 123.
async function clearClientPassword(client) {
  const email = String(client?.email || '').toLowerCase();
  await API.auth.deletePassword(email, client?.cpf || null);
}

// Salva a senha definida pelo cliente no primeiro acesso (e-mail + CPF).
async function saveInitialPassword(password) {
  const { user } = getSession();
  const email = String(user?.email || '').toLowerCase();
  if (!email) throw new Error('Sessao invalida. Faca login novamente.');
  await API.auth.savePassword(email, password, user?.cpf || null);
  updateSessionUser({ hasPassword: true });
}

function renderUserBadge() {
  const { role, user } = getSession();
  const email = user?.email || 'usuario@resolutio.com';
  const fallbackName = email.split('@')[0].replace('.', ' ').replace(/\b\w/g, c=>c.toUpperCase());
  const name = user?.nome || fallbackName;
  const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const roleLabel = ROLES[role]?.label || role || '—';
  return { name, email, initials, role, roleLabel };
}

function setupSidebar() {
  const { role } = getSession();
  document.querySelectorAll('.nav-item').forEach(a=>{
    if (a.getAttribute('href') && window.location.pathname.includes(a.getAttribute('href').replace('./','').replace('../',''))) {
      // already handled via .active in HTML
    }
  });
  const badge = renderUserBadge();
  const nameEl = document.getElementById('userName');
  const emailEl = document.getElementById('userEmail');
  const avatarEl = document.getElementById('userAvatar');
  const roleEl = document.getElementById('userRole');
  if (nameEl) nameEl.textContent = badge.name;
  if (emailEl) emailEl.textContent = badge.email;
  if (avatarEl) avatarEl.textContent = badge.initials;
  if (roleEl) roleEl.textContent = badge.roleLabel;
  if ((role === 'admin' || role === 'funcionario') && !document.getElementById('changePasswordButton')) {
    const footer = document.querySelector('.sidebar__footer');
    if (footer) {
      const button = document.createElement('button');
      button.id = 'changePasswordButton';
      button.className = 'btn btn--ghost btn--sm';
      button.type = 'button';
      button.textContent = 'Trocar senha';
      button.style.cssText = 'width:100%;margin-top:8px;';
      button.onclick = openChangePassword;
      footer.appendChild(button);
    }
  }
  setupMotion();
}

function setupMotion() {
  if (window.resolutioMotionObserver) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.anim-up').forEach(element => element.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });
  window.resolutioMotionObserver = observer;
  let index = 0;
  const observeElements = () => document.querySelectorAll('.anim-up:not([data-motion-bound])').forEach(element => {
    element.dataset.motionBound = 'true';
    element.style.setProperty('--motion-delay', `${Math.min(index++ * 45, 240)}ms`);
    observer.observe(element);
  });
  observeElements();
  new MutationObserver(observeElements).observe(document.body, { childList: true, subtree: true });
}

function openChangePassword() {
  let modal = document.getElementById('changePasswordModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'changePasswordModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal"><div class="modal-header"><h3>Trocar senha</h3><button class="modal-close" type="button" aria-label="Fechar">×</button></div><div class="modal-body"><div class="form-group"><label for="currentPassword">Senha atual</label><input id="currentPassword" class="form-control" type="password"></div><div class="form-group"><label for="newPassword">Nova senha</label><input id="newPassword" class="form-control" type="password" minlength="6"></div><div class="form-group"><label for="newPasswordConfirm">Confirmar nova senha</label><input id="newPasswordConfirm" class="form-control" type="password" minlength="6"></div></div><div class="modal-footer"><button class="btn btn--ghost" type="button">Cancelar</button><button class="btn btn--primary" type="button">Salvar senha</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('.modal-close').onclick = () => modal.classList.remove('open');
    modal.querySelector('.btn--ghost').onclick = () => modal.classList.remove('open');
    modal.querySelector('.btn--primary').onclick = saveNewPassword;
  }
  modal.classList.add('open');
  modal.querySelector('#currentPassword').focus();
}

async function saveNewPassword() {
  const session = getSession();
  const current = document.getElementById('currentPassword').value;
  const password = document.getElementById('newPassword').value;
  const confirmation = document.getElementById('newPasswordConfirm').value;
  if (password.length < 6) return toast('A senha deve ter pelo menos 6 caracteres.', 'error');
  if (password !== confirmation) return toast('As senhas não conferem.', 'error');
  const email = session.role === 'admin' ? 'admin@resolutio.com' : String(session.user?.email || '').toLowerCase();
  if (!email) return toast('Sessão inválida. Faça login novamente.', 'error');
  const ok = await verifyCredentials(email, current);
  if (!ok) return toast('Senha atual incorreta.', 'error');
  try {
    await API.auth.savePassword(email, password, session.user?.cpf || null);
    updateSessionUser({ hasPassword: true });
    document.getElementById('changePasswordModal').classList.remove('open');
    toast('Senha alterada com sucesso.');
  } catch (err) {
    toast(err.message || 'Não foi possível alterar a senha.', 'error');
  }
}

function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
}

function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
document.addEventListener('click', (e)=>{
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

function toast(msg, type='success') {
  let c = document.getElementById('toastContainer');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toastContainer';
    c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:300;display:flex;flex-direction:column;gap:10px;';
    document.body.appendChild(c);
  }
  const el = document.createElement('div');
  const bg = type==='success' ? '#10B981' : type==='error' ? '#EF4444' : '#3B82F6';
  el.style.cssText = `background:${bg};color:white;padding:12px 18px;border-radius:10px;font-size:0.85rem;box-shadow:0 8px 24px rgba(0,0,0,0.15);animation:slideIn 0.2s ease;`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateX(20px)'; el.style.transition='all 0.3s'; setTimeout(()=>el.remove(),300); }, 3000);
}
