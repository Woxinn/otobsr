alter table if exists discrepancy_rows
  alter column order_qty type numeric(20,4),
  alter column packing_qty type numeric(20,4),
  alter column diff_qty type numeric(20,4);
