-- SenaGest: servicos transacionais, estoque completo, cofre de logins e ponto.
-- A migracao e aditiva e preserva as movimentacoes e servicos legados.

create extension if not exists "uuid-ossp";

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  icone text default 'package',
  created_at timestamptz not null default now()
);

alter table public.produtos add column if not exists descricao text;
alter table public.produtos add column if not exists preco numeric(12,2);

-- O banco legado criou categoria_id como texto. Convertemos UUIDs validos e
-- mantemos como nulo qualquer valor antigo que nao represente uma categoria.
alter table public.produtos alter column categoria_id type uuid using (
  case
    when categoria_id is null then null
    when categoria_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then categoria_id::uuid
    else null
  end
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_preco_check') then
    alter table public.produtos add constraint produtos_preco_check check (preco is null or preco >= 0);
  end if;
end $$;

update public.produtos p
set categoria_id = null
where categoria_id is not null
  and not exists (select 1 from public.categorias c where c.id = p.categoria_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_categoria_id_fkey') then
    alter table public.produtos
      add constraint produtos_categoria_id_fkey foreign key (categoria_id)
      references public.categorias(id) on delete set null;
  end if;
end $$;

create table if not exists public.servicos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  tecnico_id uuid not null references public.profiles(id) on delete restrict,
  descricao text not null,
  observacoes text,
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'finalizado', 'cancelado')),
  fotos_urls text[] not null default '{}',
  estoque_aplicado boolean not null default false,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  reaberto_em timestamptz,
  legacy_reference text unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.servico_itens (
  id uuid primary key default gen_random_uuid(),
  servico_id uuid not null references public.servicos(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  quantidade numeric(10,2) not null check (quantidade > 0),
  observacao text,
  created_at timestamptz not null default now(),
  unique (servico_id, produto_id)
);

alter table public.movimentacoes add column if not exists servico_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimentacoes_servico_id_fkey') then
    alter table public.movimentacoes
      add constraint movimentacoes_servico_id_fkey foreign key (servico_id)
      references public.servicos(id) on delete set null;
  end if;
end $$;

-- Converte cada grupo de saidas legado em um servico real, sem tocar no estoque.
insert into public.servicos (
  cliente_id, tecnico_id, descricao, fotos_urls, status, estoque_aplicado,
  iniciado_em, finalizado_em, legacy_reference, created_at, updated_at
)
select distinct on (m.referencia)
  m.cliente_id,
  m.tecnico_id,
  coalesce(nullif(split_part(regexp_replace(coalesce(m.observacao, ''), '^Servico:\s*', '', 'i'), ' | Item: ', 1), ''), 'Servico registrado'),
  coalesce(m.fotos_urls, case when m.foto_url is not null then array[m.foto_url] else '{}'::text[] end),
  'finalizado', true, m.created_at, m.created_at, m.referencia, m.created_at, m.created_at
from public.movimentacoes m
where m.tipo = 'saida'
  and m.referencia like 'servico:%'
  and m.tecnico_id is not null
order by m.referencia, m.created_at
on conflict (legacy_reference) do nothing;

insert into public.servico_itens (servico_id, produto_id, quantidade, observacao, created_at)
select s.id, m.produto_id, sum(m.quantidade),
  nullif(string_agg(nullif(split_part(coalesce(m.observacao, ''), ' | Item: ', 2), ''), ' / '), ''),
  min(m.created_at)
from public.movimentacoes m
join public.servicos s on s.legacy_reference = m.referencia
where m.tipo = 'saida'
group by s.id, m.produto_id
on conflict (servico_id, produto_id) do nothing;

update public.movimentacoes m
set servico_id = s.id
from public.servicos s
where m.servico_id is null and s.legacy_reference = m.referencia;

create table if not exists public.client_logins (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  empresa text,
  tipo_acesso text not null,
  sistema_equipamento text not null,
  url_ip text,
  usuario_encrypted text not null,
  senha_encrypted text not null,
  observacoes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  entry_type text not null check (entry_type in ('entrada', 'saida_almoco', 'retorno_almoco', 'saida')),
  occurred_at timestamptz not null default now(),
  work_date date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision not null check (accuracy >= 0),
  address text,
  created_at timestamptz not null default now(),
  unique (user_id, work_date, entry_type)
);

create index if not exists idx_produtos_categoria on public.produtos(categoria_id);
create index if not exists idx_produtos_nome_lower on public.produtos(lower(nome));
create index if not exists idx_servicos_status_created on public.servicos(status, created_at desc);
create index if not exists idx_servicos_cliente on public.servicos(cliente_id);
create index if not exists idx_servicos_tecnico on public.servicos(tecnico_id);
create index if not exists idx_servico_itens_produto on public.servico_itens(produto_id);
create index if not exists idx_movimentacoes_servico on public.movimentacoes(servico_id);
create index if not exists idx_client_logins_cliente on public.client_logins(cliente_id);
create index if not exists idx_client_logins_tipo on public.client_logins(tipo_acesso);
create index if not exists idx_time_entries_user_date on public.time_entries(user_id, work_date desc, occurred_at);
create index if not exists idx_time_entries_date on public.time_entries(work_date desc);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and ativo = true);
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and ativo = true);
$$;

create or replace function public.save_service(
  p_service_id uuid,
  p_cliente_id uuid,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_descricao text,
  p_observacoes text,
  p_fotos_urls text[],
  p_itens jsonb
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cliente_id uuid := p_cliente_id;
  v_item jsonb;
begin
  if not public.is_active_user() then raise exception 'Usuario nao autorizado'; end if;
  if nullif(trim(p_descricao), '') is null then raise exception 'Informe a descricao do servico'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione pelo menos um produto';
  end if;

  if v_cliente_id is null and nullif(trim(p_cliente_nome), '') is not null then
    insert into public.clientes(nome, telefone)
    values(trim(p_cliente_nome), nullif(trim(p_cliente_telefone), '')) returning id into v_cliente_id;
  end if;
  if v_cliente_id is null then raise exception 'Informe o cliente'; end if;

  if p_service_id is null then
    insert into public.servicos(cliente_id, tecnico_id, descricao, observacoes, fotos_urls)
    values(v_cliente_id, auth.uid(), trim(p_descricao), nullif(trim(p_observacoes), ''), coalesce(p_fotos_urls, '{}'))
    returning id into v_id;
  else
    select id into v_id from public.servicos
    where id = p_service_id and ativo = true and status = 'em_andamento'
      and (tecnico_id = auth.uid() or public.is_admin())
    for update;
    if v_id is null then raise exception 'Servico nao encontrado ou nao esta editavel'; end if;
    update public.servicos set cliente_id=v_cliente_id, descricao=trim(p_descricao),
      observacoes=nullif(trim(p_observacoes), ''), fotos_urls=coalesce(p_fotos_urls, '{}'), updated_at=now()
    where id=v_id;
    delete from public.servico_itens where servico_id=v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    if coalesce((v_item->>'quantidade')::numeric, 0) <= 0 then raise exception 'Quantidade invalida'; end if;
    if not exists(select 1 from public.produtos where id=(v_item->>'produto_id')::uuid and ativo=true) then
      raise exception 'Produto invalido ou inativo';
    end if;
    insert into public.servico_itens(servico_id, produto_id, quantidade, observacao)
    values(v_id, (v_item->>'produto_id')::uuid, (v_item->>'quantidade')::numeric, nullif(trim(v_item->>'observacao'), ''));
  end loop;
  return v_id;
end;
$$;

create or replace function public.finalize_service(p_service_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_service public.servicos%rowtype; v_item record; v_stock numeric;
begin
  if not public.is_active_user() then raise exception 'Usuario nao autorizado'; end if;
  select * into v_service from public.servicos where id=p_service_id and ativo=true for update;
  if not found or (v_service.tecnico_id <> auth.uid() and not public.is_admin()) then raise exception 'Servico nao encontrado'; end if;
  if v_service.status <> 'em_andamento' or v_service.estoque_aplicado then raise exception 'Servico ja finalizado'; end if;
  if not exists(select 1 from public.servico_itens where servico_id=p_service_id) then raise exception 'Servico sem produtos'; end if;

  for v_item in select si.*, p.nome from public.servico_itens si join public.produtos p on p.id=si.produto_id where si.servico_id=p_service_id order by si.produto_id loop
    select quantidade into v_stock from public.produtos where id=v_item.produto_id and ativo=true for update;
    if v_stock is null or v_stock < v_item.quantidade then
      raise exception 'Estoque insuficiente para % (disponivel: %, necessario: %)', v_item.nome, coalesce(v_stock,0), v_item.quantidade;
    end if;
    insert into public.movimentacoes(produto_id, cliente_id, tecnico_id, tipo, quantidade, observacao, referencia, fotos_urls, servico_id)
    values(v_item.produto_id, v_service.cliente_id, auth.uid(), 'saida', v_item.quantidade,
      'Servico: ' || v_service.descricao || case when v_item.observacao is not null then ' | Item: ' || v_item.observacao else '' end,
      'servico:' || v_service.id, v_service.fotos_urls, v_service.id);
  end loop;
  update public.servicos set status='finalizado', estoque_aplicado=true, finalizado_em=now(), updated_at=now() where id=p_service_id;
end;
$$;

create or replace function public.reopen_service(p_service_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_service public.servicos%rowtype; v_item record;
begin
  if not public.is_active_user() then raise exception 'Usuario nao autorizado'; end if;
  select * into v_service from public.servicos where id=p_service_id and ativo=true for update;
  if not found or (v_service.tecnico_id <> auth.uid() and not public.is_admin()) then raise exception 'Servico nao encontrado'; end if;
  if v_service.status <> 'finalizado' or not v_service.estoque_aplicado then raise exception 'Servico nao esta finalizado'; end if;

  for v_item in select * from public.servico_itens where servico_id=p_service_id order by produto_id loop
    perform 1 from public.produtos where id=v_item.produto_id for update;
    insert into public.movimentacoes(produto_id, cliente_id, tecnico_id, tipo, quantidade, observacao, referencia, fotos_urls, servico_id)
    values(v_item.produto_id, v_service.cliente_id, auth.uid(), 'entrada', v_item.quantidade,
      'Estorno por reabertura do servico', 'servico:' || v_service.id || ':reabertura:' || extract(epoch from now())::bigint,
      v_service.fotos_urls, v_service.id);
  end loop;
  update public.servicos set status='em_andamento', estoque_aplicado=false, finalizado_em=null, reaberto_em=now(), updated_at=now() where id=p_service_id;
end;
$$;

create or replace function public.adjust_stock(p_product_id uuid, p_delta numeric, p_reason text)
returns numeric
language plpgsql security definer
set search_path = public
as $$
declare v_current numeric; v_new numeric;
begin
  if not public.is_active_user() then raise exception 'Usuario nao autorizado'; end if;
  if p_delta = 0 then raise exception 'Informe uma quantidade diferente de zero'; end if;
  select quantidade into v_current from public.produtos where id=p_product_id and ativo=true for update;
  if not found then raise exception 'Produto nao encontrado'; end if;
  v_new := coalesce(v_current,0) + p_delta;
  if v_new < 0 then raise exception 'Estoque insuficiente'; end if;
  insert into public.movimentacoes(produto_id, tecnico_id, tipo, quantidade, observacao)
  values(p_product_id, auth.uid(), case when p_delta > 0 then 'entrada' else 'saida' end, abs(p_delta), nullif(trim(p_reason),''));
  return v_new;
end;
$$;

create or replace function public.register_time_entry(
  p_entry_type text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision,
  p_address text
)
returns public.time_entries
language plpgsql security definer
set search_path = public
as $$
declare v_expected text; v_last text; v_result public.time_entries;
begin
  if not public.is_active_user() then raise exception 'Usuario nao autorizado'; end if;
  if p_entry_type not in ('entrada','saida_almoco','retorno_almoco','saida') then raise exception 'Tipo de registro invalido'; end if;
  if p_latitude is null or p_longitude is null or p_accuracy is null then raise exception 'Localizacao obrigatoria'; end if;

  select entry_type into v_last from public.time_entries
  where user_id=auth.uid() and work_date=(now() at time zone 'America/Sao_Paulo')::date
  order by occurred_at desc limit 1 for update;
  v_expected := case v_last when 'entrada' then 'saida_almoco' when 'saida_almoco' then 'retorno_almoco' when 'retorno_almoco' then 'saida' when 'saida' then null else 'entrada' end;
  if v_expected is null then raise exception 'Jornada de hoje ja foi encerrada'; end if;
  if p_entry_type <> v_expected then raise exception 'Proximo registro esperado: %', replace(v_expected,'_',' '); end if;

  insert into public.time_entries(user_id, entry_type, latitude, longitude, accuracy, address)
  values(auth.uid(), p_entry_type, p_latitude, p_longitude, p_accuracy, nullif(trim(p_address),'')) returning * into v_result;
  return v_result;
end;
$$;

alter table public.categorias enable row level security;
alter table public.servicos enable row level security;
alter table public.servico_itens enable row level security;
alter table public.client_logins enable row level security;
alter table public.time_entries enable row level security;

drop policy if exists categorias_active_users on public.categorias;
create policy categorias_active_users on public.categorias for all using (public.is_active_user()) with check (public.is_active_user());
create policy servicos_select_active on public.servicos for select using (public.is_active_user());
create policy servico_itens_select_active on public.servico_itens for select using (public.is_active_user());
create policy time_entries_select on public.time_entries for select using (user_id=auth.uid() or public.is_admin());

-- O cofre e acessivel apenas pela Edge Function com service role.
revoke all on public.client_logins from anon, authenticated;
grant select on public.categorias, public.servicos, public.servico_itens, public.time_entries to authenticated;
grant execute on function public.save_service(uuid,uuid,text,text,text,text,text[],jsonb) to authenticated;
grant execute on function public.finalize_service(uuid) to authenticated;
grant execute on function public.reopen_service(uuid) to authenticated;
grant execute on function public.adjust_stock(uuid,numeric,text) to authenticated;
grant execute on function public.register_time_entry(text,double precision,double precision,double precision,text) to authenticated;

drop trigger if exists set_updated_at_servicos on public.servicos;
create trigger set_updated_at_servicos before update on public.servicos for each row execute function public.handle_updated_at();
drop trigger if exists set_updated_at_client_logins on public.client_logins;
create trigger set_updated_at_client_logins before update on public.client_logins for each row execute function public.handle_updated_at();
