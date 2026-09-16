-- Integration assertions run in a transaction after the upgrade; ALWAYS ROLLBACK.
-- Fixtures contain no real student information and are never persisted.
-- Separate block keeps all valid fixtures in this transaction.
do $$
declare u uuid:=gen_random_uuid();other uuid:=gen_random_uuid();s uuid;t uuid;student uuid;course uuid;class uuid;e uuid;inv uuid;k uuid:=gen_random_uuid();p jsonb;again jsonb;res jsonb;denied boolean;
begin
 insert into auth.users(id,email,aud,role) values(u,'af-test-'||u||'@example.invalid','authenticated','authenticated'),(other,'af-test-'||other||'@example.invalid','authenticated','authenticated');
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 s:=public.create_school('Instituição teste A');t:=public.create_school('Instituição teste B');
 student:=(public.af_save(s,'students','{"name":"Aluno de teste","birth_date":"2010-01-01","document_number":""}'::jsonb)->>'id')::uuid;
 course:=(public.af_save(s,'courses','{"name":"Curso teste","amount":"150.10","modality":"Presencial"}'::jsonb)->>'id')::uuid;
 class:=(public.af_save(s,'classes',jsonb_build_object('name','Turma teste','course_id',course,'capacity','10'))->>'id')::uuid;
 e:=public.af_enroll(s,jsonb_build_object('student_id',student,'class_id',class,'original_amount','150.10','discount','20.00','due_day',31,'start_date','2028-02-01','installments',2),gen_random_uuid());
 if (select count(*) from public.invoices where school_id=s and enrollment_id=e)<>2 then raise exception 'FAIL installments';end if;
 if not exists(select 1 from public.invoices where school_id=s and enrollment_id=e and due_date='2028-02-29' and amount=130.10) then raise exception 'FAIL leap year or decimal';end if;
 select id into inv from public.invoices where school_id=s and enrollment_id=e order by due_date limit 1;
 p:=public.af_pay(s,inv,30.10,'PIX',k,'Teste');again:=public.af_pay(s,inv,30.10,'PIX',k,'Teste');
 if p->>'id'<>again->>'id' then raise exception 'FAIL idempotency';end if;
 if (select count(*) from public.payments where school_id=s and invoice_id=inv)<>1 then raise exception 'FAIL duplicate payment';end if;
 if (select balance from public.af_invoice_view where id=inv)<>100 then raise exception 'FAIL partial payment';end if;
 perform public.af_pay(s,inv,100,'Dinheiro',gen_random_uuid(),'');
 if not exists(select 1 from public.invoices where id=inv and status='paid') then raise exception 'FAIL paid status';end if;
 if (select count(*) from public.af_receipts where school_id=s)<>2 then raise exception 'FAIL receipts';end if;
 perform public.af_detail(s,'receipt',(p->>'id')::uuid);
 denied:=false;begin perform public.af_pay(s,inv,-1,'PIX',gen_random_uuid(),'');exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL negative amount';end if;
 denied:=false;begin perform public.af_save(t,'classes',jsonb_build_object('name','Foreign course','course_id',course));exception when foreign_key_violation then denied:=true;end;if not denied then raise exception 'FAIL cross tenant FK';end if;
 execute 'set local role authenticated';
 res:=public.af_list(s,'students');if (res->>'total')::int<>1 then raise exception 'FAIL list';end if;
 res:=public.af_dashboard(s,'2026-01-01','2028-12-31');
 denied:=false;begin perform public.af_pay(s,inv,1,'PIX',gen_random_uuid(),'');exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL settled invoice accepts payment';end if;
 denied:=false;begin perform public.af_save(s,'students','{"name":"CPF inválido","birth_date":"2010-01-01","document_number":"11111111111"}'::jsonb);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL CPF';end if;
 denied:=false;begin perform public.af_pay(s,inv,30.10,'Dinheiro',k,'Teste');exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL idempotency payload';end if;
 perform public.af_action(s,'reverse_payment',(p->>'id')::uuid,jsonb_build_object('reason','Teste de estorno'));
 if (select balance from public.af_invoice_view where id=inv)<>30.10 then raise exception 'FAIL reversal balance';end if;
 if not exists(select 1 from public.af_receipts where school_id=s and payment_id=(p->>'id')::uuid) then raise exception 'FAIL lost receipt after reversal';end if;
 perform set_config('request.jwt.claim.sub',other::text,true);
 denied:=false;begin perform public.af_list(s,'students');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'FAIL isolation';end if;
 execute 'reset role';insert into public.school_members(school_id,user_id,role) values(s,other,'teacher');execute 'set local role authenticated';
 denied:=false;begin perform public.af_list(s,'payments');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'FAIL teacher finance';end if;
 if (select count(*) from public.students where school_id=s)<>0 then raise exception 'FAIL direct RLS teacher';end if;
 denied:=false;begin insert into public.invoices(school_id,student_id,reference,due_date,amount) values(s,student,'forged',current_date,10);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'FAIL direct financial write';end if;
 res:=public.af_list(s,'students');if (res->>'total')::int<>0 then raise exception 'FAIL teacher students';end if;
 perform set_config('request.jwt.claim.sub','',true);
 denied:=false;begin perform public.af_list(s,'students');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'FAIL anonymous';end if;
 execute 'reset role';raise notice 'PASS: enrollment, dates, decimals, partial payment, idempotency, receipts, roles, isolation, anonymous access';
end $$;
