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

-- Ana carga un gasto que pagó Bea.
select pg_temp.as_user(pg_temp.id('a'));
insert into ids select 'j', public.create_juntada('Asado', '2026-11-07', pg_temp.id('casa'));
insert into ids select 'g', public.create_expense(pg_temp.id('j'), 'Asados', pg_temp.id('comida'), 60000, pg_temp.id('b'),
  array[pg_temp.id('a'), pg_temp.id('b')], p_subcategory_id => pg_temp.id('asados'));

-- Bea (quien pagó) puede editarlo, elegir su alias y marcar que Ana le pagó.
select pg_temp.as_user(pg_temp.id('b'));
select public.update_expense(pg_temp.id('g'), 'Asados', pg_temp.id('comida'), 80000, pg_temp.id('b'), array[pg_temp.id('a'), pg_temp.id('b')],
  p_subcategory_id => pg_temp.id('asados'));
select pg_temp.check((select amount_cents from public.expenses where id = pg_temp.id('g')) = 80000, 'quien pagó puede editar el gasto que cargó otra');
insert into public.member_aliases (member_id, alias, is_primary) values (pg_temp.id('b'), 'bea.banco', true);
select public.set_expense_refund_alias(pg_temp.id('g'), 'bea.banco');
select pg_temp.check((select refund_alias from public.expenses where id = pg_temp.id('g')) = 'bea.banco', 'y elegir su alias');
select public.settle_transfer(pg_temp.id('j'), pg_temp.id('a'), pg_temp.id('b'), 40000);
select pg_temp.check(public.juntada_is_settled(pg_temp.id('j')), 'y marcar que le pagaron');

-- Caro (ni pagó ni cargó) no puede; Bea sí puede quitarlo.
select pg_temp.as_user(pg_temp.id('c'));
select pg_temp.expect_error(format($$select public.update_expense(%L, 'Asados', %L, 1, %L, array[%L]::uuid[], p_subcategory_id => %L)$$,
  pg_temp.id('g'), pg_temp.id('comida'), pg_temp.id('b'), pg_temp.id('b'), pg_temp.id('asados')), 'otra integrante no edita');
select pg_temp.expect_error(format($$select public.void_expense(%L, 'x')$$, pg_temp.id('g')), 'ni quita el gasto');
select pg_temp.as_user(pg_temp.id('b'));
select public.void_expense(pg_temp.id('g'), 'Lo cargaron dos veces');
select pg_temp.check((select status from public.expenses where id = pg_temp.id('g')) = 'void', 'quien pagó puede quitar el gasto');

select pg_temp.as_user(null);
select pg_temp.check(exists (select 1 from information_schema.columns where table_name = 'notification_messages' and column_name = 'last_sent_at'),
  'las frases guardan cuándo se usaron');
