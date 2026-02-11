alter table orders
  add column if not exists order_status text default 'Siparis Verildi';

update orders
set order_status = 'Siparis Verildi'
where order_status is null;
