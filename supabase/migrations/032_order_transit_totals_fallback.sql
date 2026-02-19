-- Transit toplamında product_id boş ise order_items.name ile products.code eşleştir
create or replace view order_transit_totals as
select
  coalesce(oi.product_id, p.id) as product_id,
  coalesce(sum(coalesce(oi.quantity, 0)), 0)::numeric as transit_qty
from order_items oi
left join orders o on o.id = oi.order_id
left join products p on oi.product_id is null and lower(p.code) = lower(coalesce(oi.name, ''))
where coalesce(lower(o.order_status), '') not in (
  'depoya teslim edildi',
  'depoya teslim',
  'delivered'
)
  and coalesce(oi.product_id, p.id) is not null
group by coalesce(oi.product_id, p.id);

alter view order_transit_totals owner to postgres;
