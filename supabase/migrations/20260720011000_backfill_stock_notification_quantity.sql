-- Inicializa o saldo de estados de alerta criados antes da coluna
-- last_quantity para que a primeira reposicao parcial tambem seja detectada.
update public.stock_notification_state as state
set last_quantity = product.quantidade,
    updated_at = now()
from public.produtos as product
where product.id = state.product_id
  and state.last_quantity is null;
