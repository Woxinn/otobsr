alter table products
  alter column unit_price type numeric(18, 6);

alter table order_items
  alter column unit_price type numeric(18, 6),
  alter column total_amount type numeric(18, 6);

alter table orders
  alter column total_amount type numeric(18, 6);
