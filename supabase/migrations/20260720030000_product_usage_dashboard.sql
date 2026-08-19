-- Relatorio agregado no banco para evitar transferir todo o historico ao celular.
-- Servicos usam seus itens atuais, evitando duplicidade depois de reabrir/finalizar.
create or replace function public.product_usage_dashboard(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  if not public.is_active_user() then
    raise exception 'Usuario nao autorizado';
  end if;

  with usage_rows as (
    select
      item.produto_id,
      item.quantidade,
      service.id as servico_id,
      service.cliente_id,
      service.finalizado_em as utilizado_em
    from public.servicos as service
    join public.servico_itens as item on item.servico_id = service.id
    where service.ativo = true
      and service.status = 'finalizado'
      and service.estoque_aplicado = true
      and (p_from is null or service.finalizado_em >= p_from)
      and (p_to is null or service.finalizado_em < p_to)

    union all

    select
      movement.produto_id,
      movement.quantidade,
      null::uuid as servico_id,
      movement.cliente_id,
      movement.created_at as utilizado_em
    from public.movimentacoes as movement
    where movement.tipo = 'saida'
      and movement.servico_id is null
      and (p_from is null or movement.created_at >= p_from)
      and (p_to is null or movement.created_at < p_to)
  ),
  grouped as (
    select
      usage.produto_id,
      sum(usage.quantidade) as total_utilizado,
      count(*) as registros,
      count(distinct usage.servico_id) as servicos,
      count(distinct usage.cliente_id) as clientes,
      max(usage.utilizado_em) as ultimo_uso
    from usage_rows as usage
    group by usage.produto_id
  ),
  product_rows as (
    select
      product.id as produto_id,
      product.nome,
      product.unidade,
      product.categoria_id,
      category.nome as categoria,
      product.quantidade as quantidade_atual,
      product.estoque_minimo,
      grouped.total_utilizado,
      grouped.registros,
      grouped.servicos,
      grouped.clientes,
      grouped.ultimo_uso
    from grouped
    join public.produtos as product on product.id = grouped.produto_id
    left join public.categorias as category on category.id = product.categoria_id
  ),
  summary as (
    select
      count(distinct produto_id) as produtos,
      count(*) as registros,
      count(distinct servico_id) as servicos,
      count(distinct cliente_id) as clientes
    from usage_rows
  )
  select jsonb_build_object(
    'resumo', jsonb_build_object(
      'produtos', summary.produtos,
      'registros', summary.registros,
      'servicos', summary.servicos,
      'clientes', summary.clientes
    ),
    'produtos', coalesce((
      select jsonb_agg(to_jsonb(product_rows) order by product_rows.total_utilizado desc, product_rows.nome)
      from product_rows
    ), '[]'::jsonb)
  ) into v_result
  from summary;

  return coalesce(v_result, jsonb_build_object(
    'resumo', jsonb_build_object('produtos', 0, 'registros', 0, 'servicos', 0, 'clientes', 0),
    'produtos', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.product_usage_dashboard(timestamptz,timestamptz) from public;
grant execute on function public.product_usage_dashboard(timestamptz,timestamptz) to authenticated;

comment on function public.product_usage_dashboard(timestamptz,timestamptz)
  is 'Ranking agregado de consumo real por produto e periodo.';
