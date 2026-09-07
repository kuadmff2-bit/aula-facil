create or replace function app_private.canonicalize_invoice_sync_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_existing public.invoices%rowtype;
  v_incoming_id uuid;
  v_lock_financial boolean;
begin
  -- Compatibilidade exclusiva para snapshots enviados pelo desktop autenticado.
  -- Rotinas internas/service_role continuam usando o fluxo normal do backend.
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  select i.*
    into v_existing
    from public.invoices i
   where i.school_id = new.school_id
     and i.student_id = new.student_id
     and i.reference = new.reference
   for update
   limit 1;

  if found and v_existing.id <> new.id then
    v_incoming_id := new.id;

    insert into public.invoice_sync_aliases(
      school_id, local_invoice_id, canonical_invoice_id, last_seen_at
    ) values (
      new.school_id, v_incoming_id, v_existing.id, now()
    )
    on conflict (school_id, local_invoice_id) do update
      set canonical_invoice_id = excluded.canonical_invoice_id,
          last_seen_at = now();

    -- A obrigação já existe no servidor. Atualizamos a linha canônica diretamente
    -- e retiramos esta linha duplicada do INSERT em lote, evitando que o mesmo
    -- ON CONFLICT tente afetar a mesma linha duas vezes.
    v_lock_financial := v_existing.status in (
      'paid'::public.invoice_status,
      'cancelled'::public.invoice_status,
      'negotiated'::public.invoice_status
    ) or v_existing.provider_charge_id is not null;

    update public.invoices i
       set due_date = case when v_lock_financial then v_existing.due_date else new.due_date end,
           amount = case when v_lock_financial then v_existing.amount else new.amount end,
           status = case when v_lock_financial then v_existing.status else new.status end,
           paid_at = case when v_lock_financial then v_existing.paid_at else new.paid_at end,
           installment_number = new.installment_number,
           plan_generated = new.plan_generated,
           cancelled_at = case when v_lock_financial then v_existing.cancelled_at else new.cancelled_at end,
           cancellation_reason = case when v_lock_financial then v_existing.cancellation_reason else new.cancellation_reason end
     where i.school_id = v_existing.school_id
       and i.id = v_existing.id;

    return null;
  end if;

  return new;
end;
$$;

revoke all on function app_private.canonicalize_invoice_sync_insert() from public;
