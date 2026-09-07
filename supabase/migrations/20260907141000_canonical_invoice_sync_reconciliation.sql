-- Compatibilidade segura entre mensalidades geradas localmente e na nuvem.
-- A obrigação financeira é identificada por (school_id, student_id, reference),
-- mas versões antigas do desktop enviavam UPSERT apenas pela UUID local.

create table if not exists public.invoice_sync_aliases (
  school_id uuid not null references public.schools(id) on delete cascade,
  local_invoice_id uuid not null,
  canonical_invoice_id uuid not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (school_id, local_invoice_id),
  constraint invoice_sync_aliases_canonical_fkey foreign key (school_id, canonical_invoice_id)
    references public.invoices(school_id, id) on delete cascade,
  constraint invoice_sync_alias_not_self check (local_invoice_id <> canonical_invoice_id)
);

alter table public.invoice_sync_aliases enable row level security;

create index if not exists invoice_sync_aliases_canonical_idx
  on public.invoice_sync_aliases(school_id, canonical_invoice_id);

create or replace function app_private.canonicalize_invoice_sync_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_existing public.invoices%rowtype;
  v_incoming_id uuid;
begin
  -- Exclusivo para snapshots enviados pelo desktop autenticado.
  -- service_role/rotinas internas continuam seguindo o fluxo normal do backend.
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  select i.*
    into v_existing
    from public.invoices i
   where i.school_id = new.school_id
     and i.student_id = new.student_id
     and i.reference = new.reference
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

    -- O registro que já existe no servidor é o canônico.
    new.id := v_existing.id;
    new.created_at := v_existing.created_at;
    new.deleted_at := v_existing.deleted_at;

    -- Identidade e artefatos do provedor são sempre server-owned.
    new.provider := v_existing.provider;
    new.provider_charge_id := v_existing.provider_charge_id;
    new.pix_copy_paste := v_existing.pix_copy_paste;
    new.pix_qr_code_base64 := v_existing.pix_qr_code_base64;
    new.boleto_url := v_existing.boleto_url;
    new.payment_url := v_existing.payment_url;
    new.provider_metadata := v_existing.provider_metadata;

    -- Snapshot local nunca reabre nem altera obrigação já finalizada/emitida.
    if v_existing.status in (
         'paid'::public.invoice_status,
         'cancelled'::public.invoice_status,
         'negotiated'::public.invoice_status
       ) or v_existing.provider_charge_id is not null then
      new.status := v_existing.status;
      new.paid_at := v_existing.paid_at;
      new.due_date := v_existing.due_date;
      new.amount := v_existing.amount;
      new.cancelled_at := v_existing.cancelled_at;
      new.cancellation_reason := v_existing.cancellation_reason;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.canonicalize_invoice_sync_insert() from public;

drop trigger if exists invoices_canonicalize_sync_insert on public.invoices;
create trigger invoices_canonicalize_sync_insert
before insert on public.invoices
for each row execute function app_private.canonicalize_invoice_sync_insert();

create or replace function app_private.canonicalize_payment_invoice_alias()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_original uuid;
  v_canonical uuid;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or new.invoice_id is null then
    return new;
  end if;

  v_original := new.invoice_id;

  select a.canonical_invoice_id
    into v_canonical
    from public.invoice_sync_aliases a
   where a.school_id = new.school_id
     and a.local_invoice_id = v_original;

  if found then
    new.invoice_id := v_canonical;
    update public.invoice_sync_aliases
       set last_seen_at = now()
     where school_id = new.school_id
       and local_invoice_id = v_original;
  end if;

  return new;
end;
$$;

revoke all on function app_private.canonicalize_payment_invoice_alias() from public;

drop trigger if exists payments_canonicalize_invoice_alias on public.payments;
create trigger payments_canonicalize_invoice_alias
before insert or update of invoice_id on public.payments
for each row execute function app_private.canonicalize_payment_invoice_alias();

create or replace function public.aulafacil_explicit_soft_delete(
  p_school_id uuid,
  p_table text,
  p_ids uuid[]
)
returns integer
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;

  select sm.role::text
    into v_role
    from public.school_members sm
   where sm.school_id = p_school_id
     and sm.user_id = v_uid
     and sm.active = true
   limit 1;

  if v_role is null then
    raise exception 'Você não tem acesso ativo a esta instituição.' using errcode = '42501';
  end if;

  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;

  if p_table in ('students', 'classes', 'student_fields') and v_role not in ('owner', 'admin') then
    raise exception 'Somente proprietário ou administrador pode excluir este tipo de registro.' using errcode = '42501';
  elsif p_table = 'notices' and v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Sua função não permite excluir avisos.' using errcode = '42501';
  elsif p_table = 'attendance' and v_role not in ('owner', 'admin', 'teacher', 'staff') then
    raise exception 'Sua função não permite excluir chamadas.' using errcode = '42501';
  elsif p_table = 'grades' and v_role not in ('owner', 'admin', 'teacher') then
    raise exception 'Sua função não permite excluir notas.' using errcode = '42501';
  elsif p_table = 'invoices' and v_role not in ('owner', 'admin', 'finance') then
    raise exception 'Sua função não permite excluir cobranças.' using errcode = '42501';
  elsif p_table not in ('students', 'classes', 'student_fields', 'notices', 'attendance', 'grades', 'invoices') then
    raise exception 'Tipo de registro não permitido.' using errcode = '22023';
  end if;

  perform set_config('aulafacil.explicit_delete', '1', true);

  case p_table
    when 'students' then
      update public.students set deleted_at = now(), active = false
       where school_id = p_school_id and id = any(p_ids) and deleted_at is null;
    when 'classes' then
      update public.classes set deleted_at = now(), active = false
       where school_id = p_school_id and id = any(p_ids) and deleted_at is null;
    when 'student_fields' then
      update public.student_fields set deleted_at = now(), active = false
       where school_id = p_school_id and id = any(p_ids) and deleted_at is null;
    when 'notices' then
      update public.notices set deleted_at = now()
       where school_id = p_school_id and id = any(p_ids) and deleted_at is null;
    when 'attendance' then
      update public.attendance set deleted_at = now()
       where school_id = p_school_id and id = any(p_ids) and deleted_at is null;
    when 'grades' then
      update public.grades set deleted_at = now()
       where school_id = p_school_id and id = any(p_ids) and deleted_at is null;
    when 'invoices' then
      update public.invoices i
         set deleted_at = now()
       where i.school_id = p_school_id
         and i.deleted_at is null
         and (
           i.id = any(p_ids)
           or exists (
             select 1
               from public.invoice_sync_aliases a
              where a.school_id = p_school_id
                and a.local_invoice_id = any(p_ids)
                and a.canonical_invoice_id = i.id
           )
         );
  end case;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
