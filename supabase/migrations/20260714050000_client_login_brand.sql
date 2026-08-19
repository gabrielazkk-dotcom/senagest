-- Identidade visual usada nos documentos de credenciais.
-- A coluna e opcional para preservar todos os acessos ja cadastrados.
alter table public.client_logins
  add column if not exists marca text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'client_logins_marca_check'
  ) then
    alter table public.client_logins
      add constraint client_logins_marca_check
      check (marca is null or marca in ('generico'));
  end if;
end $$;

create index if not exists idx_client_logins_cliente_marca
  on public.client_logins(cliente_id, marca);
