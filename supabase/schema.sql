-- ============================================================
-- RESOLUTIO — Assessoria & Consultoria Acadêmica
-- Schema completo para Supabase (PostgreSQL)
-- ============================================================

-- ============================================================
-- 1. TIPOS ENUM
-- ============================================================

CREATE TYPE lead_status AS ENUM (
  'novo', 'em_conversa', 'call_marcada',
  'proposta_enviada', 'fechado', 'perdido'
);

CREATE TYPE cliente_status AS ENUM (
  'ativo', 'pausado', 'concluido', 'cancelado'
);

CREATE TYPE encontro_status AS ENUM (
  'agendado', 'realizado', 'cancelado', 'remarcado'
);

CREATE TYPE pagamento_status AS ENUM (
  'pendente', 'pago', 'atrasado'
);

CREATE TYPE contrato_status AS ENUM (
  'rascunho', 'enviado', 'assinado', 'visualizado'
);

CREATE TYPE solicitacao_status AS ENUM (
  'pendente', 'aprovada', 'recusada'
);

CREATE TYPE pacote_type AS ENUM (
  'essencial', 'estrategico', 'excelencia'
);

CREATE TYPE lead_origem AS ENUM (
  'instagram', 'beacons', 'whatsapp', 'direct', 'indicacao'
);

CREATE TYPE funcionario_funcao AS ENUM (
  'diretora_academica', 'comercial', 'administrativo_financeiro'
);

CREATE TYPE material_tipo AS ENUM (
  'edital', 'projeto', 'material_estudo', 'outro'
);

CREATE TYPE despesa_categoria AS ENUM (
  'infraestrutura', 'ferramentas', 'operacional',
  'administrativo', 'marketing', 'pessoal'
);

CREATE TYPE pagamento_metodo AS ENUM (
  'cartao', 'pix', 'boleto'
);

-- ============================================================
-- 2. TABELAS
-- ============================================================

-- ------------------------------------------------------------
-- LEADS
-- ------------------------------------------------------------
CREATE TABLE leads (
  id                    TEXT PRIMARY KEY,
  nome                  TEXT NOT NULL,
  email                 TEXT NOT NULL,
  telefone              TEXT,
  pacote                pacote_type,
  origem                lead_origem,
  status                lead_status DEFAULT 'novo',
  data_primeiro_contato DATE,
  data_criacao          DATE DEFAULT CURRENT_DATE,
  observacoes           TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  historico             JSONB DEFAULT '[]'::jsonb,
  qualificacao          JSONB
);

-- ------------------------------------------------------------
-- FUNCIONARIOS
-- ------------------------------------------------------------
CREATE TABLE funcionarios (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  email     TEXT NOT NULL UNIQUE,
  funcao    funcionario_funcao,
  cargo     TEXT,
  ativo     BOOLEAN DEFAULT TRUE,
  clientes  INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- SOLICITACOES DE FUNCIONARIOS
-- ------------------------------------------------------------
CREATE TABLE solicitacoes_funcionarios (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL,
  senha       TEXT,
  funcao      funcionario_funcao,
  cargo       TEXT,
  status      solicitacao_status DEFAULT 'pendente',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- CLIENTES
-- ------------------------------------------------------------
CREATE TABLE clientes (
  id                TEXT PRIMARY KEY,
  nome              TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  whatsapp          TEXT,
  cpf               TEXT UNIQUE,
  telefone          TEXT,
  pacote            pacote_type DEFAULT 'essencial',
  funcionario       TEXT,
  status            cliente_status DEFAULT 'ativo',
  progresso         INTEGER DEFAULT 0,
  pilar_atual       INTEGER DEFAULT 1 CHECK (pilar_atual BETWEEN 1 AND 4),
  meio_pagamento    TEXT DEFAULT 'pix',
  tipo_pagamento    TEXT DEFAULT 'avista',
  valor_total       NUMERIC(12,2) DEFAULT 0,
  parcela_valor     NUMERIC(12,2) DEFAULT 0,
  parcelas_total    INTEGER DEFAULT 1,
  dia_vencimento    INTEGER CHECK (dia_vencimento IS NULL OR dia_vencimento BETWEEN 1 AND 28),
  pendencias        JSONB DEFAULT '[]'::jsonb,
  proximo_encontro  TEXT DEFAULT '—',
  avatar            TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- ENCONTROS
-- ------------------------------------------------------------
CREATE TABLE encontros (
  id           TEXT PRIMARY KEY,
  cliente      TEXT NOT NULL,
  titulo       TEXT,
  data         TEXT,
  status       encontro_status DEFAULT 'agendado',
  meet         TEXT DEFAULT '',
  funcionario  TEXT,
  pilar        INTEGER CHECK (pilar IS NULL OR pilar BETWEEN 1 AND 4),
  observacoes  TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- PAGAMENTOS
-- ------------------------------------------------------------
CREATE TABLE pagamentos (
  id              TEXT PRIMARY KEY,
  cliente         TEXT NOT NULL,
  pacote          TEXT,
  parcela_atual   INTEGER,
  parcelas_total  INTEGER,
  valor           NUMERIC(12,2) NOT NULL,
  valor_total     NUMERIC(12,2),
  vencimento      TEXT,
  metodo          pagamento_metodo,
  status          pagamento_status DEFAULT 'pendente',
  pago_em         TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- DESPESAS
-- ------------------------------------------------------------
CREATE TABLE despesas (
  id          TEXT PRIMARY KEY,
  descricao   TEXT NOT NULL,
  valor       NUMERIC(12,2) NOT NULL,
  data        TEXT NOT NULL,
  categoria   despesa_categoria,
  recorrente  BOOLEAN DEFAULT FALSE,
  status      TEXT DEFAULT 'pago',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- CONTRATOS
-- ------------------------------------------------------------
CREATE TABLE contratos (
  id             TEXT PRIMARY KEY,
  cliente        TEXT NOT NULL,
  pacote         TEXT,
  valor          NUMERIC(12,2),
  observacoes    TEXT,
  arquivo        TEXT DEFAULT '—',
  -- Referencia ao objeto no Supabase Storage (bucket 'documentos').
  -- O binario NUNCA deve ser salvo em colunas TEXT: estoura a cota e quebra a pagina.
  arquivo_chave  TEXT,
  arquivo_nome   TEXT,
  arquivo_tipo   TEXT,
  arquivo_tamanho BIGINT,
  pdf_nome       TEXT,
  status         contrato_status DEFAULT 'rascunho',
  enviado_em     TEXT DEFAULT '—',
  assinado_em    TEXT DEFAULT '—',
  data_criacao   TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- MATERIAIS
-- ------------------------------------------------------------
CREATE TABLE materiais (
  id             TEXT PRIMARY KEY,
  cliente        TEXT NOT NULL,
  titulo         TEXT NOT NULL,
  tipo           material_tipo,
  data           TEXT,
  arquivo        TEXT,
  url            TEXT,
  -- Referencia ao objeto no Supabase Storage (bucket 'documentos').
  arquivo_chave  TEXT,
  arquivo_nome   TEXT,
  arquivo_tipo   TEXT,
  arquivo_tamanho BIGINT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- STORAGE: bucket unico para contratos e materiais.
-- Sem este bucket, nenhum anexo funciona (o upload so tem onde falhar).
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('documentos', 'documentos', false, 104857600)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "documentos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos');

CREATE POLICY "documentos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documentos');

CREATE POLICY "documentos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'documentos')
  WITH CHECK (bucket_id = 'documentos');

CREATE POLICY "documentos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documentos');

-- ------------------------------------------------------------
-- OVERVIEW (anotacoes por cliente)
-- ------------------------------------------------------------
CREATE TABLE overview (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente   TEXT NOT NULL,
  data      TEXT NOT NULL,
  texto     TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_overview_cliente ON overview(cliente);

-- ------------------------------------------------------------
-- REMINDERS (lembretes)
-- ------------------------------------------------------------
CREATE TABLE reminders (
  id            TEXT PRIMARY KEY,
  contrato_id   TEXT,
  cliente       TEXT,
  tipo          TEXT DEFAULT 'contrato',
  data          TEXT,
  mensagem      TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- SLOTS (horarios disponiveis)
-- ------------------------------------------------------------
CREATE TABLE slots (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date      TEXT NOT NULL,
  time      TEXT NOT NULL,
  duration  INTEGER DEFAULT 60,
  UNIQUE(date, time)
);

-- ------------------------------------------------------------
-- SENHAS (para login por e-mail/CPF)
-- ------------------------------------------------------------
CREATE TABLE user_passwords (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email     TEXT NOT NULL,
  cpf       TEXT,
  senha     TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_user_passwords_email ON user_passwords(email);
CREATE UNIQUE INDEX idx_user_passwords_email_unique ON user_passwords(email);

-- ============================================================
-- 3. FUNCOES RPC
-- ============================================================

-- Funcao para verificar credenciais (login por e-mail ou CPF)
CREATE OR REPLACE FUNCTION verify_credentials(
  p_identifier TEXT,
  p_password TEXT
)
RETURNS TABLE(
  found_id TEXT,
  found_email TEXT,
  found_nome TEXT,
  found_role TEXT,
  found_cpf TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_normalized TEXT;
  v_cpf_digits TEXT;
  v_stored TEXT;
  v_cliente RECORD;
  v_func RECORD;
BEGIN
  v_normalized := LOWER(TRIM(p_identifier));
  v_cpf_digits := REGEXP_REPLACE(p_identifier, '\D', '', 'g');

  -- Verificar se e admin
  IF v_normalized IN ('admin', 'admin@resolutio.com') THEN
    SELECT senha INTO v_stored FROM user_passwords WHERE email = 'admin@resolutio.com';
    IF v_stored IS NOT NULL THEN
      IF p_password = v_stored THEN
        RETURN QUERY SELECT 'admin'::TEXT, 'admin@resolutio.com'::TEXT, 'Admin'::TEXT, 'admin'::TEXT, NULL::TEXT;
        RETURN;
      END IF;
    ELSE
      -- Senha padrao 123
      IF p_password = '123' THEN
        RETURN QUERY SELECT 'admin'::TEXT, 'admin@resolutio.com'::TEXT, 'Admin'::TEXT, 'admin'::TEXT, NULL::TEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- Verificar se e cliente (por e-mail ou CPF)
  SELECT * INTO v_cliente
  FROM clientes c
  WHERE LOWER(c.email) = v_normalized
     OR (LENGTH(v_cpf_digits) = 11 AND c.cpf IS NOT NULL AND REGEXP_REPLACE(c.cpf, '\D', '', 'g') = v_cpf_digits)
  LIMIT 1;

  IF FOUND THEN
    SELECT senha INTO v_stored FROM user_passwords WHERE email = v_cliente.email;
    IF v_stored IS NOT NULL THEN
      IF p_password = v_stored THEN
        RETURN QUERY SELECT v_cliente.id, v_cliente.email, v_cliente.nome, 'cliente'::TEXT, v_cliente.cpf;
        RETURN;
      END IF;
    ELSE
      -- Senha padrao 123 (primeiro acesso)
      IF p_password = '123' THEN
        RETURN QUERY SELECT v_cliente.id, v_cliente.email, v_cliente.nome, 'cliente'::TEXT, v_cliente.cpf;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- Verificar se e funcionario (por e-mail)
  SELECT * INTO v_func
  FROM funcionarios f
  WHERE LOWER(f.email) = v_normalized AND f.ativo = TRUE
  LIMIT 1;

  IF FOUND THEN
    SELECT senha INTO v_stored FROM user_passwords WHERE email = v_func.email;
    IF v_stored IS NOT NULL THEN
      IF p_password = v_stored THEN
        RETURN QUERY SELECT v_func.id, v_func.email, v_func.nome, 'funcionario'::TEXT, NULL::TEXT;
        RETURN;
      END IF;
    ELSE
      IF p_password = '123' THEN
        RETURN QUERY SELECT v_func.id, v_func.email, v_func.nome, 'funcionario'::TEXT, NULL::TEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- Nenhum match
  RETURN;
END;
$$;

-- Funcao para salvar/atualizar senha
CREATE OR REPLACE FUNCTION save_password(
  p_email TEXT,
  p_password TEXT,
  p_cpf TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_passwords (email, cpf, senha, updated_at)
  VALUES (LOWER(TRIM(p_email)), p_cpf, p_password, now())
  ON CONFLICT (email) DO UPDATE
  SET senha = EXCLUDED.senha,
      cpf = COALESCE(EXCLUDED.cpf, user_passwords.cpf),
      updated_at = now();
  RETURN TRUE;
END;
$$;

-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes_funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE encontros ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE overview ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_passwords ENABLE ROW LEVEL SECURITY;

-- Politicas para SERVICE_ROLE (acesso total via backend/API)
-- O frontend usa a service_role key, entao as politicas RLS
-- so se aplicam quando acessado diretamente via anon key.

-- Para desenvolvimento com SERVICE_ROLE, podemos criar politicas permissivas:
CREATE POLICY "service_all_leads" ON leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_funcionarios" ON funcionarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_solicitacoes" ON solicitacoes_funcionarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_clientes" ON clientes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_encontros" ON encontros FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_pagamentos" ON pagamentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_despesas" ON despesas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_contratos" ON contratos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_materiais" ON materiais FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_overview" ON overview FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_reminders" ON reminders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_slots" ON slots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_passwords" ON user_passwords FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 5. DADOS INICIAIS (SEED)
-- ============================================================

-- Admin padrao (senha: 123)
INSERT INTO user_passwords (email, senha) VALUES ('admin@resolutio.com', '123')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- 6. INDICES PARA PERFORMANCE
-- ============================================================

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_clientes_status ON clientes(status);
CREATE INDEX idx_clientes_funcionario ON clientes(funcionario);
CREATE INDEX idx_clientes_pilar ON clientes(pilar_atual);
CREATE INDEX idx_encontros_cliente ON encontros(cliente);
CREATE INDEX idx_encontros_funcionario ON encontros(funcionario);
CREATE INDEX idx_encontros_status ON encontros(status);
CREATE INDEX idx_encontros_data ON encontros(data);
CREATE INDEX idx_pagamentos_cliente ON pagamentos(cliente);
CREATE INDEX idx_pagamentos_status ON pagamentos(status);
CREATE INDEX idx_contratos_cliente ON contratos(cliente);
CREATE INDEX idx_materiais_cliente ON materiais(cliente);
CREATE INDEX idx_reminders_cliente ON reminders(cliente);
CREATE INDEX idx_funcionarios_email ON funcionarios(email);
