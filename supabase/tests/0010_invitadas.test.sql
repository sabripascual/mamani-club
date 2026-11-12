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

-- Ana paga $90.000 entre Ana, Bea y "Lu" (invitada de Bea).
select pg_temp.as_user(pg_temp.id('a'));
insert into ids select 'j', public.create_juntada('Asado', '2026-11-07', pg_temp.id('casa'));
insert into ids select 'g', public.create_expense(pg_temp.id('j'), 'Asados', pg_temp.id('comida'), 9000000, pg_temp.id('a'),
  array[pg_temp.id('a'), pg_temp.id('b')], p_subcategory_id => pg_temp.id('asados'),
  p_guests => jsonb_build_array(jsonb_build_object('name', 'Lu', 'responsible_id', pg_temp.id('b'))));
select pg_temp.check((select count(*) from public.expense_shares where expense_id = pg_temp.id('g')) = 3
  and (select amount_cents from public.expense_shares where expense_id = pg_temp.id('g') and guest_name = 'Lu') = 3000000,
  'la invitada tiene su parte (3 partes de $30.000)');
select pg_temp.check(pg_temp.net(pg_temp.id('j'), 'b') = -6000000, 'la responsable debe su parte y la de su invitada ($60.000)');
select pg_temp.check(not exists (select 1 from public.juntada_attendees where juntada_id = pg_temp.id('j') and member_id = pg_temp.id('c')),
  'nadie se suma a la juntada por una invitada');

-- Una responsable que no consumió no queda como asistente por su invitada.
insert into ids select 'g2', public.create_expense(pg_temp.id('j'), 'Asados', pg_temp.id('comida'), 100000, pg_temp.id('a'),
  array[pg_temp.id('a')], p_subcategory_id => pg_temp.id('asados'),
  p_guests => jsonb_build_array(jsonb_build_object('name', 'Tomi', 'responsible_id', pg_temp.id('c'))));
select pg_temp.check(not exists (select 1 from public.juntada_attendees where juntada_id = pg_temp.id('j') and member_id = pg_temp.id('c')),
  'la invitada no suma presencia a su responsable');
select pg_temp.check(pg_temp.net(pg_temp.id('j'), 'c') = -50000, 'pero la responsable sí debe la parte de su invitada');

-- Validaciones
select pg_temp.expect_error(format($$select public.create_expense(%L, 'Asados', %L, 1000, %L, array[%L]::uuid[], p_subcategory_id => %L,
  p_guests => %L)$$, pg_temp.id('j'), pg_temp.id('comida'), pg_temp.id('a'), pg_temp.id('a'), pg_temp.id('asados'),
  jsonb_build_array(jsonb_build_object('name', 'Lu', 'responsible_id', pg_temp.id('b')), jsonb_build_object('name', 'lu', 'responsible_id', pg_temp.id('b')))),
  'no se repite la misma invitada');
select pg_temp.expect_error(format($$select public.create_expense(%L, 'Asados', %L, 1000, %L, array[%L]::uuid[], p_subcategory_id => %L,
  p_guests => %L)$$, pg_temp.id('j'), pg_temp.id('comida'), pg_temp.id('a'), pg_temp.id('a'), pg_temp.id('asados'),
  jsonb_build_array(jsonb_build_object('name', 'X', 'responsible_id', '00000000-0000-0000-0000-000000000999'))),
  'la responsable tiene que ser del club');

-- Personalizada con invitada
insert into ids select 'g3', public.create_expense(pg_temp.id('j'), 'Asados', pg_temp.id('comida'), 50000, pg_temp.id('a'),
  p_split_type => 'custom', p_subcategory_id => pg_temp.id('asados'), p_custom_shares => jsonb_build_array(
    jsonb_build_object('member_id', pg_temp.id('a'), 'amount_cents', 20000),
    jsonb_build_object('member_id', pg_temp.id('b'), 'amount_cents', 30000, 'guest_name', 'Lu')));
select pg_temp.check((select amount_cents from public.expense_shares where expense_id = pg_temp.id('g3') and guest_name = 'Lu') = 30000,
  'división personalizada con invitada');

-- Permisos: la responsable puede editar el gasto; otra integrante no.
select pg_temp.as_user(pg_temp.id('b'));
select public.update_expense(pg_temp.id('g'), 'Asados', pg_temp.id('comida'), 9000000, pg_temp.id('a'), array[pg_temp.id('a'), pg_temp.id('b')],
  p_subcategory_id => pg_temp.id('asados'), p_guests => jsonb_build_array(jsonb_build_object('name', 'Lucía', 'responsible_id', pg_temp.id('b'))));
select pg_temp.check(exists (select 1 from public.expense_shares where expense_id = pg_temp.id('g') and guest_name = 'Lucía'),
  'la responsable de la invitada puede actualizar el gasto');
select pg_temp.as_user(pg_temp.id('c'));
select pg_temp.expect_error(format($$select public.update_expense(%L, 'Asados', %L, 1, %L, array[%L]::uuid[], p_subcategory_id => %L)$$,
  pg_temp.id('g'), pg_temp.id('comida'), pg_temp.id('a'), pg_temp.id('a'), pg_temp.id('asados')), 'otra integrante no edita el gasto');
