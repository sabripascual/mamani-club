-- Pruebas de la migración 0001 (casos 1–5, 8, 38, 39 del prompt maestro).
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
begin if not cond then raise exception 'FALLA  %', label; end if; raise notice 'OK  %', label; end $$;

-- Registro de tres usuarias (simula supabase.auth.signUp).
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','a@x.com','{"first_name":"Ana","last_name":"A","username":"Ana_1","role":"admin","status":"active"}'),
 ('00000000-0000-0000-0000-00000000000b','b@x.com','{"first_name":"Bea","last_name":"B","username":"bea"}'),
 ('00000000-0000-0000-0000-00000000000c','c@x.com','{"first_name":"Caro","last_name":"C","username":"caro"}');

select pg_temp.check((select bool_and(status='pending' and role='member') from public.profiles),
  '1. al registrarse quedan pending/member aunque manden otro rol');
select pg_temp.check((select username from public.profiles where first_name='Ana')='ana_1', 'username se guarda en minúsculas');
select pg_temp.expect_error($$insert into auth.users (email, raw_user_meta_data) values ('d@x.com','{"first_name":"D","last_name":"D","username":"bea"}')$$,
  'username duplicado');

-- Bootstrap de la primera admin (lo que corre la dueña en el SQL Editor).
update public.profiles set role='admin', status='active' where username='ana_1';

-- Pendiente: solo se ve a sí misma, no ve configuración ni auditoría.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.profiles)=1, '2. pendiente solo ve su propio perfil');
select pg_temp.check((select count(*) from public.group_settings)=0, '2. pendiente no ve configuración del grupo');
select pg_temp.check((select count(*) from public.audit_log)=0, '2. pendiente no ve auditoría');
select pg_temp.expect_error($$update public.profiles set status='active' where id=auth.uid()$$, 'pendiente no puede autoaprobarse');
select pg_temp.expect_error($$select public.admin_set_member_status('00000000-0000-0000-0000-00000000000b','active')$$, 'pendiente no puede usar acciones de admin');
update public.profiles set nickname='Bebi' where id=auth.uid();
select pg_temp.check((select nickname from public.profiles where id=auth.uid())='Bebi', 'puede editar su apodo');

-- Admin aprueba a Bea y Caro.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.profiles)=3, 'admin ve solicitudes pendientes');
select public.admin_set_member_status('00000000-0000-0000-0000-00000000000b','active','Amiga del club');
select public.admin_set_member_status('00000000-0000-0000-0000-00000000000c','active');
select pg_temp.check((select status='active' and joined_at is not null from public.profiles where username='bea'), '3. admin aprueba y se fija fecha de ingreso');

-- Integrante común.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.profiles)=3, 'integrante activa ve al grupo');
select pg_temp.check((select count(*) from public.group_settings)=1, 'integrante activa ve configuración');
select pg_temp.expect_error($$select public.admin_set_member_role('00000000-0000-0000-0000-00000000000c','admin')$$, '5. integrante no puede cambiar roles (función)');
select pg_temp.expect_error($$update public.profiles set role='admin' where id=auth.uid()$$, '5. integrante no puede cambiar su propio rol');
update public.profiles set nickname='hackeo' where username='caro';
select pg_temp.check((select nickname from public.profiles where username='caro') is null, 'integrante no edita perfiles ajenos');
select pg_temp.expect_error($$delete from public.audit_log$$, '39. auditoría no se puede borrar');
select pg_temp.expect_error($$update public.audit_log set reason='x'$$, '39. auditoría no se puede alterar');

-- Admin designa otra admin, desactiva a una integrante, y no puede quedar sin admins.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_set_member_role('00000000-0000-0000-0000-00000000000b','admin','Co-organizadora');
select pg_temp.check((select role='admin' from public.profiles where username='bea'), '4. admin designa otra admin');
select public.admin_set_member_status('00000000-0000-0000-0000-00000000000c','inactive','Se mudó');
select pg_temp.check((select count(*) from public.profiles where username='caro')=1, '8. desactivada conserva su perfil');
select public.admin_set_member_role('00000000-0000-0000-0000-00000000000b','member');
select pg_temp.expect_error($$select public.admin_set_member_role('00000000-0000-0000-0000-00000000000a','member')$$, 'no puede quedar el grupo sin admins');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.profiles where username='caro')=1, '8. integrante activa sigue viendo a la desactivada');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.audit_log where action='member_approved')=3, '38. aprobaciones auditadas (incluye la primera admin)');
select pg_temp.check((select reason from public.audit_log where action='member_deactivated')='Se mudó', '38. baja auditada con motivo');
select pg_temp.check((select count(*) from public.audit_log where action='role_changed')=2, '38. cambios de rol auditados');

-- Login con username: solo el servidor.
select pg_temp.expect_error($$select public.email_for_login('bea')$$, 'navegador no puede traducir username→email');
reset role; set role service_role;
select pg_temp.check(public.email_for_login('BEA ')='b@x.com', 'servidor traduce username→email');
reset role; set role anon;
select pg_temp.check(public.username_available('nueva') and not public.username_available('caro'), 'chequeo de username disponible');
select pg_temp.expect_error($$select * from public.profiles$$, 'visitante sin sesión no lee perfiles');

-- Avatares.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into storage.objects (bucket_id, name) values ('avatars','00000000-0000-0000-0000-00000000000b/a.webp');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('avatars','00000000-0000-0000-0000-00000000000c/a.webp')$$, 'no sube avatar en carpeta ajena');
