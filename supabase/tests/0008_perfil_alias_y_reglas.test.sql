-- Pruebas de la migración 0008.
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

insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','a@x.com','{"first_name":"Ana","last_name":"A","username":"ana","birth_date":"1995-11-20"}'),
 ('00000000-0000-0000-0000-00000000000b','b@x.com','{"first_name":"Bea","last_name":"B","username":"bea","birth_date":"no-es-fecha"}'),
 ('00000000-0000-0000-0000-00000000000c','c@x.com','{"first_name":"Caro","last_name":"C","username":"caro"}');
update public.profiles set status = 'active';
insert into ids values ('a','00000000-0000-0000-0000-00000000000a'), ('b','00000000-0000-0000-0000-00000000000b'), ('c','00000000-0000-0000-0000-00000000000c');

select pg_temp.check((select birth_date from public.profiles where username = 'ana') = '1995-11-20', 'el registro guarda la fecha de nacimiento');
select pg_temp.check((select birth_date from public.profiles where username = 'bea') is null, 'una fecha inválida no rompe el registro');

-- Fecha editable por la propia integrante
select pg_temp.as_user(pg_temp.id('b'));
update public.profiles set birth_date = '1996-02-29' where id = auth.uid();
select pg_temp.check((select birth_date from public.profiles where id = auth.uid()) = '1996-02-29', 'cada una carga su fecha de nacimiento');
select pg_temp.expect_error($$update public.profiles set birth_date = '2999-01-01' where id = auth.uid()$$, 'no se acepta una fecha futura');

-- Alias
insert into public.member_aliases (member_id, alias, label, is_primary) values (auth.uid(), 'Bea.MP', 'Mercado Pago', true);
select pg_temp.check((select alias from public.member_aliases where member_id = auth.uid()) = 'bea.mp', 'el alias se guarda en minúsculas');
select pg_temp.expect_error($$insert into public.member_aliases (member_id, alias) values (auth.uid(), 'abc')$$, 'alias demasiado corto');
select pg_temp.expect_error($$insert into public.member_aliases (member_id, alias) values (auth.uid(), 'con espacio')$$, 'alias con espacios');
select pg_temp.expect_error(format($$insert into public.member_aliases (member_id, alias) values (%L, 'ajeno.alias')$$, pg_temp.id('c')),
  'no se cargan alias a nombre de otra');
insert into public.member_aliases (member_id, alias) values (auth.uid(), 'bea.uala'), (auth.uid(), 'bea.brubank'), (auth.uid(), 'bea.galicia'), (auth.uid(), 'bea.naranja');
select pg_temp.expect_error($$insert into public.member_aliases (member_id, alias) values (auth.uid(), 'bea.sexto')$$, 'máximo 5 alias');
select public.set_primary_alias((select id from public.member_aliases where alias = 'bea.uala'));
select pg_temp.check((select alias from public.member_aliases where member_id = auth.uid() and is_primary) = 'bea.uala'
  and (select count(*) from public.member_aliases where member_id = auth.uid() and is_primary) = 1, 'un solo alias principal');
select pg_temp.as_user(pg_temp.id('c'));
select pg_temp.check((select count(*) from public.member_aliases where member_id = pg_temp.id('b')) = 5, 'las demás ven los alias para transferir');
select pg_temp.expect_error(format($$select public.set_primary_alias(%L)$$, (select id from public.member_aliases where alias = 'bea.mp')), 'no se cambia el principal de otra');
delete from public.member_aliases where alias = 'bea.mp';
select pg_temp.check((select count(*) from public.member_aliases where member_id = pg_temp.id('b')) = 5, 'no se borran alias ajenos');

-- Subcategoría obligatoria y juntada saldada
select pg_temp.as_user(pg_temp.id('a'));
insert into ids select 'casa', id from public.categories where code = 'j_casa';
insert into ids select 'comida', id from public.categories where code = 'comida';
insert into ids select 'asados', id from public.categories where name = 'Asados';
insert into ids select 'j', public.create_juntada('Asado', '2026-11-07', pg_temp.id('casa'), array[pg_temp.id('b')]);
select pg_temp.expect_error(format($$select public.create_expense(%L, 'Carne', %L, 100000, %L, array[%L, %L]::uuid[])$$,
  pg_temp.id('j'), pg_temp.id('comida'), pg_temp.id('a'), pg_temp.id('a'), pg_temp.id('b')), 'sin subcategoría no se guarda el gasto');
select public.create_expense(pg_temp.id('j'), 'Asados', pg_temp.id('comida'), 100000, pg_temp.id('a'), array[pg_temp.id('a'), pg_temp.id('b')],
  p_subcategory_id => pg_temp.id('asados'));
select pg_temp.check(not public.juntada_is_settled(pg_temp.id('j')), 'con deuda pendiente no está saldada');
select public.create_expense(pg_temp.id('j'), 'Asados', pg_temp.id('comida'), 2000, pg_temp.id('a'), array[pg_temp.id('a')],
  p_subcategory_id => pg_temp.id('asados'));
select pg_temp.as_user(pg_temp.id('b'));
select public.settle_transfer(pg_temp.id('j'), pg_temp.id('b'), pg_temp.id('a'), 50000, 'ana.alias');
select pg_temp.check(public.juntada_is_settled(pg_temp.id('j')), 'saldada después de la transferencia');
select pg_temp.expect_error(format($$select public.create_expense(%L, 'Asados', %L, 1000, %L, array[%L]::uuid[], p_subcategory_id => %L)$$,
  pg_temp.id('j'), pg_temp.id('comida'), pg_temp.id('b'), pg_temp.id('b'), pg_temp.id('asados')),
  'a una juntada saldada no se le agregan gastos');
