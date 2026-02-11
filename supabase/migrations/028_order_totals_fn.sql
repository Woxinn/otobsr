create or replace function order_totals(_order_id uuid)
returns table(total_qty numeric, total_amount numeric)
language sql
stable
as $$
  select
    coalesce(sum(quantity), 0) as total_qty,
    coalesce(sum(coalesce(total_amount, unit_price * quantity)), 0) as total_amount
  from order_items
  where order_id = _order_id;
$$;
