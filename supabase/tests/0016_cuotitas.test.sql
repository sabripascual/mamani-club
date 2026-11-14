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

create function pg_temp.inst(c uuid, m text) returns table (number int, due_month date, amount_cents bigint) language sql as
  $$ select number, due_month, amount_cents from public.cuotita_installments where cuotita_id = c and member_id = pg_temp.id(m) order by number $$;

insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','a@x.com','{"first_name":"Ana","last_name":"A","username":"ana"}'),
 ('00000000-0000-0000-0000-00000000000b','b@x.com','{"first_name":"Bea","last_name":"B","username":"bea"}'),
 ('00000000-0000-0000-0000-00000000000c','c@x.com','{"first_name":"Caro","last_name":"C","username":"caro"}'),
 ('00000000-0000-0000-0000-00000000000d','d@x.com','{"first_name":"Dani","last_name":"D","username":"dani"}');
update public.profiles set status = 'active';
insert into ids values ('a','00000000-0000-0000-0000-00000000000a'), ('b','00000000-0000-0000-0000-00000000000b'),
  ('c','00000000-0000-0000-0000-00000000000c'), ('d','00000000-0000-0000-0000-00000000000d');

-- Tarjetas: solo marca y nombre, sin números.
select pg_temp.as_user(pg_temp.id('a'));
insert into public.member_cards (member_id, brand, label) values (pg_temp.id('a'), 'visa', 'Galicia') returning id \gset card_
insert into ids values ('card', :'card_id');
select pg_temp.expect_error($$insert into public.member_cards (member_id, brand, label) values ('00000000-0000-0000-0000-00000000000a', 'visa', 'Galicia 4509')$$, 'la tarjeta no acepta números');
select pg_temp.expect_error($$insert into public.member_cards (member_id, brand, label) values ('00000000-0000-0000-0000-00000000000b', 'visa', null)$$, 'no se cargan tarjetas de otra');
select pg_temp.check(public.card_display('naranja', null) = 'Naranja X' and public.card_display('visa', 'Galicia') = 'Visa Galicia', 'nombre de la tarjeta');

-- Ana paga $100.000 con su Visa en 3 cuotas desde diciembre, entre Ana, Bea y Caro.
insert into ids select 'q', public.create_cuotita('Pasajes', 'tarjeta', 10000000, 3, '2026-12-15', pg_temp.id('a'),
  array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c')], p_card_id => pg_temp.id('card'));
select pg_temp.check((select card_label = 'Visa Galicia' and first_month = '2026-12-01' from public.cuotitas where id = pg_temp.id('q')), 'guarda la tarjeta y el mes de la primera cuota');
select pg_temp.check((select sum(amount_cents) from public.cuotita_parts where cuotita_id = pg_temp.id('q')) = 10000000, 'las partes suman el total');
select pg_temp.check(not exists (select 1 from public.cuotita_installments where cuotita_id = pg_temp.id('q') and member_id = pg_temp.id('a')),
  'quien pagó no tiene cuotas (su parte no se la debe a nadie)');
select pg_temp.check((select count(*) from public.cuotita_installments where cuotita_id = pg_temp.id('q')) = 6, 'Bea y Caro: 3 cuotas cada una');
select pg_temp.check((select array_agg(due_month order by number) from pg_temp.inst(pg_temp.id('q'), 'b')) = array['2026-12-01','2027-01-01','2027-02-01']::date[],
  'una cuota por mes, cruzando de año');
select pg_temp.check((select sum(i.amount_cents) from public.cuotita_installments i where i.cuotita_id = pg_temp.id('q') and i.member_id = pg_temp.id('b'))
  = (select amount_cents from public.cuotita_parts where cuotita_id = pg_temp.id('q') and member_id = pg_temp.id('b')), 'las cuotas suman la parte exacta');
select pg_temp.check((select max(amount_cents) - min(amount_cents) from pg_temp.inst(pg_temp.id('q'), 'b')) <= 1, 'cuotas parejas (diferencia de a lo sumo un centavo)');

-- Préstamo: sin tarjeta, personalizado.
insert into ids select 'p', public.create_cuotita('Préstamo a Dani', 'prestamo', 5000000, 4, '2026-12-01', pg_temp.id('a'),
  p_split_type => 'custom', p_custom_shares => jsonb_build_array(jsonb_build_object('member_id', pg_temp.id('d'), 'amount_cents', 5000000)));
select pg_temp.check((select array_agg(amount_cents order by number) from pg_temp.inst(pg_temp.id('p'), 'd')) = array[1250000,1250000,1250000,1250000]::bigint[],
  'préstamo de $50.000 en 4 cuotas de $12.500');

-- Validaciones
select pg_temp.expect_error(format($$select public.create_cuotita('X', 'tarjeta', 1000, 1, '2026-12-01', %L, array[%L, %L]::uuid[])$$,
  pg_temp.id('a'), pg_temp.id('a'), pg_temp.id('b')), 'con tarjeta hay que elegir la tarjeta');
select pg_temp.expect_error(format($$select public.create_cuotita('X', 'prestamo', 1000, 1, '2026-12-01', %L, array[%L]::uuid[])$$,
  pg_temp.id('a'), pg_temp.id('a')), 'tiene que haber alguien que deba');
select pg_temp.expect_error(format($$select public.create_cuotita('X', 'prestamo', 1000, 0, '2026-12-01', %L, array[%L]::uuid[])$$,
  pg_temp.id('a'), pg_temp.id('b')), 'al menos una cuota');

-- Pagos: Bea marca su cuota 1; Dani no puede marcar las de Bea.
select pg_temp.as_user(pg_temp.id('b'));
select public.set_installments_paid(array(select id from public.cuotita_installments where cuotita_id = pg_temp.id('q') and member_id = pg_temp.id('b') and number = 1), true);
select pg_temp.check((select paid_at is not null and paid_by = pg_temp.id('b') from public.cuotita_installments
  where cuotita_id = pg_temp.id('q') and member_id = pg_temp.id('b') and number = 1), 'la deudora marca su cuota pagada');
select pg_temp.as_user(pg_temp.id('d'));
select pg_temp.expect_error(format('select public.set_installments_paid(array[%L]::uuid[], true)',
  (select id from public.cuotita_installments where cuotita_id = pg_temp.id('q') and member_id = pg_temp.id('b') and number = 2)), 'otra integrante no marca cuotas ajenas');

-- Con cuotas pagadas no se cambia el total, pero sí el nombre.
select pg_temp.as_user(pg_temp.id('a'));
select pg_temp.expect_error(format($$select public.update_cuotita(%L, 'Pasajes', 'tarjeta', 20000000, 3, '2026-12-01', %L, array[%L, %L, %L]::uuid[], p_card_id => %L)$$,
  pg_temp.id('q'), pg_temp.id('a'), pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c'), pg_temp.id('card')), 'con cuotas pagadas no se cambia el total');
select public.update_cuotita(pg_temp.id('q'), 'Pasajes a Mendoza', 'tarjeta', 10000000, 3, '2026-12-01', pg_temp.id('a'),
  array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c')], p_card_id => pg_temp.id('card'));
select pg_temp.check((select title from public.cuotitas where id = pg_temp.id('q')) = 'Pasajes a Mendoza'
  and (select count(*) from public.cuotita_installments where cuotita_id = pg_temp.id('q') and paid_at is not null) = 1, 'sí el nombre, y la cuota pagada sigue pagada');

-- Sin cuotas pagadas se puede recalcular todo.
select public.update_cuotita(pg_temp.id('p'), 'Préstamo a Dani', 'prestamo', 6000000, 3, '2027-01-01', pg_temp.id('a'),
  p_split_type => 'custom', p_custom_shares => jsonb_build_array(jsonb_build_object('member_id', pg_temp.id('d'), 'amount_cents', 6000000)));
select pg_temp.check((select array_agg(amount_cents order by number) from pg_temp.inst(pg_temp.id('p'), 'd')) = array[2000000,2000000,2000000]::bigint[], 'recalcula cuotas');

-- Anular: solo quien pagó, quien cargó o una admin.
select pg_temp.as_user(pg_temp.id('c'));
select pg_temp.expect_error(format($$select public.void_cuotita(%L, 'x')$$, pg_temp.id('p')), 'otra integrante no anula');
select pg_temp.as_user(pg_temp.id('a'));
select public.void_cuotita(pg_temp.id('p'), 'Me devolvió todo junto');
select pg_temp.check((select status = 'void' from public.cuotitas where id = pg_temp.id('p')), 'quien pagó anula');

-- Nadie escribe las tablas directo.
select pg_temp.expect_error(format($$update public.cuotita_installments set paid_at = now() where cuotita_id = %L$$, pg_temp.id('q')), 'no se escriben cuotas sin las funciones');
