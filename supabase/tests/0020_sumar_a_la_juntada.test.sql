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
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000d','d@x.com','{"first_name":"Dani","last_name":"D","username":"dani"}');
update public.profiles set status = 'active';
insert into ids values ('d','00000000-0000-0000-0000-00000000000d');

select pg_temp.as_user(pg_temp.id('a'));
insert into ids select 'j', public.create_juntada('Asado', '2026-11-07', pg_temp.id('casa'));
-- La creadora suma a Bea; devuelve solo las nuevas.
select pg_temp.check((select array_agg(x) from public.add_juntada_attendees(pg_temp.id('j'), array[pg_temp.id('b'), pg_temp.id('a')]) x) = array[pg_temp.id('b')], 'suma y devuelve solo las nuevas');
select pg_temp.check(exists (select 1 from public.juntada_attendees where juntada_id = pg_temp.id('j') and member_id = pg_temp.id('b')), 'Bea quedó en la juntada');
-- Bea (ya está) puede sumar a Caro.
select pg_temp.as_user(pg_temp.id('b'));
select count(*) from public.add_juntada_attendees(pg_temp.id('j'), array[pg_temp.id('c')]);
select pg_temp.check(exists (select 1 from public.juntada_attendees where juntada_id = pg_temp.id('j') and member_id = pg_temp.id('c')), 'una asistente puede sumar a otra');
-- Dani no está: no puede sumar a nadie (pero sí sumarse sola).
select pg_temp.as_user(pg_temp.id('d'));
select pg_temp.expect_error($q$ select public.add_juntada_attendees(pg_temp.id('j'), array[pg_temp.id('d')]) $q$, 'quien no está no puede sumar');
select public.join_juntada(pg_temp.id('j'));
select pg_temp.as_user(pg_temp.id('a'));
select pg_temp.expect_error($q$ select public.add_juntada_attendees(pg_temp.id('j'), array['00000000-0000-0000-0000-0000000000ff'::uuid]) $q$, 'no suma integrantes inexistentes');
