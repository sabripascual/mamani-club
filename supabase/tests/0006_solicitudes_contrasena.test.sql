-- Pruebas de la migración 0006.
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
update public.profiles set status = 'active' where username in ('ana','bea');
update public.profiles set role = 'admin' where username = 'ana';

-- El servidor (service_role) crea la solicitud; una segunda pendiente no se duplica.
set role service_role;
insert into public.password_reset_requests (member_id) values ('00000000-0000-0000-0000-00000000000b');
insert into public.password_reset_requests (member_id) values ('00000000-0000-0000-0000-00000000000b') on conflict do nothing;
reset role;
select pg_temp.check((select count(*) from public.password_reset_requests) = 1, 'una sola solicitud pendiente por integrante');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.password_reset_requests) = 0, 'una integrante no ve las solicitudes');
select pg_temp.expect_error($$insert into public.password_reset_requests (member_id) values (auth.uid())$$, 'no se crean solicitudes desde la app');
select pg_temp.expect_error($$select public.admin_resolve_password_request((select id from public.password_reset_requests limit 1), 'approved')$$,
  'una integrante no puede aprobar');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check(public.admin_resolve_password_request((select id from public.password_reset_requests limit 1), 'approved')
  = '00000000-0000-0000-0000-00000000000b', 'una admin aprueba y obtiene a quién resetear');
select pg_temp.expect_error($$select public.admin_resolve_password_request((select id from public.password_reset_requests limit 1), 'rejected')$$,
  'no se resuelve dos veces');
select pg_temp.check((select count(*) from public.audit_log where action = 'password_request_approved') = 1, 'la aprobación queda auditada');
reset role; set role service_role;
insert into public.password_reset_requests (member_id) values ('00000000-0000-0000-0000-00000000000b');
reset role;
select pg_temp.check((select count(*) from public.password_reset_requests where status = 'pending') = 1, 'después de resolver puede pedir otra');

-- Búsqueda por email o username: solo el servidor.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.member_id_for_login('bea')$$, 'el navegador no puede buscar integrantes por email');
reset role; set role service_role;
select pg_temp.check(public.member_id_for_login('B@X.com ') = '00000000-0000-0000-0000-00000000000b'
  and public.member_id_for_login('bea') = '00000000-0000-0000-0000-00000000000b'
  and public.member_id_for_login('nadie') is null, 'el servidor encuentra por email o username');
