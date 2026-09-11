create or replace function public.sync_student_billing_profile_from_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  doc text := regexp_replace(coalesce(new.document_number, ''), '\D', '', 'g');
  phone_digits text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
  cep_digits text := regexp_replace(coalesce(new.postal_code, ''), '\D', '', 'g');
  student_email text := lower(btrim(coalesce(new.email, '')));
  student_state text := upper(btrim(coalesce(new.state, '')));
begin
  if new.deleted_at is not null then
    return new;
  end if;

  insert into public.student_billing_profiles (
    school_id, student_id, payer_name, email, document_number, phone,
    postal_code, street_name, street_number, neighborhood, city, state, updated_at
  ) values (
    new.school_id,
    new.id,
    case when char_length(btrim(new.name)) between 2 and 180 then btrim(new.name) else null end,
    case when student_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then student_email else null end,
    case when doc ~ '^(\d{11}|\d{14})$' then doc else null end,
    case when phone_digits ~ '^\d{10,11}$' then phone_digits else null end,
    case when cep_digits ~ '^\d{8}$' then cep_digits else null end,
    nullif(btrim(coalesce(new.street_name, '')), ''),
    nullif(btrim(coalesce(new.street_number, '')), ''),
    nullif(btrim(coalesce(new.neighborhood, '')), ''),
    nullif(btrim(coalesce(new.city, '')), ''),
    case when student_state ~ '^[A-Z]{2}$' then student_state else null end,
    now()
  )
  on conflict (school_id, student_id) do update set
    payer_name = coalesce(excluded.payer_name, student_billing_profiles.payer_name),
    email = coalesce(excluded.email, student_billing_profiles.email),
    document_number = coalesce(excluded.document_number, student_billing_profiles.document_number),
    phone = coalesce(excluded.phone, student_billing_profiles.phone),
    postal_code = coalesce(excluded.postal_code, student_billing_profiles.postal_code),
    street_name = coalesce(excluded.street_name, student_billing_profiles.street_name),
    street_number = coalesce(excluded.street_number, student_billing_profiles.street_number),
    neighborhood = coalesce(excluded.neighborhood, student_billing_profiles.neighborhood),
    city = coalesce(excluded.city, student_billing_profiles.city),
    state = coalesce(excluded.state, student_billing_profiles.state),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists students_sync_billing_profile on public.students;
create trigger students_sync_billing_profile
after insert or update of name, document_number, phone, email, postal_code, street_name, street_number, neighborhood, city, state, deleted_at
on public.students
for each row
execute function public.sync_student_billing_profile_from_student();

insert into public.student_billing_profiles (
  school_id, student_id, payer_name, email, document_number, phone,
  postal_code, street_name, street_number, neighborhood, city, state, updated_at
)
select
  s.school_id,
  s.id,
  case when char_length(btrim(s.name)) between 2 and 180 then btrim(s.name) else null end,
  case when lower(btrim(coalesce(s.email, ''))) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then lower(btrim(s.email)) else null end,
  case when regexp_replace(coalesce(s.document_number, ''), '\D', '', 'g') ~ '^(\d{11}|\d{14})$' then regexp_replace(s.document_number, '\D', '', 'g') else null end,
  case when regexp_replace(coalesce(s.phone, ''), '\D', '', 'g') ~ '^\d{10,11}$' then regexp_replace(s.phone, '\D', '', 'g') else null end,
  case when regexp_replace(coalesce(s.postal_code, ''), '\D', '', 'g') ~ '^\d{8}$' then regexp_replace(s.postal_code, '\D', '', 'g') else null end,
  nullif(btrim(coalesce(s.street_name, '')), ''),
  nullif(btrim(coalesce(s.street_number, '')), ''),
  nullif(btrim(coalesce(s.neighborhood, '')), ''),
  nullif(btrim(coalesce(s.city, '')), ''),
  case when upper(btrim(coalesce(s.state, ''))) ~ '^[A-Z]{2}$' then upper(btrim(s.state)) else null end,
  now()
from public.students s
where s.deleted_at is null
on conflict (school_id, student_id) do update set
  payer_name = coalesce(excluded.payer_name, student_billing_profiles.payer_name),
  email = coalesce(excluded.email, student_billing_profiles.email),
  document_number = coalesce(excluded.document_number, student_billing_profiles.document_number),
  phone = coalesce(excluded.phone, student_billing_profiles.phone),
  postal_code = coalesce(excluded.postal_code, student_billing_profiles.postal_code),
  street_name = coalesce(excluded.street_name, student_billing_profiles.street_name),
  street_number = coalesce(excluded.street_number, student_billing_profiles.street_number),
  neighborhood = coalesce(excluded.neighborhood, student_billing_profiles.neighborhood),
  city = coalesce(excluded.city, student_billing_profiles.city),
  state = coalesce(excluded.state, student_billing_profiles.state),
  updated_at = now();
