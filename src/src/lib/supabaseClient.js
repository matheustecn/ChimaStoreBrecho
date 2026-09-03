-- =========================================================================
-- Chima Store — schema Supabase
-- Rode este script inteiro em: Supabase → SQL Editor → New query → Run
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1) profiles: guarda nome e perfil (admin/caixa) de cada conta.
--    auth.users (login/senha) já é gerenciado pelo próprio Supabase Auth.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'caixa' check (role in ('admin', 'caixa')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  using (auth.role() = 'authenticated');

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
  on public.profiles for update
  using (
    auth.uid() = id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "profiles_delete_admin_only" on public.profiles;
create policy "profiles_delete_admin_only"
  on public.profiles for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------------------
-- 2) store_data: uma única linha com todos os dados da loja (peças,
--    clientes, vendas, caixa, etc.) em formato JSON, compartilhada por
--    todos os dispositivos e sincronizada em tempo real.
-- ---------------------------------------------------------------------
create table if not exists public.store_data (
  id int primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.store_data (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

alter table public.store_data enable row level security;

drop policy if exists "store_data_select_authenticated" on public.store_data;
create policy "store_data_select_authenticated"
  on public.store_data for select
  using (auth.role() = 'authenticated');

drop policy if exists "store_data_update_authenticated" on public.store_data;
create policy "store_data_update_authenticated"
  on public.store_data for update
  using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 3) Realtime: permite que alterações em store_data cheguem ao vivo em
--    todos os dispositivos conectados (multi-caixa, multi-dispositivo).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'store_data'
  ) then
    alter publication supabase_realtime add table public.store_data;
  end if;
end $$;
