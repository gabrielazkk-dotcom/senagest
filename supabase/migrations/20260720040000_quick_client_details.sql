-- Cadastro rapido completo do cliente durante o lancamento do servico.
alter table public.clientes add column if not exists cpf text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_cpf_format_check') then
    alter table public.clientes add constraint clientes_cpf_format_check
      check (cpf is null or cpf ~ '^[0-9]{11}$');
  end if;
end $$;

create unique index if not exists idx_clientes_cpf_unique
  on public.clientes ((regexp_replace(cpf, '\D', '', 'g')))
  where cpf is not null and trim(cpf) <> '';

create or replace function public.save_service_with_client_details(
  p_service_id uuid,
  p_cliente_id uuid,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_cliente_cpf text,
  p_cliente_email text,
  p_cliente_endereco text,
  p_cliente_cidade text,
  p_cliente_observacoes text,
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
declare v_id uuid; v_cliente_criado uuid;
begin
  v_id := public.save_service_with_media(
    p_service_id, p_cliente_id, p_cliente_nome, p_cliente_telefone,
    p_descricao, p_observacoes, p_fotos_urls, p_videos_urls, p_itens
  );

  if p_cliente_id is null then
    select cliente_id into v_cliente_criado from public.servicos where id = v_id;
    update public.clientes
    set cpf = nullif(regexp_replace(coalesce(p_cliente_cpf, ''), '\D', '', 'g'), ''),
        email = nullif(trim(p_cliente_email), ''),
        endereco = nullif(trim(p_cliente_endereco), ''),
        cidade = nullif(trim(p_cliente_cidade), ''),
        observacoes = nullif(trim(p_cliente_observacoes), ''),
        updated_at = now()
    where id = v_cliente_criado;
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_service_with_client_details(uuid,uuid,text,text,text,text,text,text,text,text,text,text[],text[],jsonb) from public;
grant execute on function public.save_service_with_client_details(uuid,uuid,text,text,text,text,text,text,text,text,text,text[],text[],jsonb) to authenticated;

comment on column public.clientes.cpf is 'CPF opcional do cliente, armazenado somente com digitos.';
