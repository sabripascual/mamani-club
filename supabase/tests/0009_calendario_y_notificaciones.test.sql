-- Pruebas de la migración 0009.
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
 ('00000000-0000-0000-0000-00000000000a','a@x.com','{"first_name":"Ana","last_name":"A","username":"ana"}'),
 ('00000000-0000-0000-0000-00000000000b','b@x.com','{"first_name":"Bea","last_name":"B","username":"bea"}'),
 ('00000000-0000-0000-0000-00000000000c','c@x.com','{"first_name":"Caro","last_name":"C","username":"caro"}'),
 ('00000000-0000-0000-0000-00000000000e','e@x.com','{"first_name":"Eli","last_name":"E","username":"eli"}');
update public.profiles set status = 'active' where username in ('ana','bea','caro');
update public.profiles set role = 'admin' where username = 'ana';
insert into ids values ('a','00000000-0000-0000-0000-00000000000a'), ('b','00000000-0000-0000-0000-00000000000b'),
  ('c','00000000-0000-0000-0000-00000000000c'), ('e','00000000-0000-0000-0000-00000000000e');
insert into ids select 'casa', id from public.categories where code = 'j_casa';
insert into ids select 'comida', id from public.categories where code = 'comida';
insert into ids select 'asados', id from public.categories where name = 'Asados';

-- Eventos
select pg_temp.as_user(pg_temp.id('b'));
insert into ids select 'ev', public.create_event('Asado del sábado', '2026-11-21 21:00-03', pg_temp.id('casa'), 'Av. Siempreviva 742');
select pg_temp.check((select response from public.event_rsvps where event_id = pg_temp.id('ev') and member_id = auth.uid()) = 'going',
  'quien crea el evento queda como "Voy"');
select pg_temp.as_user(pg_temp.id('c'));
select public.rsvp_event(pg_temp.id('ev'), 'maybe');
select public.rsvp_event(pg_temp.id('ev'), 'going');
select pg_temp.check((select count(*) from public.event_rsvps where event_id = pg_temp.id('ev') and response = 'going') = 2, 'cualquiera se suma y puede cambiar su respuesta');
select pg_temp.expect_error(format($$select public.update_event(%L, 'X', now(), %L)$$, pg_temp.id('ev'), pg_temp.id('casa')), 'solo la creadora edita el evento');
select pg_temp.expect_error(format($$select public.cancel_event(%L)$$, pg_temp.id('ev')), 'solo la creadora elimina el evento');
select pg_temp.expect_error(format($$select public.convert_event_to_juntada(%L)$$, pg_temp.id('ev')), 'solo la creadora convierte el evento');
select pg_temp.expect_error(format($$insert into public.events (title, starts_at, type_id, created_by) values ('X', now(), %L, auth.uid())$$, pg_temp.id('casa')),
  'no se crean eventos directo en la tabla');

-- Convertir en juntada
select pg_temp.as_user(pg_temp.id('b'));
insert into ids select 'j', public.convert_event_to_juntada(pg_temp.id('ev'));
select pg_temp.check((select occurred_on = '2026-11-21' and location = 'Av. Siempreviva 742' from public.juntadas where id = pg_temp.id('j')),
  'la juntada toma fecha (hora argentina) y ubicación del evento');
select pg_temp.check((select count(*) from public.juntada_attendees where juntada_id = pg_temp.id('j')) = 2, 'las confirmadas pasan a ser asistentes');
select pg_temp.check(public.convert_event_to_juntada(pg_temp.id('ev')) = pg_temp.id('j'), '1 evento = 1 juntada (convertir dos veces devuelve la misma)');
select pg_temp.as_user(pg_temp.id('a'));
select public.rsvp_event(pg_temp.id('ev'), 'going');
select pg_temp.check(exists (select 1 from public.juntada_attendees where juntada_id = pg_temp.id('j') and member_id = pg_temp.id('a')),
  'confirmar después de convertir suma a la juntada');

-- Eliminar: no si tiene gastos
select pg_temp.as_user(pg_temp.id('b'));
select public.create_expense(pg_temp.id('j'), 'Asados', pg_temp.id('comida'), 300000, pg_temp.id('b'), array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c')],
  p_subcategory_id => pg_temp.id('asados'));
select pg_temp.expect_error(format($$select public.cancel_event(%L)$$, pg_temp.id('ev')), 'no se elimina un evento con gastos');
insert into ids select 'ev2', public.create_event('Previa', '2026-11-28 22:00-03', pg_temp.id('casa'));
select public.cancel_event(pg_temp.id('ev2'));
select pg_temp.check((select status from public.events where id = pg_temp.id('ev2')) = 'cancelled', 'un evento sin gastos se puede eliminar (queda cancelado)');

-- Ubicación en juntadas
insert into ids select 'bar', public.create_juntada('Bar', '2026-11-10', pg_temp.id('casa'), '{}', null, 'Palermo');
select pg_temp.check((select location from public.juntadas where id = pg_temp.id('bar')) = 'Palermo', 'las juntadas guardan ubicación');

-- Categorías: borrar solo si no se usaron
select pg_temp.as_user(pg_temp.id('a'));
insert into public.categories (kind, parent_id, name) values ('gasto', pg_temp.id('comida'), 'Sin usar');
insert into ids select 'sinusar', id from public.categories where name = 'Sin usar';
select public.admin_delete_category(pg_temp.id('sinusar'));
select pg_temp.check(not exists (select 1 from public.categories where name = 'Sin usar'), 'una subcategoría sin uso se puede borrar');
select pg_temp.expect_error(format($$select public.admin_delete_category(%L)$$, pg_temp.id('asados')), 'una subcategoría usada no se borra (se archiva)');
select pg_temp.expect_error(format($$select public.admin_delete_category(%L)$$, pg_temp.id('casa')), 'un tipo usado por rankings o juntadas no se borra');
select pg_temp.as_user(pg_temp.id('b'));
select pg_temp.expect_error(format($$select public.admin_delete_category(%L)$$, pg_temp.id('comida')), 'una integrante no borra categorías');

-- Mensajes de notificación
select pg_temp.check((select count(*) from public.notification_messages) = 0, 'una integrante no ve los mensajes del panel');
select pg_temp.expect_error($$insert into public.notification_messages (kind, title, body) values ('weekly', 'x', 'y')$$, 'una integrante no crea mensajes');
select pg_temp.as_user(pg_temp.id('a'));
insert into public.notification_messages (kind, title, body) values ('weekly', 'Lunes de club', '¿Qué hacemos este finde?');
select pg_temp.check((select count(*) from public.notification_messages) = 3, 'una admin ve y crea mensajes (incluye los 2 iniciales de cumple)');

-- Privacidad
select pg_temp.as_user(pg_temp.id('e'));
select pg_temp.check((select count(*) from public.events) = 0 and (select count(*) from public.holidays) = 0, 'una pendiente no ve eventos ni feriados');
select pg_temp.expect_error(format($$select public.rsvp_event(%L, 'going')$$, pg_temp.id('ev')), 'una pendiente no responde eventos');
