// === RESOLUTIO - Filestore (IndexedDB) ===
// Armazenamento binario de documentos (contratos em PDF, materiais, etc).
//
// Motivo: localStorage tem ~5 MB para a ORIGEM inteira e so aceita strings.
// Guardar um PDF como base64 estoura a cota em dois contratos. IndexedDB
// guarda Blobs nativos, tem cota de centenas de MB/GB e nao infla o tamanho.

const FileStore = (() => {
  const DB_NAME = 'resolutio_files';
  const STORE = 'blobs';
  const DB_VERSION = 1;
  const MAX_FILE_BYTES = 100 * 1024 * 1024;

  let dbPromise = null;
  const urlCache = new Map();

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Este navegador nao suporta IndexedDB, necessario para anexar documentos.'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'chave' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Nao foi possivel abrir o armazenamento de arquivos.'));
      req.onblocked = () => reject(new Error('Armazenamento de arquivos bloqueado por outra aba aberta.'));
    });
    // Se a abertura falhar, permite nova tentativa em chamada seguinte.
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  // Executa uma operacao numa transacao e resolve com o resultado da operacao.
  // O `req.result` so e valido dentro dos handlers do request (a transacao pode
  // ter sido encerrada), por isso o valor e capturado no onsuccess do proprio request.
  function run(mode, op) {
    return open().then(db => new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(STORE, mode);
      } catch (err) {
        reject(err);
        return;
      }
      const store = tx.objectStore(STORE);
      let req;
      try {
        req = op(store);
      } catch (err) {
        try { tx.abort(); } catch (e) {}
        reject(err);
        return;
      }
      if (!req) {
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => reject(tx.error || new Error('Falha na operacao de arquivo.'));
        tx.onabort = () => reject(tx.error || new Error('Operacao de arquivo cancelada.'));
        return;
      }
      req.onsuccess = () => { resolve(req.result); };
      req.onerror = () => reject(req.error || new Error('Falha na operacao de arquivo.'));
      tx.onabort = () => reject(tx.error || new Error('Operacao de arquivo cancelada.'));
    }));
  }

  function revoke(chave) {
    const url = urlCache.get(chave);
    if (url) {
      URL.revokeObjectURL(url);
      urlCache.delete(chave);
    }
  }

  // `instanceof Blob` falha entre realms (iframe, worker, another window) e tambem
  // em motores que polyfillam File. A verificacao estrutural cobre todos os casos.
  function pareceBlob(v) {
    if (!v || typeof v !== 'object') return false;
    if (typeof Blob !== 'undefined' && v instanceof Blob) return true;
    return typeof v.size === 'number' && typeof v.slice === 'function' &&
           typeof v.type === 'string' && typeof v.arrayBuffer === 'function';
  }

  // Converte um Blob/File em um File nomeado (IndexedDB guarda o nome junto do binario).
  function nomear(blob, nome, tipo) {
    const FileCtor = typeof File !== 'undefined' ? File : null;
    if (FileCtor) {
      try { return new FileCtor([blob], nome, { type: tipo || blob.type }); } catch (e) { /* cai no Object.defineProperty */ }
    }
    const out = blob.slice(0, blob.size, tipo || blob.type);
    try {
      Object.defineProperty(out, 'name', { value: nome, enumerable: true });
      return out;
    } catch (e) {
      return out;
    }
  }

  // Decodifica uma data URL ("data:<mime>;base64,<conteudo>") sem passar por fetch.
  function dataUrlParaBlob(dataUrl) {
    const m = /^data:([^;,]*)?(;base64)?,(.*)$/s.exec(dataUrl);
    if (!m) return null;
    const mime = (m[1] || 'application/octet-stream').trim();
    const dados = m[3] || '';
    let bytes;
    if (m[2]) {
      const bin = atob(dados);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(dados));
    }
    return new Blob([bytes], { type: mime });
  }

  function validar(file, opts = {}) {
    if (!pareceBlob(file)) throw new Error('Arquivo invalido.');
    if (file.size === 0) throw new Error('O arquivo esta vazio.');
    if (file.size > MAX_FILE_BYTES) {
      throw new Error('Arquivo maior que 100 MB. Selecione um arquivo menor.');
    }
    const accept = opts.accept;
    if (accept && accept.length && file.type) {
      const ok = accept.some(t => t === '*' || (t.endsWith('/*') ? file.type.startsWith(t.slice(0, -1)) : file.type === t));
      if (!ok) throw new Error(`Formato nao suportado (${file.type || 'desconhecido'}). Use: ${accept.join(', ')}.`);
    }
    return true;
  }

  return {
    MAX_FILE_BYTES,

    validar,

    dataUrlParaBlob,

    formatBytes(bytes) {
      const n = Number(bytes) || 0;
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / (1024 * 1024)).toFixed(1) + ' MB';
    },

    async put(chave, file, opts = {}) {
      if (!chave) throw new Error('Chave do arquivo ausente.');
      validar(file);
      const nome = opts.nome || file.name || 'arquivo';
      const tipo = opts.tipo || file.type || 'application/octet-stream';
      revoke(chave);
      await run('readwrite', s => s.put({
        chave,
        nome,
        tipo,
        tamanho: file.size,
        criado_em: new Date().toISOString(),
        blob: nomear(file, nome, tipo)
      }));
      return { chave, nome, tipo, tamanho: file.size };
    },

    async get(chave) {
      if (!chave) return null;
      const rec = await run('readonly', s => s.get(chave));
      return rec || null;
    },

    async has(chave) {
      if (!chave) return false;
      const rec = await this.get(chave);
      return !!rec;
    },

    async meta(chave) {
      const rec = await this.get(chave);
      if (!rec) return null;
      return { chave, nome: rec.nome, tipo: rec.tipo, tamanho: rec.tamanho, criado_em: rec.criado_em };
    },

    // URL de objeto reutilizavel. Nao revoga enquanto em uso.
    async url(chave) {
      if (!chave) return null;
      const cached = urlCache.get(chave);
      if (cached) return cached;
      const rec = await this.get(chave);
      if (!rec || !rec.blob) return null;
      const url = URL.createObjectURL(rec.blob);
      urlCache.set(chave, url);
      return url;
    },

    async delete(chave) {
      if (!chave) return false;
      revoke(chave);
      await run('readwrite', s => s.delete(chave));
      return true;
    },

    async usage() {
      if (!navigator.storage || !navigator.storage.estimate) return null;
      const est = await navigator.storage.estimate();
      return { usado: est.usage || 0, cota: est.quota || 0 };
    },

    // Libera URLs de objeto criadas nesta sessao.
    releaseAll() {
      urlCache.forEach(url => URL.revokeObjectURL(url));
      urlCache.clear();
    }
  };
})();

if (typeof window !== 'undefined') {
  // `const` no topo de um script cria binding no escopo lexico global, que NAO
  // vira propriedade de window. Expor explicitamente e obrigatorio para o
  // js/api.js (e para qualquer pagina) enxergar o FileStore.
  window.FileStore = FileStore;
  window.addEventListener('beforeunload', () => FileStore.releaseAll());
}