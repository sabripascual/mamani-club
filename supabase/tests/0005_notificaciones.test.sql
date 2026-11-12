-- Pruebas de la migración 0005.
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

insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','a@x.com','{"first_name":"Ana","last_name":"A","username":"ana"}'),
 ('00000000-0000-0000-0000-00000000000b','b@x.com','{"first_name":"Bea","last_name":"B","username":"bea"}'),
 ('00000000-0000-0000-0000-00000000000e','e@x.com','{"first_name":"Eli","last_name":"E","username":"eli"}');
update public.profiles set status = 'active' where username in ('ana','bea');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.push_subscriptions (member_id, endpoint, p256dh, auth) values (auth.uid(), 'https://push.example/a1', 'k', 's');
select pg_temp.check((select count(*) from public.push_subscriptions) = 1, 'una integrante activa su dispositivo y lo ve');
select pg_temp.expect_error($$insert into public.push_subscriptions (member_id, endpoint, p256dh, auth)
  values ('00000000-0000-0000-0000-00000000000b', 'https://push.example/b1', 'k', 's')$$, 'no puede registrar dispositivos de otra');
select pg_temp.expect_error($$insert into public.notification_log (kind, member_id, step, sent_on, title, body)
  values ('debtor', auth.uid(), 1, current_date, 't', 'b')$$, 'no puede escribir el registro de envíos');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.push_subscriptions) = 0, 'no ve dispositivos ajenos');
delete from public.push_subscriptions;
select pg_temp.as_user(null);
select pg_temp.check((select count(*) from public.push_subscriptions) = 1, 'no puede borrar dispositivos ajenos');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect_error($$insert into public.push_subscriptions (member_id, endpoint, p256dh, auth) values (auth.uid(), 'https://push.example/e1', 'k', 's')$$,
  'una pendiente no puede activar notificaciones');

-- El cron (service_role) registra envíos; no puede duplicar el mismo día.
reset role; set role service_role;
insert into public.notification_log (kind, member_id, step, sent_on, title, body) values ('creditor', '00000000-0000-0000-0000-00000000000a', 1, '2026-11-12', 't', 'b');
select pg_temp.expect_error($$insert into public.notification_log (kind, member_id, step, sent_on, title, body)
  values ('creditor', '00000000-0000-0000-0000-00000000000a', 1, '2026-11-12', 't', 'b')$$, 'no se registra dos veces el mismo envío el mismo día');
