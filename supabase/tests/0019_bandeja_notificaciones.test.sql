-- Pruebas de la migración 0019 (bandeja de notificaciones).
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
 ('00000000-0000-0000-0000-00000000000b','b@x.com','{"first_name":"Bea","last_name":"B","username":"bea"}');
update public.profiles set status = 'active';

-- El servidor (sin rol) guarda las notificaciones.
insert into public.member_notifications (member_id, title, body, url, created_at) values
 ('00000000-0000-0000-0000-00000000000a', 'Hola Ana', 'x', '/', now()),
 ('00000000-0000-0000-0000-00000000000a', 'Vieja', 'x', '/', now() - interval '100 days'),
 ('00000000-0000-0000-0000-00000000000b', 'Hola Bea', 'x', '/gastos', now());

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.member_notifications) = 2, 'cada una ve solo las suyas');
select pg_temp.expect_error($q$ insert into public.member_notifications (member_id, title, body) values ('00000000-0000-0000-0000-00000000000a', 't', 'b') $q$, 'una integrante no puede crear notificaciones');
select pg_temp.expect_error($q$ update public.member_notifications set read_at = now() where true $q$, 'ni editarlas directamente');
select public.mark_notifications_read();
select pg_temp.check((select count(*) from public.member_notifications where read_at is null) = 0, 'marcar como leídas');
select pg_temp.check(not exists (select 1 from public.member_notifications where title = 'Vieja'), 'se limpian las de más de 90 días');
select pg_temp.as_user(null);
select pg_temp.check((select read_at is null from public.member_notifications where title = 'Hola Bea'), 'no toca las de las demás');
select pg_temp.expect_error($q$ insert into public.member_notifications (member_id, title, body, url) values ('00000000-0000-0000-0000-00000000000a', 't', 'b', 'https://x') $q$, 'el link es siempre interno');
