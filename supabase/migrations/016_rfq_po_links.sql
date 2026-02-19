-- RFQ -> Sipariş bağlantıları ve kazanan teklif işaretleri
alter table if not exists rfqs
  add column if not exists selected_supplier_id uuid references suppliers(id),
  add column if not exists selected_quote_id uuid references rfq_quotes(id);

alter table if not exists orders
  add column if not exists rfq_id uuid references rfqs(id);

alter table if not exists order_items
  add column if not exists rfq_quote_item_id uuid references rfq_quote_items(id);
