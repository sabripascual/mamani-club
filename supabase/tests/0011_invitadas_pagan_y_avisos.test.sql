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

create function pg_temp.status(j uuid) returns text language sql as
  $$ select settlement_status from public.v_juntada_status where juntada_id = j $$;

insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','a@x.com','{"first_name":"Ana","last_name":"A","username":"ana"}'),
 ('00000000-0000-0000-0000-00000000000b','b@x.com','{"first_name":"Bea","last_name":"B","username":"bea"}'),
 ('00000000-0000-0000-0000-00000000000c','c@x.com','{"first_name":"Caro","last_name":"C","username":"caro"}');
update public.profiles set status = 'active';
insert into ids values ('a','00000000-0000-0000-0000-00000000000a'), ('b','00000000-0000-0000-0000-00000000000b'), ('c','00000000-0000-0000-0000-00000000000c');
insert into ids select 'casa', id from public.categories where code = 'j_casa';
insert into ids select 'comida', id from public.categories where code = 'comida';
insert into ids select 'asados', id from public.categories where name = 'Asados';

-- Ana paga $90.000 entre Ana, Bea y "Lu" (invitada de Bea). Lu paga lo suyo.
select pg_temp.as_user(pg_temp.id('a'));
insert into ids select 'j', public.create_juntada('Asado', '2026-11-07', pg_temp.id('casa'));
insert into ids select 'g', public.create_expense(pg_temp.id('j'), 'Asados', pg_temp.id('comida'), 9000000, pg_temp.id('a'),
  array[pg_temp.id('a'), pg_temp.id('b')], p_subcategory_id => pg_temp.id('asados'),
  p_guests => jsonb_build_array(jsonb_build_object('name', 'Lu', 'responsible_id', pg_temp.id('b'))));
insert into ids select 'lu', id from public.expense_shares where expense_id = pg_temp.id('g') and guest_name = 'Lu';

select pg_temp.check(pg_temp.net(pg_temp.id('j'), 'b') = -3000000, 'la responsable debe solo su parte ($30.000)');
select pg_temp.check(pg_temp.net(pg_temp.id('j'), 'a') = 3000000, 'a quien pagó, las integrantes le deben $30.000 (lo de Lu va aparte)');
select pg_temp.check((select guests_cents from public.v_juntada_member_balances where juntada_id = pg_temp.id('j') and member_id = pg_temp.id('a')) = 3000000,
  'a quien pagó le deben $30.000 de invitadas');
select pg_temp.check((select count(*) from public.juntada_transfers(pg_temp.id('j'))) = 1
  and (select amount_cents from public.juntada_transfers(pg_temp.id('j'))) = 3000000, 'una sola transferencia: Bea → Ana $30.000');
select pg_temp.check((select creditor_id = pg_temp.id('a') and responsible_id = pg_temp.id('b') and guest_paid_at is null
  from public.v_guest_debts where share_id = pg_temp.id('lu')), 'Lu le debe a Ana, con Bea como responsable');
select pg_temp.check((select pending_cents from public.v_juntada_status where juntada_id = pg_temp.id('j')) = 6000000,
  'pendiente: Bea + Lu ($60.000)');

-- Bea paga lo suyo: la juntada NO queda saldada hasta que pague Lu.
select pg_temp.as_user(pg_temp.id('b'));
select public.settle_transfer(pg_temp.id('j'), pg_temp.id('b'), pg_temp.id('a'), 3000000);
select pg_temp.check(pg_temp.status(pg_temp.id('j')) = 'partial', 'con Lu sin pagar, la juntada queda parcialmente saldada');
select pg_temp.check(not public.juntada_is_settled(pg_temp.id('j')), 'y se pueden seguir cargando gastos');

-- Solo la responsable o una admin marcan el pago de la invitada.
select pg_temp.as_user(pg_temp.id('c'));
select pg_temp.expect_error(format('select public.set_guest_paid(%L, true)', pg_temp.id('lu')), 'otra integrante no marca el pago de la invitada');
select pg_temp.as_user(pg_temp.id('a'));
select pg_temp.expect_error(format('select public.set_guest_paid(%L, true)', pg_temp.id('lu')), 'ni quien cobra (solo responsable o admin)');
select pg_temp.as_user(pg_temp.id('b'));
select public.set_guest_paid(pg_temp.id('lu'), true);
select pg_temp.check((select guest_paid_at is not null and guest_paid_by = pg_temp.id('b') from public.expense_shares where id = pg_temp.id('lu')),
  'la responsable marca que Lu pagó');
select pg_temp.check(pg_temp.status(pg_temp.id('j')) = 'settled', 'ahora la juntada está saldada');
select pg_temp.as_user(null);
select pg_temp.check(exists (select 1 from public.audit_log where entity_id = pg_temp.id('g')::text and action = 'guest_paid'), 'queda en la auditoría');
select pg_temp.as_user(pg_temp.id('b'));

-- Desmarcar vuelve a dejarla pendiente; editar el gasto sin tocar a Lu conserva su pago.
select public.set_guest_paid(pg_temp.id('lu'), false);
select pg_temp.check(pg_temp.status(pg_temp.id('j')) = 'partial', 'desmarcar vuelve a dejar la deuda de Lu');
select public.set_guest_paid(pg_temp.id('lu'), true);
select public.update_expense(pg_temp.id('g'), 'Asados', pg_temp.id('comida'), 9000000, pg_temp.id('a'), array[pg_temp.id('a'), pg_temp.id('b')],
  p_subcategory_id => pg_temp.id('asados'), p_description => 'con chimichurri',
  p_guests => jsonb_build_array(jsonb_build_object('name', 'Lu', 'responsible_id', pg_temp.id('b'))));
select pg_temp.check((select guest_paid_at is not null from public.expense_shares where expense_id = pg_temp.id('g') and guest_name = 'Lu'),
  'editar el gasto sin cambiar la parte de Lu conserva su pago');
select public.update_expense(pg_temp.id('g'), 'Asados', pg_temp.id('comida'), 12000000, pg_temp.id('a'), array[pg_temp.id('a'), pg_temp.id('b')],
  p_subcategory_id => pg_temp.id('asados'),
  p_guests => jsonb_build_array(jsonb_build_object('name', 'Lu', 'responsible_id', pg_temp.id('b'))));
select pg_temp.check((select guest_paid_at is null from public.expense_shares where expense_id = pg_temp.id('g') and guest_name = 'Lu'),
  'si cambia su parte, vuelve a deber');

-- Alias de devolución
select pg_temp.as_user(pg_temp.id('a'));
insert into public.member_aliases (member_id, alias, is_primary) values (pg_temp.id('a'), 'ana.mp', true), (pg_temp.id('a'), 'ana.banco', false);
select public.set_expense_refund_alias(pg_temp.id('g'), 'ana.banco');
select pg_temp.check((select refund_alias from public.expenses where id = pg_temp.id('g')) = 'ana.banco', 'quien pagó elige a qué alias le devuelven');
select pg_temp.expect_error(format($$select public.set_expense_refund_alias(%L, 'otro.alias')$$, pg_temp.id('g')), 'solo alias de quien pagó');
select pg_temp.as_user(pg_temp.id('c'));
select pg_temp.expect_error(format($$select public.set_expense_refund_alias(%L, 'ana.mp')$$, pg_temp.id('g')), 'otra integrante no elige el alias');

-- Frases de evento nuevo
select pg_temp.as_user(null);
select pg_temp.check((select count(*) from public.notification_messages where kind = 'event_new') = 6, 'hay 6 frases para eventos nuevos');
