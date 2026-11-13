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
 ('00000000-0000-0000-0000-00000000000b','b@x.com','{"first_name":"Bea","last_name":"B","username":"bea"}');
update public.profiles set status = 'active';
insert into ids values ('a','00000000-0000-0000-0000-00000000000a'), ('b','00000000-0000-0000-0000-00000000000b');
insert into public.notification_log (kind, member_id, step, sent_on, title, body, devices) values
  ('debtor',   pg_temp.id('a'), 1, '2026-11-01', 'Perrita deudora!', 'x', 1),
  ('debtor',   pg_temp.id('a'), 2, '2026-11-03', 'Rata inmunda', 'x', 2),
  ('debtor',   pg_temp.id('b'), 1, '2026-11-01', 'Perrita deudora!', 'x', 0),  -- no llegó a ningún dispositivo
  ('creditor', pg_temp.id('b'), 1, '2026-11-01', 'Te deben', 'x', 1),
  ('weekly',   pg_temp.id('a'), 1, '2026-11-02', 'Lunes', 'x', 1);

select pg_temp.as_user(pg_temp.id('b'));
select pg_temp.check((select count(*) from public.notification_log where member_id = pg_temp.id('a')) = 0, 'una integrante no ve las notificaciones de otra');
select pg_temp.check((select count(*) from public.debt_reminders_sent() where member_id = pg_temp.id('a')) = 2,
  'pero sí cuántos avisos de deuda recibió cada una');
select pg_temp.check((select count(*) from public.debt_reminders_sent()) = 2, 'solo avisos de deuda que llegaron (sin cobros, frases ni fallidos)');

select pg_temp.as_user(null);
update public.profiles set status = 'inactive' where id = pg_temp.id('b');
select pg_temp.as_user(pg_temp.id('b'));
select pg_temp.check((select count(*) from public.debt_reminders_sent()) = 0, 'una integrante desactivada no ve nada');
