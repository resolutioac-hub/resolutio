# Resolutio Backend — Node.js + Express + Supabase

## Setup

1. Copie `.env.example` para `.env` e preencha:
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PORT=3000
FRONTEND_URL=http://localhost:5500
```

2. Instale e rode:
```bash
npm install
npm run dev
# ou
npm start
```

3. Teste:
```
GET http://localhost:3000/health
GET http://localhost:3000/api/leads
POST http://localhost:3000/api/leads  { "nome": "Teste", "origem": "instagram", "status": "novo" }
```

## Supabase — SQL para criar as tabelas

Cole no SQL Editor do Supabase:

```sql
-- Enable UUID
create extension if not exists "uuid-ossp";

-- Usuários (espelha auth.users)
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  role text check (role in ('admin','funcionario','cliente')) default 'cliente',
  avatar_url text,
  telefone text,
  created_at timestamp default now()
);

create table leads (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  email text,
  telefone text,
  origem text check (origem in ('instagram','whatsapp','beacons','indicacao','outro')),
  status text check (status in ('novo','em_conversa','call_marcada','proposta_enviada','fechado','perdido')) default 'novo',
  observacoes text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table clientes (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid references usuarios(id),
  lead_id uuid references leads(id),
  pacote text check (pacote in ('essencial','estrategico','excelencia')),
  status text check (status in ('ativo','pausado','concluido','cancelado')) default 'ativo',
  data_inicio date,
  data_fim date,
  created_at timestamp default now()
);

create table funcionarios (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid references usuarios(id),
  cargo text,
  ativo boolean default true,
  created_at timestamp default now()
);

create table contratos (
  id uuid primary key default uuid_generate_v4(),
  cliente_id uuid references clientes(id),
  status text check (status in ('rascunho','enviado','visualizado','assinado','cancelado')) default 'rascunho',
  valor decimal(10,2),
  parcelas int,
  arquivo_url text,
  assinado_url text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table pagamentos (
  id uuid primary key default uuid_generate_v4(),
  cliente_id uuid references clientes(id),
  contrato_id uuid references contratos(id),
  valor decimal(10,2),
  status text check (status in ('pendente','pago','atrasado','cancelado')) default 'pendente',
  data_vencimento date,
  data_pagamento date,
  link_pagamento text,
  created_at timestamp default now()
);

create table encontros (
  id uuid primary key default uuid_generate_v4(),
  cliente_id uuid references clientes(id),
  funcionario_id uuid references funcionarios(id),
  titulo text not null,
  data_hora timestamp not null,
  duracao_minutos int default 60,
  status text check (status in ('agendado','realizado','cancelado','remarcado')) default 'agendado',
  link_meet text,
  transcricao text,
  overview text,
  created_at timestamp default now()
);

create table materiais (
  id uuid primary key default uuid_generate_v4(),
  cliente_id uuid references clientes(id),
  titulo text not null,
  tipo text check (tipo in ('edital','projeto','material_estudo','outro')),
  arquivo_url text,
  created_at timestamp default now()
);

create table atividades (
  id uuid primary key default uuid_generate_v4(),
  cliente_id uuid references clientes(id),
  funcionario_id uuid references funcionarios(id),
  titulo text not null,
  descricao text,
  data_limite timestamp,
  status text check (status in ('pendente','em_andamento','concluida')) default 'pendente',
  created_at timestamp default now()
);

-- RLS (exemplo: desabilitado para dev; habilite e crie policies depois)
alter table usuarios disable row level security;
alter table leads disable row level security;
alter table clientes disable row level security;
alter table funcionarios disable row level security;
alter table contratos disable row level security;
alter table pagamentos disable row level security;
alter table encontros disable row level security;
alter table materiais disable row level security;
alter table atividades disable row level security;
```

## Auth

- Frontend usa Google OAuth via Supabase Auth (ver `frontend/js/auth.js`).
- Backend verifica `Authorization: Bearer <jwt>` em `middleware/auth.js` e `middleware/role.js`.

## Deploy

- Frontend: Vercel (apontar para `frontend/`)
- Backend: Railway (apontar para `backend/`, start `npm start`, env `SUPABASE_URL` etc.)
