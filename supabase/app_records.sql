-- Resolutio: armazenamento definitivo no Supabase (sem dados no navegador)
-- Execute este arquivo no SQL Editor do Supabase ou via Management API.

create table if not exists public.app_records (
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

create index if not exists idx_app_records_collection on public.app_records (collection);
create index if not exists idx_app_records_updated_at on public.app_records (updated_at desc);

alter table public.app_records enable row level security;

drop policy if exists app_records_all on public.app_records;
drop policy if exists app_records_select on public.app_records;
drop policy if exists app_records_insert on public.app_records;
drop policy if exists app_records_update on public.app_records;
drop policy if exists app_records_delete on public.app_records;

-- A colecao `passwords` nunca e lida diretamente pelo cliente. Ela so e
-- acessada pelas funcoes RPC (security definer) abaixo.
create policy app_records_select on public.app_records
  for select using (collection <> 'passwords');
create policy app_records_insert on public.app_records
  for insert with check (collection <> 'passwords');
create policy app_records_update on public.app_records
  for update using (collection <> 'passwords') with check (collection <> 'passwords');
create policy app_records_delete on public.app_records
  for delete using (collection <> 'passwords');

grant select, insert, update, delete on public.app_records to anon, authenticated;

-- ============================================================
-- Autenticacao
-- ============================================================

drop function if exists public.verify_credentials(text, text);
create function public.verify_credentials(p_identifier text, p_password text)
returns table (
  found_id text,
  found_email text,
  found_nome text,
  found_role text,
  found_cpf text,
  found_funcao text,
  found_has_password boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text := lower(trim(coalesce(p_identifier, '')));
  v_cpf text := regexp_replace(coalesce(p_identifier, ''), '\D', '', 'g');
  v_admin_login text;
  v_id text;
  v_data jsonb;
  v_stored text;
  v_email text;
begin
  select r.data->>'login' into v_admin_login
    from public.app_records r
   where r.collection = 'settings' and r.id = 'admin_login'
   limit 1;
  v_admin_login := lower(trim(coalesce(v_admin_login, 'admin')));

  if v_norm = v_admin_login or v_norm in ('admin', 'admin@resolutio.com') then
    select r.data->>'senha' into v_stored
      from public.app_records r
     where r.collection = 'passwords' and r.id = 'admin@resolutio.com'
     limit 1;
    if v_stored is null then
      v_stored := '123';
      found_has_password := false;
    else
      found_has_password := true;
    end if;
    if p_password = v_stored then
      found_id := 'admin';
      found_email := 'admin@resolutio.com';
      found_nome := 'Admin';
      found_role := 'admin';
      found_cpf := null;
      found_funcao := null;
      return next;
    end if;
    return;
  end if;

  select r.id, r.data into v_id, v_data
    from public.app_records r
   where r.collection = 'clientes'
     and (
       lower(coalesce(r.data->>'email', '')) = v_norm
       or (length(v_cpf) = 11 and regexp_replace(coalesce(r.data->>'cpf', ''), '\D', '', 'g') = v_cpf)
     )
   limit 1;
  if v_id is not null then
    v_email := lower(coalesce(v_data->>'email', ''));
    select r.data->>'senha' into v_stored
      from public.app_records r
     where r.collection = 'passwords' and r.id = v_email
     limit 1;
    if v_stored is null then
      v_stored := '123';
      found_has_password := false;
    else
      found_has_password := true;
    end if;
    if p_password = v_stored then
      found_id := v_id;
      found_email := v_email;
      found_nome := v_data->>'nome';
      found_role := 'cliente';
      found_cpf := v_data->>'cpf';
      found_funcao := null;
      return next;
    end if;
    return;
  end if;

  select r.id, r.data into v_id, v_data
    from public.app_records r
   where r.collection = 'funcionarios'
     and lower(coalesce(r.data->>'email', '')) = v_norm
     and coalesce((r.data->>'ativo')::boolean, true) = true
   limit 1;
  if v_id is not null then
    v_email := lower(coalesce(v_data->>'email', ''));
    select r.data->>'senha' into v_stored
      from public.app_records r
     where r.collection = 'passwords' and r.id = v_email
     limit 1;
    if v_stored is null then
      v_stored := '123';
      found_has_password := false;
    else
      found_has_password := true;
    end if;
    if p_password = v_stored then
      found_id := v_id;
      found_email := v_email;
      found_nome := v_data->>'nome';
      found_role := 'funcionario';
      found_cpf := null;
      found_funcao := v_data->>'funcao';
      return next;
    end if;
    return;
  end if;
end;
$$;

grant execute on function public.verify_credentials(text, text) to anon, authenticated;

drop function if exists public.save_password(text, text, text);
create function public.save_password(p_email text, p_password text, p_cpf text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email = '' then return false; end if;
  insert into public.app_records (collection, id, data, updated_at)
  values (
    'passwords',
    v_email,
    jsonb_build_object('email', v_email, 'cpf', p_cpf, 'senha', p_password),
    now()
  )
  on conflict (collection, id) do update
    set data = public.app_records.data || jsonb_build_object(
      'email', v_email,
      'cpf', coalesce(p_cpf, public.app_records.data->>'cpf'),
      'senha', p_password
    ),
    updated_at = now();
  return true;
end;
$$;

grant execute on function public.save_password(text, text, text) to anon, authenticated;

drop function if exists public.delete_password(text, text);
create function public.delete_password(p_email text, p_cpf text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
begin
  delete from public.app_records
   where collection = 'passwords'
     and (
       id = v_email
       or (v_cpf <> '' and regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g') = v_cpf)
     );
  return true;
end;
$$;

grant execute on function public.delete_password(text, text) to anon, authenticated;

drop function if exists public.move_password(text, text);
create function public.move_password(p_old_email text, p_new_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text := lower(trim(coalesce(p_old_email, '')));
  v_new text := lower(trim(coalesce(p_new_email, '')));
begin
  if v_old = '' or v_new = '' or v_old = v_new then return false; end if;
  delete from public.app_records
   where collection = 'passwords' and id = v_new and id <> v_old;
  update public.app_records
     set id = v_new,
         data = data || jsonb_build_object('email', v_new),
         updated_at = now()
   where collection = 'passwords' and id = v_old;
  return true;
end;
$$;

grant execute on function public.move_password(text, text) to anon, authenticated;

-- ============================================================
-- Arquivos (Supabase Storage)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do update set public = true;

drop policy if exists documentos_anon_select on storage.objects;
drop policy if exists documentos_anon_insert on storage.objects;
drop policy if exists documentos_anon_update on storage.objects;
drop policy if exists documentos_anon_delete on storage.objects;

create policy documentos_anon_select on storage.objects
  for select to anon using (bucket_id = 'documentos');
create policy documentos_anon_insert on storage.objects
  for insert to anon with check (bucket_id = 'documentos');
create policy documentos_anon_update on storage.objects
  for update to anon using (bucket_id = 'documentos') with check (bucket_id = 'documentos');
create policy documentos_anon_delete on storage.objects
  for delete to anon using (bucket_id = 'documentos');
