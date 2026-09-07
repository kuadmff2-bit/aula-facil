create index if not exists provider_reconciliation_school_invoice_idx
  on public.provider_reconciliation_state (school_id, invoice_id);

create index if not exists school_sync_leases_user_idx
  on public.school_sync_leases (user_id);
