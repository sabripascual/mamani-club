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

-- Un viaje de varios días, todo el día.
insert into ids select 'viaje', public.create_event('Viaje a Mendoza', '2026-11-28T00:00:00-03:00', pg_temp.id('casa'),
  p_all_day => true, p_ends_at => '2026-12-01T23:59:00-03:00');
select pg_temp.check((select all_day and ends_at = '2026-12-01T23:59:00-03:00' from public.events where id = pg_temp.id('viaje')), 'viaje de todo el día y varios días');

-- Fin igual al inicio: se permite.
insert into ids select 'e', public.create_event('Brindis', '2026-11-21T22:00:00-03:00', pg_temp.id('casa'), p_ends_at => '2026-11-21T22:00:00-03:00');
select pg_temp.check(exists (select 1 from public.events where id = pg_temp.id('e')), 'el fin puede ser igual al inicio');

-- Fin antes del inicio: no.
select pg_temp.expect_error(format($$select public.create_event('X', '2026-11-21T22:00:00-03:00', %L, p_ends_at => '2026-11-21T21:59:00-03:00')$$, pg_temp.id('casa')),
  'no puede terminar antes de empezar');
select pg_temp.expect_error(format($$select public.update_event(%L, 'X', '2026-11-21T22:00:00-03:00', %L, p_ends_at => '2026-11-20T23:00:00-03:00')$$, pg_temp.id('e'), pg_temp.id('casa')),
  'tampoco al editar');

-- Registro del cron: solo las admins lo ven; nadie lo escribe desde la app.
select pg_temp.as_user(null);
insert into public.cron_runs (job, ok, planned, sent) values ('diario', true, 3, 2);
select pg_temp.as_user(pg_temp.id('a'));
select pg_temp.check((select count(*) from public.cron_runs) = 0, 'una integrante no ve las corridas del cron');
select pg_temp.expect_error($$insert into public.cron_runs (job, ok) values ('manual', true)$$, 'ni puede escribirlas');
select pg_temp.as_user(null);
update public.profiles set role = 'admin' where id = pg_temp.id('a');
select pg_temp.as_user(pg_temp.id('a'));
select pg_temp.check((select count(*) from public.cron_runs) = 1, 'una admin sí las ve');
