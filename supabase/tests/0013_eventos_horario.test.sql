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
 ('00000000-0000-0000-0000-00000000000a','a@x.com','{"first_name":"Ana","last_name":"A","username":"ana"}');
update public.profiles set status = 'active';
insert into ids values ('a','00000000-0000-0000-0000-00000000000a');
insert into ids select 'casa', id from public.categories where code = 'j_casa';
select pg_temp.as_user(pg_temp.id('a'));

-- Con hora de inicio y de fin (pasada la medianoche).
insert into ids select 'e1', public.create_event('Fiesta', '2026-11-21T22:00:00-03:00', pg_temp.id('casa'),
  p_ends_at => '2026-11-22T04:00:00-03:00');
select pg_temp.check((select not all_day and ends_at = '2026-11-22T04:00:00-03:00' from public.events where id = pg_temp.id('e1')), 'evento con inicio y fin');

-- Todo el día: sin hora de fin.
insert into ids select 'e2', public.create_event('Día de campo', '2026-11-23T00:00:00-03:00', pg_temp.id('casa'), p_all_day => true,
  p_ends_at => null);
select pg_temp.check((select all_day and ends_at is null from public.events where id = pg_temp.id('e2')), 'evento de todo el día');

-- Validaciones
select pg_temp.expect_error(format($$select public.create_event('X', '2026-11-21T22:00:00-03:00', %L, p_ends_at => '2026-11-21T21:00:00-03:00')$$, pg_temp.id('casa')),
  'el fin tiene que ser después del inicio');
select pg_temp.expect_error(format($$select public.create_event('X', '2026-11-21T00:00:00-03:00', %L, p_all_day => true, p_ends_at => '2026-11-21T21:00:00-03:00')$$, pg_temp.id('casa')),
  'todo el día no lleva hora de fin');

-- Editar: pasar a todo el día borra la hora de fin.
select public.update_event(pg_temp.id('e1'), 'Fiesta', '2026-11-21T00:00:00-03:00', pg_temp.id('casa'), p_all_day => true);
select pg_temp.check((select all_day and ends_at is null from public.events where id = pg_temp.id('e1')), 'editar a todo el día');
