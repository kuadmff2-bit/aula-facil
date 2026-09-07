create table if not exists public.payment_refund_attempts (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  school_id uuid not null,
  provider text not null,
  provider_payment_id text not null,
  lease_token uuid,
  lease_expires_at timestamptz,
  status text not null default 'idle' check (status in ('idle','processing','completed','failed')),
  requested_total numeric(14,2) not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_refund_attempts enable row level security;
revoke all on public.payment_refund_attempts from anon, authenticated;

create or replace function public.service_claim_payment_refund_attempt(
  target_payment uuid,
  target_requested_total numeric
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  p public.payments%rowtype;
  existing public.payment_refund_attempts%rowtype;
  token uuid := gen_random_uuid();
  now_value timestamptz := now();
  normalized_total numeric(14,2);
begin
  select * into p from public.payments where id=target_payment for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.provider is null or p.provider_payment_id is null then raise exception 'Provider payment identity is required'; end if;
  if p.status not in ('confirmed'::public.payment_status, 'refunded'::public.payment_status) then raise exception 'Payment is not refundable'; end if;

  normalized_total := round(coalesce(target_requested_total,0)::numeric,2);
  if normalized_total <= coalesce(p.refunded_amount,0) then
    return jsonb_build_object('action','already_applied','refundedAmount',coalesce(p.refunded_amount,0),'refundStatus',coalesce(p.refund_status,'none'));
  end if;
  if normalized_total > p.amount_received then raise exception 'Requested refund exceeds payment amount'; end if;

  select * into existing from public.payment_refund_attempts where payment_id=p.id for update;
  if found and existing.status='processing' and existing.lease_expires_at is not null and existing.lease_expires_at > now_value then
    return jsonb_build_object('action','busy','leaseExpiresAt',existing.lease_expires_at,'requestedTotal',existing.requested_total);
  end if;

  insert into public.payment_refund_attempts(payment_id,school_id,provider,provider_payment_id,lease_token,lease_expires_at,status,requested_total,last_error,updated_at)
  values(p.id,p.school_id,p.provider,p.provider_payment_id,token,now_value + interval '2 minutes','processing',normalized_total,null,now_value)
  on conflict (payment_id) do update set
    school_id=excluded.school_id,
    provider=excluded.provider,
    provider_payment_id=excluded.provider_payment_id,
    lease_token=excluded.lease_token,
    lease_expires_at=excluded.lease_expires_at,
    status='processing',
    requested_total=excluded.requested_total,
    last_error=null,
    updated_at=excluded.updated_at;

  return jsonb_build_object('action','claimed','leaseToken',token,'requestedTotal',normalized_total,'alreadyRefunded',coalesce(p.refunded_amount,0));
end;
$$;

create or replace function public.service_complete_payment_refund_attempt(
  target_payment uuid,
  target_lease_token uuid,
  target_requested_total numeric
) returns void
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
begin
  update public.payment_refund_attempts
  set status='completed', lease_expires_at=null, requested_total=round(coalesce(target_requested_total,0)::numeric,2), last_error=null, updated_at=now()
  where payment_id=target_payment and lease_token=target_lease_token;
  if not found then raise exception 'Refund attempt lease is not valid'; end if;
end;
$$;

create or replace function public.service_fail_payment_refund_attempt(
  target_payment uuid,
  target_lease_token uuid,
  target_error text
) returns void
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
begin
  update public.payment_refund_attempts
  set status='failed', lease_expires_at=null, last_error=left(coalesce(target_error,'refund failed'),700), updated_at=now()
  where payment_id=target_payment and lease_token=target_lease_token;
end;
$$;

revoke all on function public.service_claim_payment_refund_attempt(uuid,numeric) from public, anon, authenticated;
revoke all on function public.service_complete_payment_refund_attempt(uuid,uuid,numeric) from public, anon, authenticated;
revoke all on function public.service_fail_payment_refund_attempt(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.service_claim_payment_refund_attempt(uuid,numeric) to service_role;
grant execute on function public.service_complete_payment_refund_attempt(uuid,uuid,numeric) to service_role;
grant execute on function public.service_fail_payment_refund_attempt(uuid,uuid,text) to service_role;
