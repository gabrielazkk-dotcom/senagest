-- Corrige produtos que eram inseridos sem o indicador ativo.
-- Preserva os produtos excluidos logicamente (ativo = false).
begin;

update public.produtos
set ativo = true
where ativo is null;

alter table public.produtos
  alter column ativo set default true;

alter table public.produtos
  alter column ativo set not null;

commit;
