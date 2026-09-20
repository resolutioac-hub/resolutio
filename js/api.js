// === RESOLUTIO - API Layer ===
// Preparado para Supabase. Por enquanto usa localStorage (mock).
// Quando o token for fornecido, trocar `USE_MOCK = false` e configurar `SUPABASE_URL` + `SUPABASE_ANON_KEY`.

const USE_MOCK = true;
const SUPABASE_URL = localStorage.getItem('supabase_url') || '';
const SUPABASE_ANON_KEY = localStorage.getItem('supabase_anon_key') || '';

// ---------- Mock Database (persistido em localStorage) ----------
// Versão definitiva: sem dados de demonstração. Tudo é cadastrado manualmente.
const DB_VERSION = 'v2-definitiva';
const defaultData = {
  leads: [],
  clientes: [],
  funcionarios: [],
  solicitacoesFuncionarios: [],
  encontros: [],
  pagamentos: [],
  despesas: [],
  contratos: [],
  materiais: []
};

function seedDB() {
  const db = JSON.parse(JSON.stringify(defaultData));
  db._version = DB_VERSION;
  localStorage.setItem('resolutio_db', JSON.stringify(db));
  // reset definitivo: nenhum usuário cadastrado além do admin
  localStorage.removeItem('resolutio_passwords');
  return db;
}
function getDB() {
  const raw = localStorage.getItem('resolutio_db');
  if (!raw) return seedDB();
  try {
    const db = JSON.parse(raw);
    if (db._version !== DB_VERSION) return seedDB();
    return db;
  } catch { return seedDB(); }
}
function saveDB(db) { localStorage.setItem('resolutio_db', JSON.stringify(db)); }

const API = {
  // Leads
  leads: {
    list() { return Promise.resolve(getDB().leads); },
    create(data) {
      const db = getDB();
      const lead = { id: String(Date.now()), created_at: new Date().toISOString().slice(0,10), ...data };
      db.leads.unshift(lead); saveDB(db); return Promise.resolve(lead);
    },
    update(id, patch) {
      const db = getDB();
      const idx = db.leads.findIndex(l=>l.id===id);
      if(idx>=0){ db.leads[idx]={...db.leads[idx], ...patch}; saveDB(db); }
      return Promise.resolve(db.leads[idx]);
    },
    remove(id) {
      const db=getDB(); db.leads=db.leads.filter(l=>l.id!==id); saveDB(db); return Promise.resolve(true);
    }
  },
  clientes: {
    list() { return Promise.resolve(getDB().clientes); },
    create(data) {
      const db = getDB();
      db.clientes = db.clientes || [];
      if (db.clientes.some(item => item.email && item.email.toLowerCase() === data.email.toLowerCase())) return Promise.reject(new Error('Já existe um cliente com este e-mail.'));
      const cliente = { id:'c'+Date.now(), status:'ativo', progresso:0, pilar_atual:1, pendencias:[], proximo_encontro:'—', avatar:data.nome.split(' ').map(word=>word[0]).join('').slice(0,2).toUpperCase(), ...data };
      db.clientes.push(cliente); saveDB(db); return Promise.resolve(cliente);
    },
    get(id) { return Promise.resolve(getDB().clientes.find(c=>c.id===id)); },
    update(id, patch) {
      const db = getDB();
      const idx = db.clientes.findIndex(c=>c.id===id);
      if (idx < 0) return Promise.reject(new Error('Cliente não encontrado.'));
      db.clientes[idx] = { ...db.clientes[idx], ...patch };
      saveDB(db); return Promise.resolve(db.clientes[idx]);
    }
  },
  funcionarios: {
    list(){ return Promise.resolve(getDB().funcionarios || []); },
    create(data) {
      const db = getDB();
      db.funcionarios = db.funcionarios || [];
      if (db.funcionarios.some(item => item.email.toLowerCase() === data.email.toLowerCase())) return Promise.reject(new Error('Já existe um funcionário com este e-mail.'));
      const funcionario = { id:'f'+Date.now(), ativo:true, clientes:0, ...data };
      db.funcionarios.push(funcionario); saveDB(db); return Promise.resolve(funcionario);
    },
    remove(id) {
      const db = getDB();
      db.funcionarios = db.funcionarios || [];
      const idx = db.funcionarios.findIndex(f => f.id === id);
      if (idx < 0) return Promise.reject(new Error('Funcionário não encontrado.'));
      db.funcionarios.splice(idx, 1);
      saveDB(db);
      // Remove senha armazenada
      const passwords = JSON.parse(localStorage.getItem('resolutio_passwords') || '{}');
      delete passwords['funcionario:' + id];
      localStorage.setItem('resolutio_passwords', JSON.stringify(passwords));
      return Promise.resolve(true);
    },
    requests(){ return Promise.resolve(getDB().solicitacoesFuncionarios || []); },
    request(data) {
      const db = getDB();
      if (!db.solicitacoesFuncionarios) db.solicitacoesFuncionarios = [];
      const existing = db.solicitacoesFuncionarios.find(item => item.email === data.email && item.status === 'pendente');
      if (existing) return Promise.reject(new Error('Já existe uma solicitação pendente para este e-mail.'));
      const request = { id:'sr'+Date.now(), status:'pendente', created_at:new Date().toISOString(), ...data };
      db.solicitacoesFuncionarios.unshift(request); saveDB(db); return Promise.resolve(request);
    },
    approveRequest(id, data) {
      const db = getDB();
      const request = (db.solicitacoesFuncionarios || []).find(item => item.id === id);
      if (!request) return Promise.reject(new Error('Solicitação não encontrada.'));
      const funcionario = { id:'f'+Date.now(), nome:request.nome, email:request.email, cargo:data.cargo, funcao:data.funcao, ativo:true, clientes:0 };
      db.funcionarios = db.funcionarios || [];
      db.funcionarios.push(funcionario);
      request.status = 'aprovada'; request.funcao = data.funcao; request.cargo = data.cargo; request.updated_at = new Date().toISOString();
      saveDB(db); return Promise.resolve(funcionario);
    },
    rejectRequest(id) {
      const db = getDB();
      const request = (db.solicitacoesFuncionarios || []).find(item => item.id === id);
      if (!request) return Promise.reject(new Error('Solicitação não encontrada.'));
      request.status = 'recusada'; request.updated_at = new Date().toISOString(); saveDB(db); return Promise.resolve(request);
    },
    update(id, patch) {
      const db = getDB(); const idx = (db.funcionarios || []).findIndex(item => item.id === id);
      if (idx < 0) return Promise.reject(new Error('Funcionário não encontrado.'));
      db.funcionarios[idx] = { ...db.funcionarios[idx], ...patch }; saveDB(db); return Promise.resolve(db.funcionarios[idx]);
    }
  },
  encontros: { list(){ return Promise.resolve(getDB().encontros); } },
  pagamentos: {
    list(){ return Promise.resolve(getDB().pagamentos || []); },
    create(data) {
      const db = getDB();
      db.pagamentos = db.pagamentos || [];
      const pagto = { id: 'p'+Date.now(), status: data.status || 'pendente', data: data.data || new Date().toISOString().slice(0,10), ...data };
      db.pagamentos.unshift(pagto); saveDB(db); return Promise.resolve(pagto);
    },
    update(id, patch) {
      const db = getDB();
      const idx = (db.pagamentos||[]).findIndex(p=>p.id===id);
      if(idx>=0){ db.pagamentos[idx]={...db.pagamentos[idx], ...patch}; saveDB(db); }
      return Promise.resolve(db.pagamentos?.[idx]);
    },
    remove(id) {
      const db = getDB();
      db.pagamentos = (db.pagamentos||[]).filter(p=>p.id!==id);
      saveDB(db); return Promise.resolve(true);
    }
  },
  financeiro: {
    list(){ return Promise.resolve(getDB().pagamentos || []); },
    create(data) { return API.pagamentos.create(data); },
    update(id, patch) { return API.pagamentos.update(id, patch); },
    remove(id) { return API.pagamentos.remove(id); }
  },
  despesas: {
    list(){ return Promise.resolve(getDB().despesas || []); },
    create(data) {
      const db = getDB();
      if(!db.despesas) db.despesas = [];
      const despesa = { id: 'd'+Date.now(), ...data };
      db.despesas.push(despesa); saveDB(db); return Promise.resolve(despesa);
    },
    remove(id) {
      const db=getDB(); db.despesas=(db.despesas||[]).filter(d=>d.id!==id); saveDB(db); return Promise.resolve(true);
    }
  },
  contratos: {
    list(){ return Promise.resolve(getDB().contratos || []); },
    create(data) {
      const db = getDB();
      if(!db.contratos) db.contratos = [];
      const contrato = { id: 'ct'+Date.now(), status:'rascunho', enviado_em:'—', assinado_em:'—', arquivo:'—', ...data };
      db.contratos.push(contrato); saveDB(db); return Promise.resolve(contrato);
    },
    update(id, patch) {
      const db = getDB();
      const idx = (db.contratos||[]).findIndex(c=>c.id===id);
      if(idx>=0){ db.contratos[idx]={...db.contratos[idx], ...patch}; saveDB(db); }
      return Promise.resolve(db.contratos?.[idx]);
    }
  },
  materiais: {
    list(){ return Promise.resolve(getDB().materiais || []); },
    create(data) {
      const db = getDB();
      if(!db.materiais) db.materiais = [];
      const material = { id: 'm'+Date.now(), ...data };
      db.materiais.push(material); saveDB(db); return Promise.resolve(material);
    },
    remove(id) {
      const db=getDB(); db.materiais=(db.materiais||[]).filter(m=>m.id!==id); saveDB(db); return Promise.resolve(true);
    }
  },
  encontros: {
    list(){ return Promise.resolve(getDB().encontros || []); },
    create(data) {
      const db = getDB();
      if(!db.encontros) db.encontros = [];
      const encontro = { id: 'e'+Date.now(), status:'agendado', ...data };
      db.encontros.push(encontro); saveDB(db); return Promise.resolve(encontro);
    },
    update(id, patch) {
      const db = getDB();
      const idx = (db.encontros||[]).findIndex(e=>e.id===id);
      if(idx>=0){ db.encontros[idx]={...db.encontros[idx], ...patch}; saveDB(db); }
      return Promise.resolve(db.encontros?.[idx]);
    },
    remove(id) {
      const db=getDB(); db.encontros=(db.encontros||[]).filter(e=>e.id!==id); saveDB(db); return Promise.resolve(true);
    }
  },
  overview: {
    list(cliente) {
      const key = 'overview_' + cliente;
      return Promise.resolve(JSON.parse(localStorage.getItem(key) || '[]'));
    },
    create(cliente, texto) {
      const key = 'overview_' + cliente;
      const entries = JSON.parse(localStorage.getItem(key) || '[]');
      const entry = { data: new Date().toISOString().slice(0,10), texto };
      entries.push(entry);
      localStorage.setItem(key, JSON.stringify(entries));
      return Promise.resolve(entry);
    },
    remove(cliente, index) {
      const key = 'overview_' + cliente;
      const entries = JSON.parse(localStorage.getItem(key) || '[]');
      entries.splice(index, 1);
      localStorage.setItem(key, JSON.stringify(entries));
      return Promise.resolve(true);
    }
  },
  reminders: {
    list(){ return Promise.resolve(JSON.parse(localStorage.getItem('resolutio_reminders') || '[]')); },
    create(data) {
      const reminders = JSON.parse(localStorage.getItem('resolutio_reminders') || '[]');
      const reminder = { id: 'r'+Date.now(), ...data };
      reminders.push(reminder);
      localStorage.setItem('resolutio_reminders', JSON.stringify(reminders));
      return Promise.resolve(reminder);
    }
  },

  // Futuro: Supabase
  async supabaseQuery(table, opts={}) {
    if (USE_MOCK) return this[table]?.list() || Promise.resolve([]);
    // Exemplo real (quando token for fornecido):
    // const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    //   headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    // });
    // return res.json();
    return Promise.resolve([]);
  }
};
