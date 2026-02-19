-- Yolda sayılacak sipariş kalemleri: "Depoya teslim edildi/depoya teslim/delivered"
-- dışındaki TÜM statüler.
create or replace view order_transit_totals as
select
  oi.product_id,
  coalesce(sum(oi.quantity), 0)::numeric as transit_qty
from order_items oi
left join orders o on o.id = oi.order_id
where coalesce(lower(o.order_status), '') not in (
  'depoya teslim edildi',
  'depoya teslim',
  'delivered'
)
group by oi.product_id;

alter view order_transit_totals owner to postgres;
