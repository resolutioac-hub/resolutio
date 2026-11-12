// === RESOLUTIO - API Layer (Supabase) ===
// Todos os dados do sistema vivem no Supabase. O navegador guarda apenas a
// sessao do usuario (role/user) e uma flag de migracao dos dados antigos.

// ====== CONFIGURACAO DO SUPABASE ======
// A chave abaixo e a "publishable key" (publica por design). Nunca use a
// service_role/secret key no frontend.
window.RESOLUTIO_SUPABASE = Object.assign(
  { url: 'https://exrrxnxzrxxxcvczacut.supabase.co', anonKey: 'sb_publishable_EfB1PLs4MgfQSm0BRMfvOQ_0uAlkdtn' },
  window.RESOLUTIO_SUPABASE || {}
);

const SUPABASE_URL = String(window.RESOLUTIO_SUPABASE.url || '').replace(/\/+$/, '');
const SUPABASE_KEY = String(window.RESOLUTIO_SUPABASE.anonKey || '');
const SB_ENABLED = /^https?:\/\//i.test(SUPABASE_URL) && Boolean(SUPABASE_KEY);
const SB_HEADERS = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
// Chaves antigas (anon/service_role) sao JWT e tambem precisam do Authorization.
// A publishable key (`sb_publishable_...`) vai apenas no header `apikey`.
if (/^eyJ/.test(SUPABASE_KEY)) SB_HEADERS.Authorization = 'Bearer ' + SUPABASE_KEY;

const enc = encodeURIComponent;
const MIGRATION_KEY = 'resolutio_migrated_v3';

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch {}
}

async function sbFetch(path, opts = {}) {
  const headers = { ...SB_HEADERS };
  if (opts.prefer) headers.Prefer = opts.prefer;
  const res = await fetch(SUPABASE_URL + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  if (!res.ok) {
    let detail = '';
    try {
      const payload = await res.json();
      detail = payload.message || payload.error_description || payload.error || JSON.stringify(payload);
    } catch {
      try { detail = await res.text(); } catch {}
    }
    const err = new Error(detail || ('HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function rpc(name, body) {
  return sbFetch('/rest/v1/rpc/' + name, { method: 'POST', body: body || {} });
}

// ---------- Registros (document store) ----------
function flattenRecord(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return { ...data, id: data.id || row.id };
}
function recordRows(collection, order = 'created_at.asc') {
  return sbFetch('/rest/v1/app_records?collection=eq.' + enc(collection) + '&select=id,data&order=' + order);
}
async function listRecords(collection, order = 'created_at.asc') {
  const rows = await recordRows(collection, order);
  return (rows || []).map(flattenRecord);
}
async function getRecord(collection, id) {
  if (id === undefined || id === null || id === '') return null;
  const rows = await sbFetch('/rest/v1/app_records?collection=eq.' + enc(collection) + '&id=eq.' + enc(String(id)) + '&select=id,data&limit=1');
  return rows && rows.length ? flattenRecord(rows[0]) : null;
}
async function putRecord(collection, id, data) {
  const recordId = String(id);
  const payload = { ...(data || {}), id: recordId };
  await sbFetch('/rest/v1/app_records?on_conflict=collection,id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{ collection, id: recordId, data: payload, updated_at: new Date().toISOString() }]
  });
  return payload;
}
async function upsertRows(rows) {
  if (!rows || !rows.length) return;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map(row => ({
      collection: row.collection,
      id: String(row.id),
      data: { ...(row.data || {}), id: String(row.id) },
      updated_at: new Date().toISOString()
    }));
    await sbFetch('/rest/v1/app_records?on_conflict=collection,id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: chunk
    });
  }
}
async function updateRecord(collection, id, patch) {
  const current = await getRecord(collection, id);
  if (!current) throw new Error('Registro nao encontrado.');
  const next = { ...current, ...patch, id: current.id };
  await putRecord(collection, id, next);
  return next;
}
async function deleteRecord(collection, id) {
  await sbFetch('/rest/v1/app_records?collection=eq.' + enc(collection) + '&id=eq.' + enc(String(id)), {
    method: 'DELETE',
    prefer: 'return=minimal'
  });
  return true;
}

// ---------- Arquivos (Supabase Storage) ----------
function storagePublicUrl(path) {
  return SUPABASE_URL + '/storage/v1/object/public/documentos/' + String(path || '').split('/').map(enc).join('/');
}
function safeFileName(name) {
  return String(name || 'arquivo')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(-120) || 'arquivo';
}
async function storageUpload(path, file) {
  const headers = {
    apikey: SUPABASE_KEY,
    'x-upsert': 'true',
    'Content-Type': (file && file.type) || 'application/octet-stream'
  };
  if (/^eyJ/.test(SUPABASE_KEY)) headers.Authorization = 'Bearer ' + SUPABASE_KEY;
  const res = await fetch(SUPABASE_URL + '/storage/v1/object/documentos/' + path.split('/').map(enc).join('/'), {
    method: 'POST',
    headers,
    body: file
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch {}
    throw new Error(detail || 'Falha ao enviar arquivo (HTTP ' + res.status + ').');
  }
  return path;
}
async function storageRemove(path) {
  if (!path) return false;
  const headers = { apikey: SUPABASE_KEY };
  if (/^eyJ/.test(SUPABASE_KEY)) headers.Authorization = 'Bearer ' + SUPABASE_KEY;
  const res = await fetch(SUPABASE_URL + '/storage/v1/object/documentos/' + String(path).split('/').map(enc).join('/'), {
    method: 'DELETE',
    headers
  });
  if (!res.ok && res.status !== 404) {
    console.warn('[Resolutio] Falha ao remover arquivo', path, res.status);
  }
  return true;
}
async function salvarArquivo(prefixo, id, file) {
  const path = `${prefixo}/${id}/${Date.now()}_${safeFileName(file && file.name)}`;
  await storageUpload(path, file);
  return {
    arquivo_path: path,
    arquivo_nome: (file && file.name) || 'arquivo',
    arquivo_tipo: (file && file.type) || 'application/octet-stream',
    arquivo_tamanho: (file && file.size) || 0,
    arquivo: (file && file.name) || 'arquivo'
  };
}
function ehArquivo(v) {
  if (!v) return false;
  if (typeof File !== 'undefined' && v instanceof File) return true;
  return typeof Blob !== 'undefined' && v instanceof Blob;
}
async function abrirArquivo(registro, nomeAlternativo) {
  if (!registro) return null;
  if (registro.arquivo_path) return storagePublicUrl(registro.arquivo_path);
  const chave = registro.arquivo_chave || registro.pdf_chave;
  if (chave && window.FileStore) {
    const local = await window.FileStore.url(chave).catch(() => null);
    if (local) return local;
  }
  const legado = registro.pdf_data;
  if (typeof legado === 'string' && legado.startsWith('data:')) return legado;
  const externo = registro.url || (nomeAlternativo && /^(https?:)?\/\//.test(nomeAlternativo) ? nomeAlternativo : '');
  return externo || null;
}
async function baixarArquivo(registro, nomeAlternativo) {
  const url = await abrirArquivo(registro, nomeAlternativo);
  if (!url) throw new Error('Este registro nao possui arquivo anexado.');
  const a = document.createElement('a');
  a.href = url;
  a.download = (registro.arquivo_nome || registro.pdf_nome || registro.arquivo || nomeAlternativo || 'documento');
  document.body.appendChild(a);
  a.click();
  a.remove();
  return url;
}
async function removerArquivoDoRegistro(registro) {
  if (!registro) return;
  if (registro.arquivo_path) await storageRemove(registro.arquivo_path).catch(() => {});
  const chave = registro.arquivo_chave || registro.pdf_chave;
  if (chave && window.FileStore) await window.FileStore.delete(chave).catch(() => {});
}
async function migrarArquivoLegado(collection, registro, prefixo) {
  if (!registro || registro.arquivo_path || !registro.arquivo_chave || !window.FileStore) return registro;
  try {
    const local = await window.FileStore.get(registro.arquivo_chave);
    if (!local || !local.blob) return registro;
    const nome = local.nome || registro.arquivo_nome || registro.pdf_nome || 'documento';
    let file = local.blob;
    if (typeof File !== 'undefined') {
      try { file = new File([local.blob], nome, { type: local.tipo || local.blob.type }); } catch {}
    }
    const meta = await salvarArquivo(prefixo, registro.id, file);
    const atualizado = await updateRecord(collection, registro.id, meta);
    await window.FileStore.delete(registro.arquivo_chave).catch(() => {});
    return atualizado;
  } catch (err) {
    console.warn('[Resolutio] Nao foi possivel migrar arquivo local', registro.id, err);
    return registro;
  }
}

// ---------- Migracao dos dados antigos do navegador ----------
const DB_COLLECTIONS = ['leads', 'clientes', 'funcionarios', 'solicitacoesFuncionarios', 'encontros', 'pagamentos', 'despesas', 'contratos', 'materiais'];

function normalizarLead(data) {
  const out = { ...(data || {}) };
  if (out.estagio && !out.status) out.status = out.estagio;
  if (out.status && !out.estagio) out.estagio = out.status;
  return out;
}
function dbRows(db) {
  const rows = [];
  DB_COLLECTIONS.forEach(collection => {
    const list = Array.isArray(db && db[collection]) ? db[collection] : [];
    list.forEach(item => {
      const id = String(item && item.id ? item.id : uid('m'));
      const data = collection === 'leads' ? normalizarLead(item) : { ...(item || {}) };
      rows.push({ collection, id, data: { ...data, id } });
    });
  });
  return rows;
}
async function migrarPasswords(passwords, db) {
  const listaClientes = Array.isArray(db && db.clientes) ? db.clientes : [];
  const porCpf = digitos => listaClientes.find(c => String(c.cpf || '').replace(/\D/g, '') === digitos);
  const entries = Object.entries(passwords || {});
  for (const [key, value] of entries) {
    if (!value) continue;
    if (key === 'admin' || key === 'admin@resolutio.com' || key.startsWith('admin:')) {
      await rpc('save_password', { p_email: 'admin@resolutio.com', p_password: String(value) });
    } else if (key.startsWith('funcionario:')) {
      await rpc('save_password', { p_email: key.slice('funcionario:'.length), p_password: String(value) });
    } else if (key.startsWith('cpf:')) {
      const cliente = porCpf(key.slice('cpf:'.length).replace(/\D/g, ''));
      if (cliente && cliente.email) await rpc('save_password', { p_email: cliente.email, p_password: String(value), p_cpf: cliente.cpf || null });
    } else if (key.includes('@')) {
      await rpc('save_password', { p_email: key, p_password: String(value) });
    }
  }
}
async function migrarSlots(slots) {
  const rows = [];
  Object.keys(slots || {}).forEach(date => {
    (Array.isArray(slots[date]) ? slots[date] : []).forEach(slot => {
      if (!slot || !slot.time) return;
      rows.push({ collection: 'slots', id: date + '|' + slot.time, data: { id: date + '|' + slot.time, date, time: slot.time, duration: slot.duration || 60 } });
    });
  });
  await upsertRows(rows);
}
async function migrarReminders(reminders) {
  const rows = (Array.isArray(reminders) ? reminders : []).map(item => {
    const id = String(item && item.id ? item.id : uid('r'));
    return { collection: 'reminders', id, data: { ...(item || {}), id } };
  });
  await upsertRows(rows);
}
async function migrarEstadoAntigo(db, passwords) {
  await upsertRows(dbRows(db));
  if (passwords) await migrarPasswords(passwords, db);
}
function limparChavesAntigas() {
  const fixas = new Set([
    'resolutio_db', 'resolutio_passwords', 'resolutio_admin_login', 'resolutio_reminders',
    'resolutio_slots', 'resolutio_role', 'resolutio_user', 'resolutio_session_version',
    'supabase_url', 'supabase_anon_key'
  ]);
  const remover = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (fixas.has(key) || key.startsWith('overview_') || key.startsWith('pay_link_')) remover.push(key);
    }
  } catch {}
  remover.forEach(lsRemove);
}
async function migrarDadosLegados() {
  if (lsGet(MIGRATION_KEY) === '1') return;
  let dbLocal = null;
  let senhasLocais = null;
  let temDados = false;

  // 1) Dados que a versao anterior possa ter enviado para app_state.
  let appState = [];
  try {
    appState = await sbFetch('/rest/v1/app_state?select=key,data') || [];
  } catch (err) {
    appState = [];
  }
  if (Array.isArray(appState) && appState.length) {
    const rowDb = appState.find(r => r.key === 'resolutio_db');
    if (rowDb && rowDb.data) {
      await upsertRows(dbRows(rowDb.data));
      temDados = true;
    }
    const rowPasswords = appState.find(r => r.key === 'resolutio_passwords');
    if (rowPasswords && rowPasswords.data) {
      await migrarPasswords(rowPasswords.data, rowDb && rowDb.data);
      temDados = true;
    }
    const rowSlots = appState.find(r => r.key === 'resolutio_slots');
    if (rowSlots && rowSlots.data) { await migrarSlots(rowSlots.data); temDados = true; }
    const rowReminders = appState.find(r => r.key === 'resolutio_reminders');
    if (rowReminders && rowReminders.data) { await migrarReminders(rowReminders.data); temDados = true; }
    const rowAdmin = appState.find(r => r.key === 'resolutio_admin_login');
    if (rowAdmin && rowAdmin.data) { await putRecord('settings', 'admin_login', { value: rowAdmin.data }); temDados = true; }
    for (const row of appState) {
      if (typeof row.key === 'string' && row.key.startsWith('overview_')) {
        await putRecord('overview', row.key.slice('overview_'.length), { entries: Array.isArray(row.data) ? row.data : [] });
        temDados = true;
      }
      if (typeof row.key === 'string' && row.key.startsWith('pay_link_')) {
        await putRecord('pay_links', row.key.slice('pay_link_'.length), { link: String(row.data || '') });
        temDados = true;
      }
    }
  }

  // 2) Dados do navegador (versao anterior). Sempre tem prioridade sobre app_state.
  const rawDb = lsGet('resolutio_db');
  if (rawDb) {
    try { dbLocal = JSON.parse(rawDb); } catch { dbLocal = null; }
    if (dbLocal) { await upsertRows(dbRows(dbLocal)); temDados = true; }
  }
  const rawPasswords = lsGet('resolutio_passwords');
  if (rawPasswords) {
    try { senhasLocais = JSON.parse(rawPasswords); } catch { senhasLocais = null; }
    if (senhasLocais) { await migrarPasswords(senhasLocais, dbLocal); temDados = true; }
  }
  const rawSlots = lsGet('resolutio_slots');
  if (rawSlots) {
    try { await migrarSlots(JSON.parse(rawSlots)); temDados = true; } catch {}
  }
  const rawReminders = lsGet('resolutio_reminders');
  if (rawReminders) {
    try { await migrarReminders(JSON.parse(rawReminders)); temDados = true; } catch {}
  }
  const adminLogin = lsGet('resolutio_admin_login');
  if (adminLogin) { await putRecord('settings', 'admin_login', { value: adminLogin }); temDados = true; }

  const extras = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('overview_') || key.startsWith('pay_link_')) extras.push(key);
    }
  } catch {}
  for (const key of extras) {
    const raw = lsGet(key);
    if (raw === null) continue;
    if (key.startsWith('overview_')) {
      try { await putRecord('overview', key.slice('overview_'.length), { entries: JSON.parse(raw) || [] }); temDados = true; } catch {}
    } else {
      await putRecord('pay_links', key.slice('pay_link_'.length), { link: raw }); temDados = true;
    }
  }

  limparChavesAntigas();
  lsSet(MIGRATION_KEY, '1');
}

async function migrarArquivosLocais() {
  if (!window.FileStore) return;
  for (const [collection, prefixo] of [['contratos', 'contrato'], ['materiais', 'material']]) {
    let items = [];
    try { items = await listRecords(collection, 'created_at.desc'); } catch { continue; }
    for (const item of items) {
      if (item.arquivo_chave && !item.arquivo_path) {
        await migrarArquivoLegado(collection, item, prefixo);
      }
    }
  }
}

// ---------- Pronto / status ----------
const ResolutioCloud = {
  enabled: SB_ENABLED,
  online: false,
  ready: null,
  push() { return Promise.resolve(); },
  shouldSync() { return false; },
  async ping() {
    try {
      await sbFetch('/rest/v1/app_records?select=collection&limit=1');
      this.online = true;
    } catch (err) {
      console.error('[Resolutio] Supabase indisponivel:', err);
      this.online = false;
    }
    return this.online;
  }
};

ResolutioCloud.ready = (async () => {
  if (!SB_ENABLED) return;
  try {
    await migrarDadosLegados();
  } catch (err) {
    console.error('[Resolutio] Falha ao migrar dados antigos. Tentaremos novamente no proximo acesso.', err);
  }
  await ResolutioCloud.ping();
  if (ResolutioCloud.online) {
    setTimeout(() => { migrarArquivosLocais().catch(() => {}); }, 1200);
  }
})();
window.ResolutioCloud = ResolutioCloud;

// ---------- API ----------
const API = {
  leads: {
    list() { return listRecords('leads', 'created_at.desc'); },
    async create(data) {
      const id = data && data.id ? String(data.id) : uid('l');
      const lead = normalizarLead({
        id,
        created_at: today(),
        data_primeiro_contato: today(),
        data_criacao: today(),
        status: 'novo',
        ...(data || {}),
        id
      });
      if (!lead.data_primeiro_contato) lead.data_primeiro_contato = today();
      if (!lead.data_criacao) lead.data_criacao = lead.data_primeiro_contato;
      if (!lead.estagio) lead.estagio = lead.status;
      return putRecord('leads', id, lead);
    },
    async update(id, patch) {
      const current = await getRecord('leads', id);
      if (!current) throw new Error('Lead nao encontrado.');
      const next = normalizarLead({ ...current, ...(patch || {}), id: current.id });
      await putRecord('leads', id, next);
      return next;
    },
    remove(id) { return deleteRecord('leads', id); }
  },

  clientes: {
    list() { return listRecords('clientes', 'created_at.asc'); },
    async create(data) {
      const email = String((data && data.email) || '').trim();
      if (!email) throw new Error('Informe o e-mail do cliente.');
      const existentes = await listRecords('clientes');
      if (existentes.some(item => String(item.email || '').toLowerCase() === email.toLowerCase())) {
        throw new Error('Ja existe um cliente com este e-mail.');
      }
      const id = data && data.id ? String(data.id) : uid('c');
      const nome = String((data && data.nome) || '');
      const cliente = {
        id,
        status: 'ativo',
        progresso: 0,
        pilar_atual: 1,
        pendencias: [],
        proximo_encontro: '-',
        avatar: nome.split(' ').filter(Boolean).map(word => word[0]).join('').slice(0, 2).toUpperCase(),
        created_at: today(),
        ...(data || {}),
        id
      };
      return putRecord('clientes', id, cliente);
    },
    get(id) { return getRecord('clientes', id); },
    async update(id, patch) {
      const current = await getRecord('clientes', id);
      if (!current) throw new Error('Cliente nao encontrado.');
      const next = { ...current, ...(patch || {}), id: current.id };
      const emailAntigo = String(current.email || '').toLowerCase();
      const emailNovo = String(next.email || '').toLowerCase();
      await putRecord('clientes', id, next);
      if (emailAntigo && emailNovo && emailAntigo !== emailNovo) {
        await rpc('move_password', { p_old_email: emailAntigo, p_new_email: emailNovo }).catch(err => {
          console.warn('[Resolutio] Nao foi possivel mover a senha do cliente', err);
        });
      }
      return next;
    },
    async remove(id, nome) {
      let alvo = id ? await getRecord('clientes', id).catch(() => null) : null;
      if (!alvo) {
        const lista = await listRecords('clientes');
        alvo = lista.find(c => c.id === id || c.nome === nome || c.nome === id) || null;
      }
      if (!alvo) throw new Error('Cliente nao encontrado.');
      const nomeRef = alvo.nome;
      const emailRef = String(alvo.email || '').toLowerCase();
      const combina = row => row.cliente === nomeRef || (emailRef && String(row.cliente || '').toLowerCase() === emailRef);

      for (const collection of ['encontros', 'pagamentos', 'contratos', 'materiais', 'reminders']) {
        const itens = await listRecords(collection).catch(() => []);
        const alvos = itens.filter(combina);
        for (const item of alvos) {
          if (collection === 'contratos' || collection === 'materiais') await removerArquivoDoRegistro(item);
          await deleteRecord(collection, item.id).catch(() => {});
        }
      }
      await deleteRecord('overview', nomeRef).catch(() => {});
      await rpc('delete_password', { p_email: emailRef, p_cpf: alvo.cpf || null }).catch(() => {});
      await deleteRecord('clientes', alvo.id);
      return true;
    }
  },

  funcionarios: {
    list() { return listRecords('funcionarios', 'created_at.asc'); },
    async create(data) {
      const email = String((data && data.email) || '').trim();
      if (!email) throw new Error('Informe o e-mail do funcionario.');
      const existentes = await listRecords('funcionarios');
      if (existentes.some(item => String(item.email || '').toLowerCase() === email.toLowerCase())) {
        throw new Error('Ja existe um funcionario com este e-mail.');
      }
      const { senha, ...resto } = data || {};
      const id = resto.id ? String(resto.id) : uid('f');
      const funcionario = { id, ativo: true, clientes: 0, created_at: today(), ...resto, id };
      await putRecord('funcionarios', id, funcionario);
      if (senha) await rpc('save_password', { p_email: email, p_password: String(senha) });
      return funcionario;
    },
    async remove(id) {
      const alvo = await getRecord('funcionarios', id);
      if (!alvo) throw new Error('Funcionario nao encontrado.');
      await rpc('delete_password', { p_email: alvo.email || '', p_cpf: null }).catch(() => {});
      await deleteRecord('funcionarios', id);
      return true;
    },
    requests() { return listRecords('solicitacoesFuncionarios', 'created_at.desc'); },
    async request(data) {
      const email = String((data && data.email) || '').trim();
      if (!email) throw new Error('Informe o e-mail.');
      const existentes = await listRecords('solicitacoesFuncionarios');
      if (existentes.some(item => String(item.email || '').toLowerCase() === email.toLowerCase() && item.status === 'pendente')) {
        throw new Error('Ja existe uma solicitacao pendente para este e-mail.');
      }
      const id = data && data.id ? String(data.id) : uid('sr');
      const request = { id, status: 'pendente', created_at: new Date().toISOString(), ...(data || {}), id };
      return putRecord('solicitacoesFuncionarios', id, request);
    },
    async approveRequest(id, data) {
      const request = await getRecord('solicitacoesFuncionarios', id);
      if (!request) throw new Error('Solicitacao nao encontrada.');
      const funcionario = await API.funcionarios.create({
        nome: request.nome,
        email: request.email,
        senha: request.senha,
        funcao: data && data.funcao,
        cargo: data && data.cargo
      });
      await updateRecord('solicitacoesFuncionarios', id, {
        status: 'aprovada',
        funcao: data && data.funcao,
        cargo: data && data.cargo,
        updated_at: new Date().toISOString()
      });
      return funcionario;
    },
    async rejectRequest(id) {
      return updateRecord('solicitacoesFuncionarios', id, { status: 'recusada', updated_at: new Date().toISOString() });
    },
    async update(id, patch) {
      const current = await getRecord('funcionarios', id);
      if (!current) throw new Error('Funcionario nao encontrado.');
      const { senha, ...resto } = patch || {};
      const next = { ...current, ...resto, id: current.id };
      const emailAntigo = String(current.email || '').toLowerCase();
      const emailNovo = String(next.email || '').toLowerCase();
      await putRecord('funcionarios', id, next);
      if (senha) await rpc('save_password', { p_email: emailNovo, p_password: String(senha) });
      if (emailAntigo && emailNovo && emailAntigo !== emailNovo) {
        await rpc('move_password', { p_old_email: emailAntigo, p_new_email: emailNovo }).catch(() => {});
      }
      return next;
    }
  },

  encontros: {
    list() { return listRecords('encontros', 'created_at.desc'); },
    async create(data) {
      const id = data && data.id ? String(data.id) : uid('e');
      const encontro = { id, status: 'agendado', created_at: today(), ...(data || {}), id };
      await putRecord('encontros', id, encontro);
      return encontro;
    },
    update(id, patch) { return updateRecord('encontros', id, patch); },
    remove(id) { return deleteRecord('encontros', id); }
  },

  pagamentos: {
    list() { return listRecords('pagamentos', 'created_at.desc'); },
    async create(data) {
      const id = data && data.id ? String(data.id) : uid('p');
      const pagamento = { id, status: 'pendente', data: today(), created_at: today(), ...(data || {}), id };
      await putRecord('pagamentos', id, pagamento);
      return pagamento;
    },
    update(id, patch) { return updateRecord('pagamentos', id, patch); },
    remove(id) { return deleteRecord('pagamentos', id); }
  },

  financeiro: {
    list() { return API.pagamentos.list(); },
    create(data) { return API.pagamentos.create(data); },
    update(id, patch) { return API.pagamentos.update(id, patch); },
    remove(id) { return API.pagamentos.remove(id); }
  },

  despesas: {
    list() { return listRecords('despesas', 'created_at.desc'); },
    async create(data) {
      const id = data && data.id ? String(data.id) : uid('d');
      const despesa = { id, created_at: today(), ...(data || {}), id };
      await putRecord('despesas', id, despesa);
      return despesa;
    },
    update(id, patch) { return updateRecord('despesas', id, patch); },
    remove(id) { return deleteRecord('despesas', id); }
  },

  contratos: {
    list() { return listRecords('contratos', 'created_at.desc'); },
    async create(data) {
      const { _arquivo, ...resto } = data || {};
      const id = resto.id ? String(resto.id) : uid('ct');
      const contrato = {
        id,
        status: 'rascunho',
        enviado_em: '-',
        assinado_em: '-',
        data_criacao: new Date().toISOString(),
        created_at: today(),
        ...resto,
        id
      };
      if (ehArquivo(_arquivo)) {
        Object.assign(contrato, await salvarArquivo('contrato', id, _arquivo));
        contrato.pdf_nome = contrato.arquivo_nome;
      } else if (contrato.pdf_nome && !contrato.arquivo) {
        contrato.arquivo = contrato.pdf_nome;
      }
      await putRecord('contratos', id, contrato);
      return contrato;
    },
    async update(id, patch) {
      const current = await getRecord('contratos', id);
      if (!current) throw new Error('Contrato nao encontrado.');
      const { _arquivo, ...resto } = patch || {};
      const next = { ...current, ...resto, id: current.id };
      if (ehArquivo(_arquivo)) {
        await removerArquivoDoRegistro(current);
        Object.assign(next, await salvarArquivo('contrato', id, _arquivo));
        next.pdf_nome = next.arquivo_nome;
      }
      await putRecord('contratos', id, next);
      return next;
    },
    get(id) { return getRecord('contratos', id); },
    temArquivo(c) {
      if (!c) return false;
      return !!(c.arquivo_path || c.arquivo_chave || c.pdf_chave || (typeof c.pdf_data === 'string' && c.pdf_data.startsWith('data:')) || c.url);
    },
    async abrirArquivo(id) {
      const c = await getRecord('contratos', id);
      if (!this.temArquivo(c)) throw new Error('Contrato sem PDF anexado.');
      return abrirArquivo(c, c.pdf_nome || c.arquivo);
    },
    async baixarArquivo(id) {
      const c = await getRecord('contratos', id);
      return baixarArquivo(c, c.pdf_nome || c.arquivo);
    },
    async remove(id) {
      const alvo = await getRecord('contratos', id);
      if (alvo) await removerArquivoDoRegistro(alvo);
      await deleteRecord('contratos', id);
      return true;
    }
  },

  materiais: {
    list() { return listRecords('materiais', 'created_at.desc'); },
    async create(data) {
      const { _arquivo, ...resto } = data || {};
      const id = resto.id ? String(resto.id) : uid('m');
      const material = { id, data: today(), created_at: today(), ...resto, id };
      if (ehArquivo(_arquivo)) {
        Object.assign(material, await salvarArquivo('material', id, _arquivo));
        material.arquivo = material.arquivo_nome;
        if (!material.titulo) material.titulo = material.arquivo_nome;
      } else if (!material.arquivo && !material.url) {
        material.arquivo = 'sem-arquivo';
      }
      await putRecord('materiais', id, material);
      return material;
    },
    async update(id, patch) {
      const current = await getRecord('materiais', id);
      if (!current) throw new Error('Material nao encontrado.');
      const { _arquivo, ...resto } = patch || {};
      const next = { ...current, ...resto, id: current.id };
      if (ehArquivo(_arquivo)) {
        await removerArquivoDoRegistro(current);
        Object.assign(next, await salvarArquivo('material', id, _arquivo));
        next.arquivo = next.arquivo_nome;
      }
      await putRecord('materiais', id, next);
      return next;
    },
    temArquivo(m) {
      if (!m) return false;
      return !!(m.arquivo_path || m.arquivo_chave || m.url);
    },
    async abrirArquivo(id) {
      const m = await getRecord('materiais', id);
      const url = await abrirArquivo(m, m && m.arquivo);
      if (!url) throw new Error('Material sem arquivo anexado.');
      return url;
    },
    async baixarArquivo(id) {
      const m = await getRecord('materiais', id);
      if (!m) throw new Error('Material nao encontrado.');
      return baixarArquivo(m, m.arquivo);
    },
    async remove(id) {
      const alvo = await getRecord('materiais', id);
      if (alvo) await removerArquivoDoRegistro(alvo);
      await deleteRecord('materiais', id);
      return true;
    }
  },

  overview: {
    async list(cliente) {
      const row = await getRecord('overview', cliente);
      return row && Array.isArray(row.entries) ? row.entries : [];
    },
    async create(cliente, texto) {
      const entries = await this.list(cliente);
      const entry = { data: today(), texto };
      entries.push(entry);
      await putRecord('overview', cliente, { entries });
      return entry;
    },
    async remove(cliente, index) {
      const entries = await this.list(cliente);
      entries.splice(index, 1);
      await putRecord('overview', cliente, { entries });
      return true;
    }
  },

  reminders: {
    list() { return listRecords('reminders', 'created_at.desc'); },
    async create(data) {
      const id = data && data.id ? String(data.id) : uid('r');
      const reminder = { id, created_at: today(), ...(data || {}), id };
      await putRecord('reminders', id, reminder);
      return reminder;
    },
    remove(id) { return deleteRecord('reminders', id); }
  },

  slots: {
    list() { return listRecords('slots', 'created_at.asc'); },
    async map() {
      const items = await this.list();
      const out = {};
      items.forEach(slot => {
        if (!slot || !slot.date || !slot.time) return;
        if (!out[slot.date]) out[slot.date] = [];
        out[slot.date].push({ time: slot.time, duration: slot.duration || 60 });
      });
      Object.keys(out).forEach(date => out[date].sort((a, b) => a.time.localeCompare(b.time)));
      return out;
    },
    async replaceAll(mapa) {
      const atuais = await this.list();
      const desejados = [];
      Object.keys(mapa || {}).forEach(date => {
        (Array.isArray(mapa[date]) ? mapa[date] : []).forEach(slot => {
          if (!slot || !slot.time) return;
          desejados.push({
            collection: 'slots',
            id: date + '|' + slot.time,
            data: { id: date + '|' + slot.time, date, time: slot.time, duration: slot.duration || 60 }
          });
        });
      });
      const idsDesejados = new Set(desejados.map(item => item.id));
      await upsertRows(desejados);
      const remover = atuais.filter(item => !idsDesejados.has(item.id));
      await Promise.all(remover.map(item => deleteRecord('slots', item.id).catch(() => {})));
      return true;
    },
    remove(date, time) {
      return deleteRecord('slots', date + '|' + time);
    }
  },

  settings: {
    async get(key) {
      const row = await getRecord('settings', key);
      return row && Object.prototype.hasOwnProperty.call(row, 'value') ? row.value : null;
    },
    async set(key, value) {
      return putRecord('settings', key, { value });
    },
    remove(key) { return deleteRecord('settings', key); }
  },

  payLinks: {
    async list() {
      const items = await listRecords('pay_links', 'created_at.desc');
      return items.map(item => ({ id: item.id, link: item.link || item.value || '' }));
    },
    set(pagId, link) { return putRecord('pay_links', pagId, { link }); },
    remove(pagId) { return deleteRecord('pay_links', pagId); }
  },

  auth: {
    verify(identifier, password) {
      return rpc('verify_credentials', { p_identifier: identifier, p_password: password });
    },
    savePassword(email, password, cpf) {
      return rpc('save_password', { p_email: email, p_password: password, p_cpf: cpf || null });
    },
    deletePassword(email, cpf) {
      return rpc('delete_password', { p_email: email || '', p_cpf: cpf || null });
    },
    movePassword(oldEmail, newEmail) {
      return rpc('move_password', { p_old_email: oldEmail, p_new_email: newEmail });
    }
  },

  supabaseQuery(table, opts = {}) {
    const query = opts.query || 'select=*';
    return sbFetch('/rest/v1/' + table + '?' + query);
  }
};

// Aguarda a migracao/verificacao inicial antes de qualquer operacao.
const API_GRUPOS = ['leads', 'clientes', 'funcionarios', 'encontros', 'pagamentos', 'financeiro', 'despesas', 'contratos', 'materiais', 'overview', 'reminders', 'slots', 'settings', 'payLinks', 'auth'];
API_GRUPOS.forEach(grupo => {
  const apiGrupo = API[grupo];
  if (!apiGrupo) return;
  Object.keys(apiGrupo).forEach(nome => {
    const original = apiGrupo[nome];
    if (typeof original !== 'function' || nome === 'temArquivo') return;
    apiGrupo[nome] = function (...args) {
      return ResolutioCloud.ready.then(() => original.apply(this, args));
    };
  });
});

window.API = API;
