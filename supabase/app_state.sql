-- ============================================================
-- RESOLUTIO - Estado compartilhado entre dispositivos
-- Execute este SQL no SQL Editor do Supabase (uma vez).
-- ============================================================

create table if not exists app_state (
  key text primary key,
  data jsonb,
  updated_at timestamptz not null default now()
);

alter table app_state enable row level security;

drop policy if exists "app_state_all" on app_state;
create policy "app_state_all" on app_state
  for all using (true) with check (true);
