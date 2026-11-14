-- Pruebas de la migración 0010 (invitadas).
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  execute case when uid is null then 'reset role' else 'set role authenticated' end;
end $$;
create or replace function pg_temp.expect_error(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'OK  %  (rechazado: %)', label, sqlerrm; return; end;
  raise exception 'FALLA  % — debía ser rechazado', label;
end $$;
create or replace function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FALLA  %', label; end if; raise notice 'OK  %', label; end $$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create function pg_temp.net(j uuid, m text) returns bigint language sql as
  $$ select coalesce((select net_cents from public.v_juntada_member_balances where juntada_id = j and member_id = pg_temp.id(m)), 0) $$;


insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','a@x.com','{"first_name":"Ana","last_name":"A","username":"ana"}'),
 ('00000000-0000-0000-0000-00000000000b','b@x.com','{"first_name":"Bea","last_name":"B","username":"bea"}'),
 ('00000000-0000-0000-0000-00000000000c','c@x.com','{"first_name":"Caro","last_name":"C","username":"caro"}');
update public.profiles set status = 'active';
insert into ids values ('a','00000000-0000-0000-0000-00000000000a'), ('b','00000000-0000-0000-0000-00000000000b'), ('c','00000000-0000-0000-0000-00000000000c');
insert into ids select 'casa', id from public.categories where code = 'j_casa';
insert into ids select 'comida', id from public.categories where code = 'comida';
insert into ids select 'asados', id from public.categories where name = 'Asados';

select pg_temp.as_user(pg_temp.id('a'));
-- Una juntada saldada y otra pendiente.
insert into ids select 'j1', public.create_juntada('Saldada', '2026-10-01', pg_temp.id('casa'));
select public.create_expense(pg_temp.id('j1'), 'Asados', pg_temp.id('comida'), 300000, pg_temp.id('a'), array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c')], p_subcategory_id => pg_temp.id('asados'));
select public.settle_transfer(pg_temp.id('j1'), t.from_member, t.to_member, t.amount_cents) from public.juntada_transfers(pg_temp.id('j1')) t;
insert into ids select 'j2', public.create_juntada('Pendiente', '2026-11-01', pg_temp.id('casa'));
select public.create_expense(pg_temp.id('j2'), 'Asados', pg_temp.id('comida'), 600000, pg_temp.id('b'), array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c')], p_subcategory_id => pg_temp.id('asados'));

-- Las transferencias pendientes son exactamente las de calcular juntada por juntada.
select pg_temp.check(not exists (
  (select j.id, t.from_member, t.to_member, t.amount_cents from public.juntadas j cross join lateral public.juntada_transfers(j.id) t where j.status = 'active'
   except select juntada_id, from_member, to_member, amount_cents from public.v_pending_transfers)
  union all
  (select juntada_id, from_member, to_member, amount_cents from public.v_pending_transfers
   except select j.id, t.from_member, t.to_member, t.amount_cents from public.juntadas j cross join lateral public.juntada_transfers(j.id) t where j.status = 'active')
), 'v_pending_transfers da lo mismo que calcular juntada por juntada');
select pg_temp.check(not exists (select 1 from public.v_pending_transfers where juntada_id = pg_temp.id('j1')), 'la juntada saldada no aparece');
select pg_temp.check((select i_owe_cents from public.v_member_balances where member_id = pg_temp.id('a')) = 200000
  and (select owed_to_me_cents from public.v_member_balances where member_id = pg_temp.id('b')) = 400000, 'saldos por integrante correctos');
