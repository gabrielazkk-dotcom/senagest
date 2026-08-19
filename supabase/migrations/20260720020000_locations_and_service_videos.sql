-- Pontos de atendimento reutilizaveis e videos anexados aos servicos.
create table if not exists public.saved_locations (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) between 2 and 120),
  cliente_id uuid references public.clientes(id) on delete set null,
  endereco text,
  referencia text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  precisao double precision check (precisao is null or precisao >= 0),
  criado_por uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_saved_locations_nome on public.saved_locations(nome);
create index if not exists idx_saved_locations_cliente on public.saved_locations(cliente_id);
create index if not exists idx_saved_locations_criador on public.saved_locations(criado_por);

drop trigger if exists saved_locations_updated_at on public.saved_locations;
create trigger saved_locations_updated_at
  before update on public.saved_locations
  for each row execute function public.handle_updated_at();

alter table public.saved_locations enable row level security;

drop policy if exists saved_locations_select_active on public.saved_locations;
create policy saved_locations_select_active on public.saved_locations
  for select using (public.is_active_user());

drop policy if exists saved_locations_insert_active on public.saved_locations;
create policy saved_locations_insert_active on public.saved_locations
  for insert with check (public.is_active_user() and criado_por = auth.uid());

drop policy if exists saved_locations_update_owner_admin on public.saved_locations;
create policy saved_locations_update_owner_admin on public.saved_locations
  for update using (criado_por = auth.uid() or public.is_admin())
  with check (criado_por = auth.uid() or public.is_admin());

drop policy if exists saved_locations_delete_owner_admin on public.saved_locations;
create policy saved_locations_delete_owner_admin on public.saved_locations
  for delete using (criado_por = auth.uid() or public.is_admin());

alter table public.servicos
  add column if not exists videos_urls text[] not null default '{}';

create or replace function public.save_service_with_media(
  p_service_id uuid,
  p_cliente_id uuid,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_descricao text,
  p_observacoes text,
  p_fotos_urls text[],
  p_videos_urls text[],
  p_itens jsonb
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare v_id uuid;
begin
  v_id := public.save_service(
    p_service_id, p_cliente_id, p_cliente_nome, p_cliente_telefone,
    p_descricao, p_observacoes, p_fotos_urls, p_itens
  );

  update public.servicos
  set videos_urls = coalesce(p_videos_urls, '{}'), updated_at = now()
  where id = v_id;

  return v_id;
end;
$$;

grant execute on function public.save_service_with_media(uuid,uuid,text,text,text,text,text[],text[],jsonb)
  to authenticated;

comment on table public.saved_locations is 'Locais de atendimento salvos para navegacao futura.';
comment on column public.servicos.videos_urls is 'Videos de comprovacao e funcionamento anexados ao servico.';
