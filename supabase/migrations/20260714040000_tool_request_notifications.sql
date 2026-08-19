alter table public.pedidos_ferramentas
  add column if not exists solicitante_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_pedidos_ferramentas_solicitante
  on public.pedidos_ferramentas(solicitante_id);

create index if not exists idx_pedidos_ferramentas_status_created
  on public.pedidos_ferramentas(status, created_at desc);
