update order_items
set unit_price = round((total_amount / quantity::numeric), 6)
where total_amount is not null
  and quantity is not null
  and quantity <> 0;
