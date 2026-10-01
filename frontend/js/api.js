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
function saveDB(db) {
  try {
    localStorage.setItem('resolutio_db', JSON.stringify(db));
  } catch (e) {
    // localStorage e ~5 MB por origem. Binarios NAO devem chegar aqui (use FileStore),
    // mas se chegarem a falha precisa ser legivel, nao um QuotaExceededError mudo.
    if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
      throw new Error('Armazenamento do navegador cheio. Exclua documentos antigos ou reduza o tamanho dos arquivos.');
    }
    throw new Error('Nao foi possivel salvar os dados no navegador.');
  }
}

// ---------- Helpers de arquivo (IndexedDB) ----------
function gerarChaveArquivo(prefixo, id) {
  return prefixo + ':' + id + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 8);
}
function ehArquivo(v) {
  return typeof File !== 'undefined' ? v instanceof File : (v instanceof Blob);
}
function exigirFileStore() {
  if (!window.FileStore) {
    throw new Error('js/filestore.js nao foi carregado. O anexo de documentos depende desse arquivo.');
  }
  return window.FileStore;
}
async function salvarArquivo(prefixo, id, file) {
  const chave = gerarChaveArquivo(prefixo, id);
  const meta = await exigirFileStore().put(chave, file);
  return {
    arquivo_chave: meta.chave,
    arquivo_nome: meta.nome,
    arquivo_tipo: meta.tipo,
    arquivo_tamanho: meta.tamanho,
    arquivo: meta.nome
  };
}

// Converte registros antigos que guardavam o PDF como base64 (data URL) em localStorage
// para o armazenamento de arquivos (IndexedDB), preservando o documento ja cadastrado.
async function migrarArquivosBase64(registros, campoLegado = 'pdf_data') {
  if (!window.FileStore) return registros;
  for (const reg of registros) {
    const legado = reg[campoLegado];
    if (!legado || typeof legado !== 'string' || !legado.startsWith('data:')) continue;
    try {
      const blob = window.FileStore.dataUrlParaBlob(legado);
      if (!blob) throw new Error('data URL invalida');
      const chave = gerarChaveArquivo('contrato', reg.id);
      const meta = await window.FileStore.put(chave, blob, { nome: reg.pdf_nome || reg.arquivo || 'documento.pdf' });
      reg.arquivo_chave = meta.chave;
      reg.arquivo_nome = meta.nome;
      reg.arquivo_tipo = meta.tipo;
      reg.arquivo_tamanho = meta.tamanho;
      reg.arquivo = meta.nome;
      reg.pdf_nome = meta.nome;
      reg.pdf_chave = meta.chave;
      delete reg[campoLegado];
    } catch (e) {
      console.warn('Nao foi possivel migrar o arquivo legado do registro', reg.id, e);
    }
  }
  return registros;
}

async function abrirArquivo(registro, nomeAlternativo) {
  if (!registro) return null;
  // Contratos gravados antes do IndexedDB podem ter apenas pdf_chave.
  const chave = registro.arquivo_chave || registro.pdf_chave;
  if (chave) return exigirFileStore().url(chave);
  // Fallback: documento legado ainda em base64.
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
    async list() {
      const db = getDB();
      db.contratos = db.contratos || [];
      const temLegado = db.contratos.some(c => typeof c.pdf_data === 'string' && c.pdf_data.startsWith('data:'));
      if (temLegado && window.FileStore) {
        await migrarArquivosBase64(db.contratos);
        saveDB(db);
      }
      return db.contratos;
    },
    async create(data) {
      const db = getDB();
      if (!db.contratos) db.contratos = [];
      const { _arquivo, ...resto } = data || {};
      const contrato = {
        id: 'ct' + Date.now() + Math.random().toString(36).slice(2, 5),
        status: 'rascunho', enviado_em: '—', assinado_em: '—',
        data_criacao: new Date().toISOString(),
        ...resto
      };

      if (ehArquivo(_arquivo)) {
        Object.assign(contrato, await salvarArquivo('contrato', contrato.id, _arquivo));
        contrato.pdf_nome = contrato.arquivo_nome;
        contrato.pdf_chave = contrato.arquivo_chave;
      } else if (contrato.pdf_nome && !contrato.arquivo) {
        contrato.arquivo = contrato.pdf_nome;
      }

      db.contratos.push(contrato);
      saveDB(db);
      return contrato;
    },
    async update(id, patch) {
      const db = getDB();
      db.contratos = db.contratos || [];
      const idx = db.contratos.findIndex(c => c.id === id);
      if (idx < 0) return Promise.reject(new Error('Contrato nao encontrado.'));
      const { _arquivo, ...resto } = patch || {};
      if (ehArquivo(_arquivo)) {
        const anterior = db.contratos[idx].arquivo_chave;
        Object.assign(db.contratos[idx], await salvarArquivo('contrato', id, _arquivo));
        db.contratos[idx].pdf_nome = db.contratos[idx].arquivo_nome;
        db.contratos[idx].pdf_chave = db.contratos[idx].arquivo_chave;
        if (anterior) exigirFileStore().delete(anterior).catch(() => {});
      }
      db.contratos[idx] = { ...db.contratos[idx], ...resto };
      saveDB(db);
      return db.contratos[idx];
    },
    async get(id) {
      const list = await this.list();
      return list.find(c => c.id === id);
    },
    temArquivo(c) {
      if (!c) return false;
      return !!(c.arquivo_chave || c.pdf_chave || (typeof c.pdf_data === 'string' && c.pdf_data.startsWith('data:')));
    },
    async abrirArquivo(id) {
      const c = await this.get(id);
      if (!this.temArquivo(c)) throw new Error('Contrato sem PDF anexado.');
      return abrirArquivo(c, c.pdf_nome || c.arquivo);
    },
    async baixarArquivo(id) {
      const c = await this.get(id);
      return baixarArquivo(c, c.pdf_nome || c.arquivo);
    },
    async remove(id) {
      const db = getDB();
      db.contratos = db.contratos || [];
      const alvo = db.contratos.find(c => c.id === id);
      if (alvo && alvo.arquivo_chave && window.FileStore) window.FileStore.delete(alvo.arquivo_chave).catch(() => {});
      db.contratos = db.contratos.filter(c => c.id !== id);
      saveDB(db);
      return true;
    }
  },
  materiais: {
    list(){ return Promise.resolve(getDB().materiais || []); },
    async create(data) {
      const db = getDB();
      if (!db.materiais) db.materiais = [];
      const { _arquivo, ...resto } = data || {};
      const material = {
        id: 'm' + Date.now() + Math.random().toString(36).slice(2, 5),
        data: new Date().toISOString().slice(0, 10),
        ...resto
      };
      if (ehArquivo(_arquivo)) {
        Object.assign(material, await salvarArquivo('material', material.id, _arquivo));
        material.arquivo = material.arquivo_nome;
        if (!material.titulo) material.titulo = material.arquivo_nome;
      } else if (!material.arquivo && !material.url) {
        material.arquivo = 'sem-arquivo';
      }
      db.materiais.push(material);
      saveDB(db);
      return material;
    },
    async update(id, patch) {
      const db = getDB();
      db.materiais = db.materiais || [];
      const idx = db.materiais.findIndex(m => m.id === id);
      if (idx < 0) return Promise.reject(new Error('Material nao encontrado.'));
      const { _arquivo, ...resto } = patch || {};
      if (ehArquivo(_arquivo)) {
        const anterior = db.materiais[idx].arquivo_chave;
        Object.assign(db.materiais[idx], await salvarArquivo('material', id, _arquivo));
        db.materiais[idx].arquivo = db.materiais[idx].arquivo_nome;
        if (anterior) exigirFileStore().delete(anterior).catch(() => {});
      }
      db.materiais[idx] = { ...db.materiais[idx], ...resto };
      saveDB(db);
      return db.materiais[idx];
    },
    temArquivo(m) {
      if (!m) return false;
      return !!(m.arquivo_chave || m.url);
    },
    async abrirArquivo(id) {
      const m = (getDB().materiais || []).find(x => x.id === id);
      const url = await abrirArquivo(m, m && m.arquivo);
      if (!url) throw new Error('Material sem arquivo anexado.');
      return url;
    },
    async baixarArquivo(id) {
      const m = (getDB().materiais || []).find(x => x.id === id);
      if (!m) throw new Error('Material nao encontrado.');
      return baixarArquivo(m, m.arquivo);
    },
    async remove(id) {
      const db = getDB();
      db.materiais = db.materiais || [];
      const alvo = db.materiais.find(m => m.id === id);
      if (alvo && alvo.arquivo_chave && window.FileStore) window.FileStore.delete(alvo.arquivo_chave).catch(() => {});
      db.materiais = db.materiais.filter(m => m.id !== id);
      saveDB(db);
      return true;
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
