alter table public.students
  add column if not exists email text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists street_name text not null default '',
  add column if not exists street_number text not null default '',
  add column if not exists neighborhood text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '';

-- Reaproveita dados de cobrança já informados anteriormente.
update public.students s
set document_number = case when coalesce(btrim(s.document_number), '') = '' then coalesce(bp.document_number, '') else s.document_number end,
    phone = case when coalesce(btrim(s.phone), '') = '' then coalesce(bp.phone, '') else s.phone end,
    email = case when coalesce(btrim(s.email), '') = '' then coalesce(bp.email, '') else s.email end,
    postal_code = case when coalesce(btrim(s.postal_code), '') = '' then coalesce(bp.postal_code, '') else s.postal_code end,
    street_name = case when coalesce(btrim(s.street_name), '') = '' then coalesce(bp.street_name, '') else s.street_name end,
    street_number = case when coalesce(btrim(s.street_number), '') = '' then coalesce(bp.street_number, '') else s.street_number end,
    neighborhood = case when coalesce(btrim(s.neighborhood), '') = '' then coalesce(bp.neighborhood, '') else s.neighborhood end,
    city = case when coalesce(btrim(s.city), '') = '' then coalesce(bp.city, '') else s.city end,
    state = case when coalesce(btrim(s.state), '') = '' then upper(coalesce(bp.state, '')) else upper(s.state) end
from public.student_billing_profiles bp
where bp.school_id = s.school_id
  and bp.student_id = s.id;
