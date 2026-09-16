-- Additive upgrade. Existing students, invoices, payments and provider identities are retained.
create schema if not exists af_private;
revoke all on schema af_private from public, anon;
grant usage on schema af_private to authenticated;

create or replace function af_private.require_role(s uuid, roles text[]) returns void
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
 if auth.uid() is null or not exists(select 1 from public.school_members m where m.school_id=s and m.user_id=auth.uid() and m.active and m.role::text=any(roles)) then
  raise exception 'Você não tem permissão para esta ação.' using errcode='42501';
 end if;
end $$;
revoke all on function af_private.require_role(uuid,text[]) from public;
grant execute on function af_private.require_role(uuid,text[]) to authenticated;

create or replace function af_private.valid_cpf(v text) returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare d text:=regexp_replace(coalesce(v,''),'[^0-9]','','g'); s int; c int; n int; j int;
begin
 if d='' then return true; end if;
 if length(d)<>11 or d=repeat(left(d,1),11) then return false; end if;
 for n in 9..10 loop s:=0; for j in 1..n loop s:=s+substr(d,j,1)::int*(n+2-j); end loop; c:=(s*10)%11;if c=10 then c:=0;end if;if c<>substr(d,n+1,1)::int then return false;end if;end loop;return true;
end $$;

create table public.af_courses (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),
 name text not null check(length(trim(name)) between 2 and 160),description text not null default '',
 duration text not null default '',amount numeric(12,2) not null default 0 check(amount>=0),
 modality text not null default 'Presencial' check(modality in ('Presencial','EAD','Híbrido')),
 active boolean not null default true,notes text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(school_id,id)
);
create table public.af_guardians (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),
 name text not null check(length(trim(name)) between 2 and 160),cpf text not null default '' check(af_private.valid_cpf(cpf)),rg text not null default '',
 phone text not null default '',whatsapp text not null default '',email text not null default '',address text not null default '',
 active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(school_id,id)
);
create unique index af_guardians_cpf on public.af_guardians(school_id,cpf) where cpf<>'';
create table public.af_student_guardians (
 school_id uuid not null,student_id uuid not null,guardian_id uuid not null,relationship text not null default 'Responsável',
 primary key(school_id,student_id,guardian_id),
 foreign key(school_id,student_id) references public.students(school_id,id),foreign key(school_id,guardian_id) references public.af_guardians(school_id,id)
);
create index af_guardian_students on public.af_student_guardians(school_id,guardian_id);
alter table public.classes add column if not exists course_id uuid,add column if not exists teacher_user_id uuid references auth.users(id),add column if not exists capacity integer check(capacity between 1 and 1000),add column if not exists shift text not null default '';
alter table public.classes add constraint af_classes_course_fk foreign key(school_id,course_id) references public.af_courses(school_id,id);
create index af_classes_course on public.classes(school_id,course_id);
create index af_classes_teacher on public.classes(teacher_user_id);
alter table public.students add column if not exists rg text not null default '',add column if not exists registration text not null default '',add column if not exists notes text not null default '',add column if not exists photo_path text not null default '',add column if not exists situation text not null default 'active';
alter table public.students add constraint af_student_situation check(situation in ('active','inactive','completed','cancelled','paused'));
create unique index af_students_registration on public.students(school_id,registration) where registration<>'';
create table public.af_enrollments (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),student_id uuid not null,course_id uuid not null,class_id uuid not null,
 original_amount numeric(12,2) not null check(original_amount>0),discount numeric(12,2) not null default 0 check(discount>=0 and discount<original_amount),
 due_day int not null check(due_day between 1 and 31),start_date date not null,installments int not null check(installments between 1 and 120),
 method text not null default 'PIX',notes text not null default '',status text not null default 'active' check(status in ('active','paused','cancelled','completed')),
 request_key uuid not null,request_payload jsonb not null default '{}',created_at timestamptz not null default now(),unique(school_id,id),unique(school_id,request_key),
 foreign key(school_id,student_id) references public.students(school_id,id),foreign key(school_id,course_id) references public.af_courses(school_id,id),foreign key(school_id,class_id) references public.classes(school_id,id)
);
create index af_enrollments_student on public.af_enrollments(school_id,student_id);
create index af_enrollments_class on public.af_enrollments(school_id,class_id);
create index af_enrollments_course on public.af_enrollments(school_id,course_id);
alter table public.invoices add column if not exists enrollment_id uuid,add column if not exists original_amount numeric(12,2),add column if not exists enrollment_discount numeric(12,2) not null default 0;
alter table public.invoices add constraint af_invoices_enrollment_fk foreign key(school_id,enrollment_id) references public.af_enrollments(school_id,id);
create index af_invoices_enrollment on public.invoices(school_id,enrollment_id);
alter table public.payments add column if not exists request_key uuid,add column if not exists request_payload jsonb;
create unique index af_payments_request on public.payments(school_id,request_key) where request_key is not null;
create table public.af_receipts (
 id uuid primary key default gen_random_uuid(),school_id uuid not null,payment_id uuid not null,number text not null,snapshot jsonb not null,created_at timestamptz not null default now(),
 unique(school_id,payment_id),unique(school_id,number),foreign key(school_id,payment_id) references public.payments(school_id,id)
);
create table public.af_settings (
 school_id uuid primary key references public.schools(id),pix_key text not null default '',pix_name text not null default '',pix_city text not null default '',pix_bank text not null default '',receipt_text text not null default '',responsible text not null default '',default_due_day int not null default 10 check(default_due_day between 1 and 31)
);
create table public.af_notification_reads (
 school_id uuid not null references public.schools(id),user_id uuid not null references auth.users(id),notification_id text not null,read_at timestamptz not null default now(),primary key(school_id,user_id,notification_id)
);
create index af_notification_user on public.af_notification_reads(user_id);
create table public.af_collection_log (
 id uuid primary key default gen_random_uuid(),school_id uuid not null,student_id uuid not null,actor_id uuid references auth.users(id),created_at timestamptz not null default now(),foreign key(school_id,student_id) references public.students(school_id,id)
);
create index af_collection_student on public.af_collection_log(school_id,student_id,created_at desc);
create index af_collection_actor on public.af_collection_log(actor_id);

-- RLS is a second boundary even when callers bypass the interface.
do $$ declare t text; begin
 foreach t in array array['af_courses','af_guardians','af_student_guardians','af_enrollments','af_receipts','af_settings','af_notification_reads','af_collection_log'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy af_member_read on public.%I for select to authenticated using (app_private.has_school_role(school_id,array[''owner'',''admin'',''finance'',''staff'']::public.school_role[]))',t);
 end loop;
end $$;
-- Users can only see their own notification read state.
drop policy af_member_read on public.af_notification_reads;
create policy af_own_reads on public.af_notification_reads for select to authenticated using(user_id=(select auth.uid()) and app_private.is_school_member(school_id));

create or replace function af_private.audit(s uuid, action text, kind text, entity uuid, details jsonb default '{}') returns void language sql security definer set search_path=pg_catalog,public as $$
 insert into public.audit_logs(school_id,actor_user_id,action,entity_type,entity_id,metadata) values(s,auth.uid(),action,kind,entity::text,details);
$$;
revoke all on function af_private.audit(uuid,text,text,uuid,jsonb) from public,anon,authenticated;

create or replace function af_private.save_record(p_school uuid,p_resource text,p_data jsonb,p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid()); result jsonb; n text:=btrim(p_data->>'name'); doc text; v_parent uuid;
begin
 perform af_private.require_role(p_school,array['owner','admin','staff']);
 if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16000 then raise exception 'Dados inválidos.';end if;
 if n is null or length(n) not between 2 and 160 then raise exception 'Informe um nome entre 2 e 160 caracteres.';end if;
 if coalesce(p_data->>'email','')<>'' and (p_data->>'email')!~'^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'E-mail inválido.';end if;
 if coalesce(p_data->>'phone','')<>'' and regexp_replace(p_data->>'phone','[^0-9]','','g')!~'^(55)?[0-9]{10,11}$' then raise exception 'Telefone inválido. Informe o DDD.';end if;
 if p_id is not null then
  case p_resource
   when 'students' then perform 1 from public.students where id=p_id and school_id=p_school;
   when 'guardians' then perform 1 from public.af_guardians where id=p_id and school_id=p_school;
   when 'courses' then perform 1 from public.af_courses where id=p_id and school_id=p_school;
   when 'classes' then perform 1 from public.classes where id=p_id and school_id=p_school;
   else raise exception 'Cadastro inválido.';
  end case;
  if not found then raise exception 'Registro não encontrado.';end if;
 end if;
 case p_resource
 when 'students' then
  doc:=regexp_replace(coalesce(p_data->>'document_number',''),'[^0-9]','','g');
  if not af_private.valid_cpf(doc) then raise exception 'CPF inválido.';end if;
  if (p_data->>'birth_date')::date not between date '1900-01-01' and current_date or nullif(p_data->>'birth_date','') is null then raise exception 'Data de nascimento inválida.';end if;
  if coalesce(p_data->>'situation','active') not in ('active','inactive','completed','cancelled','paused') then raise exception 'Situação inválida.';end if;
  insert into public.students(id,school_id,name,birth_date,document_number,rg,phone,email,street_name,street_number,neighborhood,city,state,postal_code,registration,notes,situation,active)
  values(v_id,p_school,n,(p_data->>'birth_date')::date,doc,coalesce(p_data->>'rg',''),coalesce(p_data->>'phone',''),coalesce(p_data->>'email',''),coalesce(p_data->>'street_name',''),coalesce(p_data->>'street_number',''),coalesce(p_data->>'neighborhood',''),coalesce(p_data->>'city',''),coalesce(p_data->>'state',''),coalesce(p_data->>'postal_code',''),coalesce(nullif(p_data->>'registration',''),'AF-'||upper(left(v_id::text,8))),coalesce(p_data->>'notes',''),coalesce(p_data->>'situation','active'),coalesce(p_data->>'situation','active')='active')
  on conflict(id) do update set name=excluded.name,birth_date=excluded.birth_date,document_number=excluded.document_number,rg=excluded.rg,phone=excluded.phone,email=excluded.email,street_name=excluded.street_name,street_number=excluded.street_number,neighborhood=excluded.neighborhood,city=excluded.city,state=excluded.state,postal_code=excluded.postal_code,registration=excluded.registration,notes=excluded.notes,situation=excluded.situation,active=excluded.active;
  if nullif(p_data->>'guardian_id','') is not null then
   v_parent:=(p_data->>'guardian_id')::uuid;
   insert into public.af_student_guardians(school_id,student_id,guardian_id,relationship) values(p_school,v_id,v_parent,coalesce(nullif(p_data->>'relationship',''),'Responsável')) on conflict do nothing;
  end if;
  select to_jsonb(s) into result from public.students s where id=v_id;
 when 'guardians' then
  doc:=regexp_replace(coalesce(p_data->>'cpf',''),'[^0-9]','','g');if not af_private.valid_cpf(doc) then raise exception 'CPF inválido.';end if;
  insert into public.af_guardians(id,school_id,name,cpf,rg,phone,whatsapp,email,address,active) values(v_id,p_school,n,doc,coalesce(p_data->>'rg',''),coalesce(p_data->>'phone',''),coalesce(p_data->>'whatsapp',''),coalesce(p_data->>'email',''),coalesce(p_data->>'address',''),coalesce((p_data->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,cpf=excluded.cpf,rg=excluded.rg,phone=excluded.phone,whatsapp=excluded.whatsapp,email=excluded.email,address=excluded.address,active=excluded.active,updated_at=now();
  select to_jsonb(g) into result from public.af_guardians g where id=v_id;
 when 'courses' then
  insert into public.af_courses(id,school_id,name,description,duration,amount,modality,notes,active) values(v_id,p_school,n,coalesce(p_data->>'description',''),coalesce(p_data->>'duration',''),(p_data->>'amount')::numeric,coalesce(p_data->>'modality','Presencial'),coalesce(p_data->>'notes',''),coalesce((p_data->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,description=excluded.description,duration=excluded.duration,amount=excluded.amount,modality=excluded.modality,notes=excluded.notes,active=excluded.active,updated_at=now();
  select to_jsonb(c) into result from public.af_courses c where id=v_id;
 when 'classes' then
  if nullif(p_data->>'teacher_user_id','') is not null and not exists(select 1 from public.school_members where school_id=p_school and user_id=(p_data->>'teacher_user_id')::uuid and active and role='teacher') then raise exception 'Professor não pertence à instituição.';end if;
  insert into public.classes(id,school_id,name,course_id,teacher,teacher_user_id,room,schedule,capacity,shift,active) values(v_id,p_school,n,nullif(p_data->>'course_id','')::uuid,coalesce(p_data->>'teacher',''),nullif(p_data->>'teacher_user_id','')::uuid,coalesce(p_data->>'room',''),coalesce(p_data->>'schedule',''),nullif(p_data->>'capacity','')::int,coalesce(p_data->>'shift',''),coalesce((p_data->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,course_id=excluded.course_id,teacher=excluded.teacher,teacher_user_id=excluded.teacher_user_id,room=excluded.room,schedule=excluded.schedule,capacity=excluded.capacity,shift=excluded.shift,active=excluded.active;
  select to_jsonb(c) into result from public.classes c where id=v_id;
 else raise exception 'Cadastro inválido.';
 end case;
 perform af_private.audit(p_school,case when p_id is null then 'created' else 'updated' end,p_resource,v_id);
 return result;
end $$;

create or replace function af_private.enroll(p_school uuid,p_data jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid; c public.classes%rowtype; e public.af_enrollments%rowtype; k int; month date; due date; a numeric:=(p_data->>'original_amount')::numeric; d numeric:=coalesce((p_data->>'discount')::numeric,0); n int:=(p_data->>'installments')::int; day int:=(p_data->>'due_day')::int;
begin
 perform af_private.require_role(p_school,array['owner','admin','staff','finance']);
 if p_key is null then raise exception 'Identificador da operação obrigatório.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_key::text,0));
 select * into e from public.af_enrollments where school_id=p_school and request_key=p_key;
 if found then
  if e.request_payload is distinct from p_data then raise exception 'A operação já foi usada com outros dados.';end if;return e.id;
 end if;
 if a is null or a<=0 or a>99999999 or round(a,2)<>a or d<0 or d>=a or round(d,2)<>d or n is null or n not between 1 and 120 or day is null or day not between 1 and 31 then raise exception 'Confira valor, desconto, vencimento e quantidade de parcelas.';end if;
 select * into c from public.classes where school_id=p_school and id=(p_data->>'class_id')::uuid and active and deleted_at is null for update;
 if not found or c.course_id is null then raise exception 'Selecione uma turma ativa vinculada a um curso.';end if;
 if not exists(select 1 from public.af_courses where school_id=p_school and id=c.course_id and active) then raise exception 'O curso desta turma está inativo.';end if;
 if not exists(select 1 from public.students where school_id=p_school and id=(p_data->>'student_id')::uuid and active and deleted_at is null) then raise exception 'Aluno ativo não encontrado.';end if;
 if c.capacity is not null and (select count(*) from public.af_enrollments where school_id=p_school and class_id=c.id and status='active')>=c.capacity then raise exception 'Esta turma está lotada.';end if;
 if exists(select 1 from public.af_enrollments where school_id=p_school and class_id=c.id and student_id=(p_data->>'student_id')::uuid and status='active') then raise exception 'Aluno já matriculado nesta turma.';end if;
 insert into public.af_enrollments(school_id,student_id,course_id,class_id,original_amount,discount,due_day,start_date,installments,method,notes,request_key,request_payload)
 values(p_school,(p_data->>'student_id')::uuid,c.course_id,c.id,a,d,day,(p_data->>'start_date')::date,n,coalesce(p_data->>'method','PIX'),coalesce(p_data->>'notes',''),p_key,p_data) returning id into v_id;
 for k in 0..n-1 loop
  month:=(date_trunc('month',(p_data->>'start_date')::date)+(k||' months')::interval)::date;
  due:=month+least(day,extract(day from (month+interval '1 month - 1 day'))::int)-1;
  insert into public.invoices(school_id,student_id,enrollment_id,reference,due_date,amount,original_amount,enrollment_discount,installment_number,plan_generated)
  values(p_school,(p_data->>'student_id')::uuid,v_id,to_char(month,'YYYY-MM')||' / '||left(v_id::text,8),due,a-d,a,d,k+1,true);
 end loop;
 update public.students set class_id=c.id where school_id=p_school and id=(p_data->>'student_id')::uuid and class_id is null;
 perform af_private.audit(p_school,'enrolled','enrollments',v_id,jsonb_build_object('student_id',p_data->>'student_id','amount',a,'discount',d,'installments',n));
 return v_id;
end $$;

create or replace function af_private.pay(p_school uuid,p_invoice uuid,p_amount numeric,p_method text,p_key uuid,p_notes text default '') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.invoices%rowtype; p public.payments%rowtype; total numeric; paid numeric; payload jsonb:=jsonb_build_object('invoice',p_invoice,'amount',p_amount,'method',p_method,'notes',p_notes); snap jsonb;
begin
 perform af_private.require_role(p_school,array['owner','admin','finance']);
 if p_key is null or p_amount is null or p_amount<=0 or p_amount>99999999 or round(p_amount,2)<>p_amount or p_method not in ('PIX','Dinheiro','Cartão','Transferência','Outros') or p_method is null or length(p_notes)>1000 then raise exception 'Confira o valor e a forma de pagamento.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_key::text,0));
 select * into p from public.payments where school_id=p_school and request_key=p_key;
 if found then if p.request_payload<>payload then raise exception 'Identificador já utilizado com outros dados.';end if;return to_jsonb(p);end if;
 select * into i from public.invoices where school_id=p_school and id=p_invoice and deleted_at is null for update;
 if not found then raise exception 'Mensalidade não encontrada.';end if;
 if i.status not in ('pending','overdue') then raise exception 'Esta mensalidade não pode receber pagamento.';end if;
 if i.provider_charge_id is not null then raise exception 'Esta cobrança está no banco. Aguarde a confirmação do provedor ou cancele a cobrança bancária antes da baixa manual.';end if;
 select total_due into total from public.invoice_amount_due(p_invoice,af_private.school_today(p_school));
 select coalesce(sum(amount_received),0) into paid from public.payments where school_id=p_school and invoice_id=p_invoice and status='confirmed';
 if total is null or p_amount>total-paid then raise exception 'O valor excede o saldo da mensalidade. Atualize a tela.';end if;
 insert into public.payments(school_id,student_id,invoice_id,amount_received,principal_amount,payment_method,status,paid_at,notes,created_by,request_key,request_payload)
 values(p_school,i.student_id,i.id,p_amount,p_amount,p_method,'confirmed',now(),left(p_notes,1000),auth.uid(),p_key,payload) returning * into p;
 if paid+p_amount=total then update public.invoices set status='paid',paid_at=p.paid_at where id=i.id and school_id=p_school;end if;
 select jsonb_build_object('institution',s.name,'logo_path',s.logo_url,'legal_name',s.legal_name,'document',s.document_number,'address',s.address,'phone',s.phone,'student',st.name,'registration',st.registration,'reference',i.reference,'due_date',i.due_date,'amount',p.amount_received,'paid_at',p.paid_at,'method',p.payment_method,'number',p.receipt_number,'text',coalesce(f.receipt_text,'')) into snap from public.schools s join public.students st on st.school_id=s.id and st.id=i.student_id left join public.af_settings f on f.school_id=s.id where s.id=p_school;
 insert into public.af_receipts(school_id,payment_id,number,snapshot) values(p_school,p.id,p.receipt_number,snap);
 perform af_private.audit(p_school,'payment_recorded','payments',p.id,jsonb_build_object('student_id',i.student_id,'invoice_id',i.id,'amount',p_amount));
 return to_jsonb(p);
end $$;

-- Narrow public wrappers are invokers. Every privileged implementation checks current membership.
create function public.af_save(p_school uuid,p_resource text,p_data jsonb,p_id uuid default null) returns jsonb language sql security invoker set search_path=pg_catalog as $$select af_private.save_record(p_school,p_resource,p_data,p_id)$$;
create function public.af_enroll(p_school uuid,p_data jsonb,p_key uuid) returns uuid language sql security invoker set search_path=pg_catalog as $$select af_private.enroll(p_school,p_data,p_key)$$;
create function public.af_pay(p_school uuid,p_invoice uuid,p_amount numeric,p_method text,p_key uuid,p_notes text default '') returns jsonb language sql security invoker set search_path=pg_catalog as $$select af_private.pay(p_school,p_invoice,p_amount,p_method,p_key,p_notes)$$;

create function af_private.school_today(p_school uuid) returns date language sql stable security invoker set search_path=pg_catalog,public as $$select (now() at time zone timezone)::date from public.schools where id=p_school$$;
revoke all on function af_private.school_today(uuid) from public,anon;
grant execute on function af_private.school_today(uuid) to authenticated;

create view public.af_invoice_view with (security_invoker=true) as
 select i.*,s.name student_name,s.phone,s.guardian_name,s.guardian_phone,c.name class_name,
 coalesce(p.received,0) received,
 greatest(0,d.total_due-coalesce(p.received,0)) balance,
 case when i.status in ('paid','cancelled','negotiated') then i.status::text when coalesce(p.received,0)>0 then 'partial' when i.due_date<af_private.school_today(i.school_id) then 'overdue' else 'pending' end effective_status
 from public.invoices i join public.students s on s.school_id=i.school_id and s.id=i.student_id
 left join public.classes c on c.school_id=s.school_id and c.id=s.class_id
 left join lateral(select sum(amount_received) received from public.payments p where p.school_id=i.school_id and p.invoice_id=i.id and p.status='confirmed') p on true
 left join lateral public.invoice_amount_due(i.id,af_private.school_today(i.school_id)) d on true;
revoke all on public.af_invoice_view from anon;
grant select on public.af_invoice_view to authenticated;

create function af_private.list_records(p_school uuid,p_resource text,p_search text,p_page int,p_filter text,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb; q text:='%'||replace(replace(left(coalesce(p_search,''),100),'%','\%'),'_','\_')||'%'; v_role text;
begin
 perform af_private.require_role(p_school,array['owner','admin','finance','staff','teacher']);
 select role::text into v_role from public.school_members where school_id=p_school and user_id=auth.uid() and active;
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Página inválida.';end if;
 if v_role='teacher' and p_resource not in ('students','classes') then raise exception 'Sem permissão.' using errcode='42501';end if;
 if p_resource='audit' then perform af_private.require_role(p_school,array['owner','admin']);end if;
 with source as (
 select to_jsonb(s) r from public.students s where p_resource='students' and s.school_id=p_school and s.deleted_at is null
 and (v_role<>'teacher' or exists(select 1 from public.classes c where c.school_id=p_school and c.id=s.class_id and c.teacher_user_id=auth.uid()))
 and (s.name ilike q or s.document_number ilike q or s.phone ilike q or s.registration ilike q) and (p_filter='' or s.situation=p_filter)
 union all select to_jsonb(g) from public.af_guardians g where p_resource='guardians' and g.school_id=p_school and (g.name ilike q or g.cpf ilike q or g.phone ilike q)
 union all select to_jsonb(c) from public.af_courses c where p_resource='courses' and c.school_id=p_school and c.name ilike q
 union all select to_jsonb(c)||jsonb_build_object('course_name',co.name,'student_count',(select count(*) from public.af_enrollments e where e.school_id=p_school and e.class_id=c.id and e.status='active')) from public.classes c left join public.af_courses co on co.school_id=c.school_id and co.id=c.course_id where p_resource='classes' and c.school_id=p_school and c.deleted_at is null and c.name ilike q and (v_role<>'teacher' or c.teacher_user_id=auth.uid())
 union all select to_jsonb(e)||jsonb_build_object('name',s.name,'class_name',c.name,'course_name',co.name) from public.af_enrollments e join public.students s on s.id=e.student_id and s.school_id=e.school_id join public.classes c on c.id=e.class_id and c.school_id=e.school_id join public.af_courses co on co.id=e.course_id and co.school_id=e.school_id where p_resource='enrollments' and e.school_id=p_school and s.name ilike q
 union all select to_jsonb(i)||jsonb_build_object('name',i.student_name) from public.af_invoice_view i where p_resource in ('invoices','collections') and i.school_id=p_school and i.deleted_at is null and (i.student_name ilike q or i.reference ilike q) and (p_filter='' or i.effective_status=p_filter) and (p_from is null or i.due_date>=p_from) and (p_to is null or i.due_date<=p_to) and (p_resource<>'collections' or i.status in ('pending','overdue'))
 union all select to_jsonb(p)||jsonb_build_object('name',s.name,'reference',i.reference) from public.payments p join public.students s on s.id=p.student_id and s.school_id=p.school_id left join public.invoices i on i.id=p.invoice_id and i.school_id=p.school_id where p_resource='payments' and p.school_id=p_school and (s.name ilike q or p.receipt_number ilike q) and (p_from is null or p.paid_at>=p_from::timestamptz) and (p_to is null or p.paid_at<(p_to+1)::timestamptz)
 union all select jsonb_build_object('id',student_id,'school_id',p_school,'name',student_name,'guardian_name',guardian_name,'phone',coalesce(nullif(guardian_phone,''),phone),'count',count(*),'balance',sum(balance),'days',af_private.school_today(p_school)-min(due_date),'last_collection',(select max(l.created_at) from public.af_collection_log l where l.school_id=p_school and l.student_id=i.student_id)) from public.af_invoice_view i where p_resource='debtors' and i.school_id=p_school and i.deleted_at is null and i.status in ('pending','overdue') and i.due_date<af_private.school_today(i.school_id) and i.student_name ilike q group by student_id,student_name,guardian_name,guardian_phone,phone having p_filter='' or (p_filter='1' and count(*)=1) or (p_filter='2' and count(*)=2) or (p_filter='3' and count(*)>=3)
 union all select to_jsonb(a)||jsonb_build_object('name',a.action) from public.audit_logs a where p_resource='audit' and a.school_id=p_school and (a.action ilike q or a.entity_id ilike q)
 ), page as(select r from source order by case when p_resource in ('payments','audit','enrollments') then r->>'created_at' end desc,case when p_resource in ('invoices','collections') then r->>'due_date' end,r->>'name',r->>'id' limit 25 offset p_page*25)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(r) from page),'[]'::jsonb),'total',(select count(*) from source)) into result;
 return result;
end $$;
create function public.af_list(p_school uuid,p_resource text,p_search text default '',p_page int default 0,p_filter text default '',p_from date default null,p_to date default null) returns jsonb language sql stable security invoker set search_path=pg_catalog as $$select af_private.list_records(p_school,p_resource,p_search,p_page,p_filter,p_from,p_to)$$;

create function af_private.dashboard(p_school uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform af_private.require_role(p_school,array['owner','admin','finance','staff']);
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>1096 then raise exception 'Selecione um período válido de até três anos.';end if;
 select jsonb_build_object(
 'students',(select count(*) from public.students where school_id=p_school and deleted_at is null),
 'active',(select count(*) from public.students where school_id=p_school and active and deleted_at is null),
 'new_students',(select count(*) from public.students where school_id=p_school and created_at>=p_from and created_at<p_to+1 and deleted_at is null),
 'received',(select coalesce(sum(amount_received-refunded_amount),0) from public.payments where school_id=p_school and status='confirmed' and paid_at>=p_from and paid_at<p_to+1),
 'pending',(select coalesce(sum(balance),0) from public.af_invoice_view where school_id=p_school and status in ('pending','overdue') and deleted_at is null and due_date between p_from and p_to),
 'overdue',(select coalesce(sum(balance),0) from public.af_invoice_view where school_id=p_school and status in ('pending','overdue') and deleted_at is null and due_date<af_private.school_today(p_school)),
 'invoices',(select count(*) from public.invoices where school_id=p_school and deleted_at is null and due_date between p_from and p_to),
 'paid',(select count(*) from public.invoices where school_id=p_school and status='paid' and deleted_at is null and due_date between p_from and p_to),
 'methods',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from (select payment_method name,sum(amount_received-refunded_amount) amount from public.payments where school_id=p_school and status='confirmed' and paid_at>=p_from and paid_at<p_to+1 group by payment_method) m),
 'recent',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from(select p.id,s.name,p.amount_received,p.paid_at,p.payment_method from public.payments p join public.students s on s.id=p.student_id and s.school_id=p.school_id where p.school_id=p_school and p.status='confirmed' and p.paid_at>=p_from and p.paid_at<p_to+1 order by p.paid_at desc limit 8) r),
 'upcoming',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from(select id,student_name name,due_date,balance from public.af_invoice_view where school_id=p_school and status in ('pending','overdue') and deleted_at is null and due_date>=af_private.school_today(p_school) order by due_date limit 8) r)
 ) into result;return result;
end $$;
create function public.af_dashboard(p_school uuid,p_from date,p_to date) returns jsonb language sql stable security invoker set search_path=pg_catalog as $$select af_private.dashboard(p_school,p_from,p_to)$$;

create function af_private.detail(p_school uuid,p_resource text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform af_private.require_role(p_school,array['owner','admin','finance','staff']);
 if p_resource='students' then
 select jsonb_build_object('student',to_jsonb(s),'guardians',(select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('relationship',sg.relationship)),'[]'::jsonb) from public.af_student_guardians sg join public.af_guardians g on g.id=sg.guardian_id and g.school_id=sg.school_id where sg.school_id=p_school and sg.student_id=s.id),'invoices',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from(select * from public.af_invoice_view where school_id=p_school and student_id=s.id order by due_date desc limit 100) i),'history',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from(select action,entity_type,created_at,metadata from public.audit_logs where school_id=p_school and (entity_id=s.id::text or metadata->>'student_id'=s.id::text) order by created_at desc limit 100) a)) into result from public.students s where school_id=p_school and id=p_id;
 elsif p_resource='receipt' then
 select coalesce(r.snapshot,jsonb_build_object('institution',sc.name,'logo_path',sc.logo_url,'student',s.name,'number',p.receipt_number,'amount',p.amount_received,'paid_at',p.paid_at,'method',p.payment_method,'reference',i.reference))||jsonb_build_object('id',p.id,'status',p.status) into result from public.payments p join public.schools sc on sc.id=p.school_id join public.students s on s.school_id=p.school_id and s.id=p.student_id left join public.invoices i on i.school_id=p.school_id and i.id=p.invoice_id left join public.af_receipts r on r.school_id=p.school_id and r.payment_id=p.id where p.school_id=p_school and p.id=p_id;
 else raise exception 'Consulta inválida.';end if;
 if result is null then raise exception 'Registro não encontrado.';end if;return result;
end $$;
create function public.af_detail(p_school uuid,p_resource text,p_id uuid) returns jsonb language sql stable security invoker set search_path=pg_catalog as $$select af_private.detail(p_school,p_resource,p_id)$$;

create function af_private.settings(p_school uuid,p_data jsonb default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform af_private.require_role(p_school,array['owner','admin','finance','staff']);
 if p_data is not null then
 perform af_private.require_role(p_school,array['owner','admin']);
 if length(btrim(p_data->>'name')) not between 2 and 160 then raise exception 'Nome da instituição inválido.';end if;
 if octet_length(p_data::text)>16000 then raise exception 'Configurações excedem o limite.';end if;
 update public.schools set name=btrim(p_data->>'name'),legal_name=p_data->>'legal_name',document_number=p_data->>'document_number',phone=p_data->>'phone',whatsapp=p_data->>'whatsapp',email=p_data->>'email',address=p_data->>'address',city=p_data->>'city',state=p_data->>'state' where id=p_school;
 insert into public.af_settings(school_id,pix_key,pix_name,pix_city,pix_bank,receipt_text,responsible,default_due_day) values(p_school,coalesce(p_data->>'pix_key',''),coalesce(p_data->>'pix_name',''),coalesce(p_data->>'pix_city',''),coalesce(p_data->>'pix_bank',''),coalesce(p_data->>'receipt_text',''),coalesce(p_data->>'responsible',''),coalesce((p_data->>'default_due_day')::int,10)) on conflict(school_id) do update set pix_key=excluded.pix_key,pix_name=excluded.pix_name,pix_city=excluded.pix_city,pix_bank=excluded.pix_bank,receipt_text=excluded.receipt_text,responsible=excluded.responsible,default_due_day=excluded.default_due_day;
 update public.finance_settings set late_fee_mode='percent',late_fee_value=coalesce((p_data->>'late_fee_value')::numeric,0),interest_mode='monthly_percent',interest_value=coalesce((p_data->>'interest_value')::numeric,0) where school_id=p_school;
 perform af_private.audit(p_school,'settings_updated','schools',p_school);
 end if;
 select to_jsonb(s)||coalesce(to_jsonb(f),'{}'::jsonb)||jsonb_build_object('late_fee_value',fs.late_fee_value,'interest_value',fs.interest_value) into result from public.schools s left join public.af_settings f on f.school_id=s.id join public.finance_settings fs on fs.school_id=s.id where s.id=p_school;
 return result;
end $$;
create function public.af_settings(p_school uuid,p_data jsonb default null) returns jsonb language sql security invoker set search_path=pg_catalog as $$select af_private.settings(p_school,p_data)$$;

create function af_private.action(p_school uuid,p_action text,p_id uuid,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; r text; u uuid; n int; pay public.payments%rowtype; inv public.invoices%rowtype;
begin
 perform af_private.require_role(p_school,array['owner','admin','finance','staff']);
 case p_action
 when 'reverse_payment' then
  perform af_private.require_role(p_school,array['owner','admin','finance']);
  if length(trim(coalesce(p_data->>'reason','')))<5 then raise exception 'Informe o motivo do estorno.';end if;
  select * into pay from public.payments where school_id=p_school and id=p_id;
  if not found or pay.status<>'confirmed' or pay.provider is not null or pay.provider_payment_id is not null then raise exception 'Somente pagamentos manuais confirmados podem ser estornados aqui.';end if;
  select * into inv from public.invoices where school_id=p_school and id=pay.invoice_id for update;
  select * into pay from public.payments where school_id=p_school and id=p_id for update;
  if pay.status<>'confirmed' then raise exception 'Este pagamento já foi estornado.';end if;
  update public.payments set status='cancelled',reversed_at=now(),reversal_reason=left(p_data->>'reason',500) where school_id=p_school and id=p_id;
  perform set_config('aulafacil.allow_invoice_reopen','1',true);
  update public.invoices set status=case when due_date<af_private.school_today(p_school) then 'overdue'::public.invoice_status else 'pending'::public.invoice_status end,paid_at=null where school_id=p_school and id=pay.invoice_id;
  perform af_private.audit(p_school,'payment_reversed','payments',p_id,jsonb_build_object('student_id',pay.student_id,'invoice_id',pay.invoice_id,'amount',pay.amount_received,'reason',left(p_data->>'reason',500)));
 when 'adjust_invoice' then
  perform af_private.require_role(p_school,array['owner','admin','finance']);
  select * into inv from public.invoices where school_id=p_school and id=p_id and status in ('pending','overdue') and provider_charge_id is null for update;
  if not found then raise exception 'Mensalidade não disponível para alteração.';end if;
  if exists(select 1 from public.payments where school_id=p_school and invoice_id=p_id and status='confirmed') then raise exception 'Uma mensalidade com pagamento não pode ter seu valor alterado.';end if;
  if length(trim(coalesce(p_data->>'reason','')))<5 or (p_data->>'amount')::numeric<=0 or round((p_data->>'amount')::numeric,2)<>(p_data->>'amount')::numeric then raise exception 'Informe valor válido e motivo.';end if;
  update public.invoices set amount=(p_data->>'amount')::numeric,due_date=(p_data->>'due_date')::date where school_id=p_school and id=p_id;
  perform af_private.audit(p_school,'invoice_adjusted','invoices',p_id,jsonb_build_object('student_id',inv.student_id,'before_amount',inv.amount,'after_amount',p_data->>'amount','before_due_date',inv.due_date,'after_due_date',p_data->>'due_date','reason',left(p_data->>'reason',500)));
 when 'cancel_invoice' then
  perform af_private.require_role(p_school,array['owner','admin','finance']);
  if length(trim(coalesce(p_data->>'reason','')))<5 then raise exception 'Informe o motivo do cancelamento.';end if;
  perform 1 from public.invoices where school_id=p_school and id=p_id and status in ('pending','overdue') and provider_charge_id is null for update;
  if not found then raise exception 'Esta mensalidade não pode ser cancelada manualmente.';end if;
  if exists(select 1 from public.payments where school_id=p_school and invoice_id=p_id and status='confirmed') then raise exception 'Estorne os pagamentos antes de cancelar.';end if;
  update public.invoices set status='cancelled',cancelled_at=now(),cancellation_reason=left(p_data->>'reason',500) where school_id=p_school and id=p_id;
  perform af_private.audit(p_school,'invoice_cancelled','invoices',p_id,jsonb_build_object('reason',left(p_data->>'reason',500)));
 when 'collection' then
  perform af_private.require_role(p_school,array['owner','admin','finance']);
  insert into public.af_collection_log(school_id,student_id,actor_id) values(p_school,p_id,auth.uid());
 when 'read' then
  insert into public.af_notification_reads(school_id,user_id,notification_id) values(p_school,auth.uid(),p_id::text) on conflict do nothing;
 when 'team' then
  perform af_private.require_role(p_school,array['owner']);
  r:=p_data->>'role';if r not in ('admin','finance','staff','teacher') then raise exception 'Perfil inválido.';end if;
  select id into u from auth.users where lower(email)=lower(trim(p_data->>'email'));
  if u is null then raise exception 'A pessoa deve criar uma conta antes de entrar na equipe.';end if;
  if u=auth.uid() or exists(select 1 from public.school_members where school_id=p_school and user_id=u and role='owner') then raise exception 'O proprietário não pode ser alterado por esta operação.';end if;
  insert into public.school_members(school_id,user_id,role,active) values(p_school,u,r::public.school_role,true) on conflict(school_id,user_id) do update set role=excluded.role,active=true;
  perform af_private.audit(p_school,'member_updated','members',u,jsonb_build_object('role',r));
 when 'remove_member' then
  perform af_private.require_role(p_school,array['owner']);
  update public.school_members set active=false where school_id=p_school and user_id=p_id and role<>'owner';get diagnostics n=row_count;if n=0 then raise exception 'Membro não encontrado ou proprietário protegido.';end if;
  perform af_private.audit(p_school,'member_deactivated','members',p_id);
 else raise exception 'Ação inválida.';
 end case;
 return jsonb_build_object('ok',true);
end $$;
create function public.af_action(p_school uuid,p_action text,p_id uuid,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path=pg_catalog as $$select af_private.action(p_school,p_action,p_id,p_data)$$;

-- All functions deny public/anonymous callers, including private implementations.
do $$ declare f record; begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='af_private' or (n.nspname='public' and p.proname like 'af_%') loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated',f.nspname,f.proname,f.args);
 if f.proname not in ('audit','valid_cpf') then execute format('grant execute on function %I.%I(%s) to authenticated',f.nspname,f.proname,f.args);end if;
 end loop;
end $$;
revoke all on function public.sync_student_billing_profile_from_student() from public,anon,authenticated;

-- Teachers only read their assigned classes/students. Existing permissive policies cannot widen this boundary.
create policy af_student_scope on public.students as restrictive for select to authenticated using (
 app_private.has_school_role(school_id,array['owner','admin','finance','staff']::public.school_role[]) or exists(select 1 from public.classes c where c.school_id=students.school_id and c.id=students.class_id and c.teacher_user_id=(select auth.uid()))
);
create policy af_class_scope on public.classes as restrictive for select to authenticated using (
 app_private.has_school_role(school_id,array['owner','admin','finance','staff']::public.school_role[]) or teacher_user_id=(select auth.uid())
);
create policy af_students_write_scope on public.students as restrictive for update to authenticated using(app_private.has_school_role(school_id,array['owner','admin','staff']::public.school_role[])) with check(app_private.has_school_role(school_id,array['owner','admin','staff']::public.school_role[]));
create policy af_students_insert_scope on public.students as restrictive for insert to authenticated with check(app_private.has_school_role(school_id,array['owner','admin','staff']::public.school_role[]));
create policy af_classes_write_scope on public.classes as restrictive for update to authenticated using(app_private.has_school_role(school_id,array['owner','admin','staff']::public.school_role[])) with check(app_private.has_school_role(school_id,array['owner','admin','staff']::public.school_role[]));
create policy af_classes_insert_scope on public.classes as restrictive for insert to authenticated with check(app_private.has_school_role(school_id,array['owner','admin','staff']::public.school_role[]));
revoke delete on public.students,public.classes,public.invoices,public.payments,public.audit_logs from authenticated,anon;
-- New financial clients use only atomic backend operations. Provider service functions retain service_role access.
revoke insert,update on public.invoices,public.payments from authenticated,anon;
-- Legacy manual settlement still checks membership and locks the invoice internally.
alter function public.confirm_manual_invoice_payment(uuid,uuid,text,numeric,text) security definer;
alter function public.confirm_manual_invoice_payment(uuid,uuid,text,numeric,text) set search_path=pg_catalog,public,pg_temp;
revoke all on function public.confirm_manual_invoice_payment(uuid,uuid,text,numeric,text) from public,anon;
grant execute on function public.confirm_manual_invoice_payment(uuid,uuid,text,numeric,text) to authenticated;

-- Private media: no public URLs and no direct client upload privileges.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('af-media','af-media',false,2097152,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy af_media_read on storage.objects for select to authenticated using(bucket_id='af-media' and app_private.has_school_role((storage.foldername(name))[1]::uuid,array['owner','admin','staff','finance']::public.school_role[]));

-- New writes are validated even when made directly through PostgREST.
alter table public.students add constraint af_students_cpf check(af_private.valid_cpf(document_number)) not valid;
alter table public.students add constraint af_students_name check(length(trim(name)) between 2 and 160) not valid;
alter table public.students add constraint af_students_birth check(birth_date between date '1900-01-01' and current_date) not valid;
alter table public.students add constraint af_students_email check(email='' or email~'^[^\s@]+@[^\s@]+\.[^\s@]+$') not valid;
alter table public.af_guardians add constraint af_guardians_email check(email='' or email~'^[^\s@]+@[^\s@]+\.[^\s@]+$');
grant execute on function af_private.valid_cpf(text) to authenticated;

-- Preserve pre-upgrade status and normalize existing flat guardians without deleting source fields.
update public.students set situation=case when completed_at is not null or enrollment_status='completed' then 'completed' when enrollment_status='paused' then 'paused' when not active then 'inactive' else 'active' end;
insert into public.af_guardians(school_id,name,phone) select distinct school_id,trim(guardian_name),guardian_phone from public.students where length(trim(guardian_name)) between 2 and 160;
insert into public.af_student_guardians(school_id,student_id,guardian_id)
 select s.school_id,s.id,g.id from public.students s join public.af_guardians g on g.school_id=s.school_id and g.name=trim(s.guardian_name) and g.phone=s.guardian_phone on conflict do nothing;
-- Existing classes each receive an explicit course, retaining their original fee and duration.
do $$ declare c record; v uuid; begin
 for c in select * from public.classes where course_id is null loop
 insert into public.af_courses(school_id,name,amount,active,duration) values(c.school_id,left(coalesce(nullif(c.group_name,''),c.name),160),c.monthly_fee,c.active,coalesce(c.duration_months::text||' meses','')) returning id into v;
 update public.classes set course_id=v where id=c.id and school_id=c.school_id;
 end loop;
end $$;
