-- Dados de auditoria para a reposicao de ferramentas e saldo anterior usado
-- para detectar transicoes reais de reposicao sem repetir notificacoes.
alter table public.pedidos_ferramentas
  add column if not exists concluido_por uuid references public.profiles(id) on delete set null,
  add column if not exists concluido_em timestamptz;

create index if not exists idx_pedidos_ferramentas_conclusao
  on public.pedidos_ferramentas(concluido_em desc)
  where status = 'concluido';

alter table public.stock_notification_state
  add column if not exists last_quantity numeric;

comment on column public.pedidos_ferramentas.concluido_por
  is 'Usuario que confirmou a reposicao da ferramenta.';
comment on column public.pedidos_ferramentas.concluido_em
  is 'Momento em que a reposicao da ferramenta foi confirmada.';
comment on column public.stock_notification_state.last_quantity
  is 'Ultimo saldo observado para detectar reposicoes sem alertas duplicados.';
