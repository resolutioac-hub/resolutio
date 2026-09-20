// === AUTH - Controle de acesso por perfil ===
const ROLES = {
  admin: { label:'Admin', home:'../admin/dashboard.html', color:'#2F5233' },
  funcionario: { label:'Funcionário', home:'../funcionario/dashboard.html', color:'#3B82F6' },
  cliente: { label:'Cliente', home:'../cliente/dashboard.html', color:'#8B5CF6' }
};

const ADMIN_LOGIN_KEY = 'resolutio_admin_login';
const DEFAULT_ADMIN_LOGIN = 'admin@resolutio.com';

function normalizeLogin(value) {
  return String(value || '').trim().toLowerCase();
}

function getAdminLogin() {
  return normalizeLogin(localStorage.getItem(ADMIN_LOGIN_KEY) || DEFAULT_ADMIN_LOGIN);
}

function isAdminIdentifier(identifier) {
  const normalized = normalizeLogin(identifier);
  const hasCustomLogin = Boolean(localStorage.getItem(ADMIN_LOGIN_KEY));
  return normalized === getAdminLogin() || (!hasCustomLogin && normalized === 'admin');
}

function getAdminPassword(passwords) {
  const login = getAdminLogin();
  return passwords.admin || passwords[`admin:${login}`] || passwords[login] || passwords[DEFAULT_ADMIN_LOGIN];
}

function migrateAdminPassword(passwords) {
  const current = getAdminPassword(passwords);
  if (current) passwords.admin = current;
  const legacyKeys = [DEFAULT_ADMIN_LOGIN, `admin:${getAdminLogin()}`, getAdminLogin()];
  legacyKeys.forEach(key => { if (key !== 'admin') delete passwords[key]; });
}

function getSession() {
  try {
    const role = localStorage.getItem('resolutio_role');
    const user = JSON.parse(localStorage.getItem('resolutio_user') || 'null');
    return { role, user };
  } catch { return { role:null, user:null }; }
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
  // Cliente em primeiro acesso (passou a senha inicial 123) precisa definir nova senha
  if (role === 'cliente' && !window.location.pathname.includes('definir-senha.html') && clienteNeedsPasswordSetup(user)) {
    window.location.href = '../cliente/definir-senha.html';
    return null;
  }
  return role;
}

function logout() {
  localStorage.removeItem('resolutio_role');
  localStorage.removeItem('resolutio_user');
  // manter DB mock
  window.location.href = '../index.html';
}

// Busca cliente por e-mail ou CPF
function findClientByIdentifier(identifier) {
  const normalized = String(identifier || '').trim().toLowerCase();
  const cpfDigits = normalized.replace(/\D/g, '');
  const db = getDB();
  return (db.clientes || []).find(c =>
    (c.email && c.email.toLowerCase() === normalized) ||
    (c.cpf && c.cpf.replace(/\D/g, '') === cpfDigits && cpfDigits.length === 11)
  ) || null;
}

// Busca funcionario por e-mail
function findFuncionarioByEmail(identifier) {
  const normalized = String(identifier || '').trim().toLowerCase();
  const db = getDB();
  return (db.funcionarios || []).find(f =>
    f.ativo && f.email && f.email.toLowerCase() === normalized
  ) || null;
}

// Chave da senha armazenada de um cliente (sempre pelo e-mail)
function clientPasswordKey(client) {
  return (client && client.email ? String(client.email).toLowerCase() : '') || '';
}

// Cliente ainda não definiu uma senha própria (primeiro acesso / senha inicial 123)
function clienteNeedsPasswordSetup(user) {
  const email = String(user?.email || '').toLowerCase();
  if (!email) return false;
  const passwords = JSON.parse(localStorage.getItem('resolutio_passwords') || '{}');
  return !passwords[email];
}

// Salva a senha definida pelo cliente no primeiro acesso (e-mail + CPF)
function saveInitialPassword(password) {
  const { user } = getSession();
  const email = String(user?.email || '').toLowerCase();
  const passwords = JSON.parse(localStorage.getItem('resolutio_passwords') || '{}');
  if (email) passwords[email] = password;
  if (user?.cpf) {
    const cpfDigits = String(user.cpf).replace(/\D/g, '');
    if (cpfDigits && cpfDigits.length === 11) passwords['cpf:' + cpfDigits] = password;
  }
  localStorage.setItem('resolutio_passwords', JSON.stringify(passwords));
}

// Verifica credenciais de login.
// Admin: login atual (ou "admin" antes da primeira alteração) e senha armazenada.
// Cliente: e-mail ou CPF. Funcionário: e-mail.
async function verifyCredentials(identifier, password) {
  const normalized = normalizeLogin(identifier);
  const passwords = JSON.parse(localStorage.getItem('resolutio_passwords') || '{}');
  if (isAdminIdentifier(normalized)) {
    migrateAdminPassword(passwords);
    localStorage.setItem('resolutio_passwords', JSON.stringify(passwords));
    const stored = getAdminPassword(passwords);
    return password === (stored || '123');
  }
  // Verificar se é cliente (por e-mail ou CPF)
  const client = findClientByIdentifier(normalized);
  if (client) {
    const key = clientPasswordKey(client);
    if (key && passwords[key]) return password === passwords[key];
    const cpfDigits = String(client.cpf || '').replace(/\D/g, '');
    if (cpfDigits && passwords['cpf:' + cpfDigits]) return password === passwords['cpf:' + cpfDigits];
    // Primeiro acesso do cliente — senha padrão 123
    return password === '123';
  }
  // Verificar se é funcionário (por e-mail)
  const func = findFuncionarioByEmail(normalized);
  if (func) {
    const funcPassword = passwords['funcionario:' + func.email.toLowerCase()];
    if (funcPassword) return password === funcPassword;
    // Primeiro acesso do funcionário — senha padrão 123
    return password === '123';
  }
  // Nenhum usuário encontrado
  return false;
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
  // highlight active nav
  const path = window.location.pathname;
  document.querySelectorAll('.nav-item').forEach(a=>{
    if (a.getAttribute('href') && path.includes(a.getAttribute('href').replace('./','').replace('../',''))) {
      // already handled via .active in HTML
    }
  });
  // user mini
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
  const email = session.user?.email || session.role;
  const ok = await verifyCredentials(email, current);
  if (!ok) return toast('Senha atual incorreta.', 'error');
  const passwords = JSON.parse(localStorage.getItem('resolutio_passwords') || '{}');
  const normalized = String(email).toLowerCase();
  if (session.role === 'admin') {
    passwords.admin = password;
  } else if (session.role === 'funcionario') {
    passwords['funcionario:' + normalized] = password;
  } else {
    const key = Object.keys(passwords).find(k => k.toLowerCase() === normalized) || normalized;
    passwords[key] = password;
  }
  localStorage.setItem('resolutio_passwords', JSON.stringify(passwords));
  document.getElementById('changePasswordModal').classList.remove('open');
  toast('Senha alterada com sucesso.');
}

// Mobile toggle
function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
}

// Modal helpers
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
document.addEventListener('click', (e)=>{
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

// Toast
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
