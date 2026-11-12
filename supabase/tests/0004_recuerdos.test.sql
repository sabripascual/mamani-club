-- Pruebas de la migración 0004 (casos 23–25, 27–31 del prompt maestro).
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
 ('00000000-0000-0000-0000-00000000000c','c@x.com','{"first_name":"Caro","last_name":"C","username":"caro"}'),
 ('00000000-0000-0000-0000-00000000000e','e@x.com','{"first_name":"Eli","last_name":"E","username":"eli"}');
update public.profiles set status = 'active' where username in ('ana','bea','caro');
update public.profiles set role = 'admin' where username = 'ana';
grant select, insert, delete on storage.objects to authenticated;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where k = $1 $$;
insert into ids values ('a','00000000-0000-0000-0000-00000000000a'), ('b','00000000-0000-0000-0000-00000000000b'),
                       ('c','00000000-0000-0000-0000-00000000000c'), ('e','00000000-0000-0000-0000-00000000000e');

select pg_temp.as_user(pg_temp.id('b'));
insert into ids select 'asado', public.create_expense('Asado', '2026-05-01',
  (select id from public.categories where code = 'comida'), 900000, pg_temp.id('b'), array[pg_temp.id('a'), pg_temp.id('b')]);
insert into ids select 'otra', public.create_expense('Otra', '2026-05-02',
  (select id from public.categories where code = 'comida'), 900000, pg_temp.id('b'), array[pg_temp.id('b')]);

-- Subida de archivos a Storage (simulada) + registro.
create function pg_temp.upload(exp text, who text, n text) returns void language sql as $$
  insert into storage.objects (bucket_id, name) values
    ('photos', pg_temp.id(exp) || '/' || pg_temp.id(who) || '/' || n || '.webp'),
    ('photos', pg_temp.id(exp) || '/' || pg_temp.id(who) || '/' || n || '-thumb.webp');
$$;
create function pg_temp.add(exp text, who text, n text) returns uuid language sql as $$
  select public.add_photo(pg_temp.id(exp), pg_temp.id(exp) || '/' || pg_temp.id(who) || '/' || n || '.webp',
    pg_temp.id(exp) || '/' || pg_temp.id(who) || '/' || n || '-thumb.webp', 1600, 1200, 300000, 30000, 'image/webp');
$$;

select pg_temp.upload('asado', 'b', 'f1');
insert into ids select 'f1', pg_temp.add('asado', 'b', 'f1');
select pg_temp.upload('asado', 'b', 'f2');
insert into ids select 'f2', pg_temp.add('asado', 'b', 'f2');
select pg_temp.check((select count(*) from public.photos where expense_id = pg_temp.id('asado')) = 2,
  '23/25. una integrante sube varias fotos y quedan vinculadas a su juntada');

select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('photos', '00000000-0000-0000-0000-000000000000/x/y.webp')$$,
  'no se puede subir a la carpeta de otra persona o de una juntada inexistente');
select pg_temp.expect_error(format($$select public.add_photo(%L, %L, %L, 1, 1, 1, 1, 'image/webp')$$, pg_temp.id('asado'),
  pg_temp.id('asado') || '/' || pg_temp.id('b') || '/nada.webp', pg_temp.id('asado') || '/' || pg_temp.id('b') || '/nada-thumb.webp'),
  'registrar una foto cuyo archivo no existe es rechazado');
select pg_temp.expect_error(format($$select public.add_photo(%L, %L, %L, 1, 1, 1, 1, 'image/webp')$$, pg_temp.id('otra'),
  pg_temp.id('asado') || '/' || pg_temp.id('b') || '/f1.webp', pg_temp.id('asado') || '/' || pg_temp.id('b') || '/f1-thumb.webp'),
  '25. una foto no puede registrarse en una juntada distinta a su carpeta');
select pg_temp.expect_error($$insert into public.photos (expense_id, uploaded_by, storage_path, thumb_path, width, height, size_bytes, thumb_size_bytes, mime_type)
  values (gen_random_uuid(), auth.uid(), 'x', 'y', 1, 1, 1, 1, 'image/webp')$$, 'no se insertan fotos directo en la tabla');

-- Likes.
select pg_temp.as_user(pg_temp.id('c'));
select pg_temp.check(public.toggle_like(pg_temp.id('f1')) = true, '27. dar like');
select pg_temp.expect_error(format($$insert into public.photo_likes values (%L, %L)$$, pg_temp.id('f1'), pg_temp.id('c')),
  '28. no se puede duplicar un like');
select pg_temp.check((select likes from public.v_photo_stats where photo_id = pg_temp.id('f1')) = 1, '28. el contador muestra 1 like');
select pg_temp.check(public.toggle_like(pg_temp.id('f1')) = false, '27. quitar like');
select public.toggle_like(pg_temp.id('f1'));
select pg_temp.as_user(pg_temp.id('a'));
select public.toggle_like(pg_temp.id('f1'));
select pg_temp.check((select likes from public.v_photo_stats where photo_id = pg_temp.id('f1')) = 2, 'likes de varias personas se suman');

-- Comentarios.
select pg_temp.as_user(pg_temp.id('c'));
insert into public.photo_comments (photo_id, author_id, body) values (pg_temp.id('f1'), auth.uid(), '¡Qué noche!');
insert into ids select 'com_c', id from public.photo_comments where body = '¡Qué noche!';
select pg_temp.check((select count(*) from public.photo_comments where photo_id = pg_temp.id('f1')) = 1, '29. el comentario se guarda y se ve');
select pg_temp.expect_error(format($$insert into public.photo_comments (photo_id, author_id, body) values (%L, %L, 'falso')$$,
  pg_temp.id('f1'), pg_temp.id('b')), 'no se puede comentar en nombre de otra');
select pg_temp.expect_error(format($$insert into public.photo_comments (photo_id, author_id, body) values (%L, auth.uid(), '   ')$$,
  pg_temp.id('f1')), 'comentario vacío rechazado');
select pg_temp.as_user(pg_temp.id('b'));
insert into public.photo_comments (photo_id, author_id, body) values (pg_temp.id('f1'), auth.uid(), 'comentario feo');
insert into ids select 'com_b', id from public.photo_comments where body = 'comentario feo';
select pg_temp.expect_error(format($$select public.delete_comment(%L)$$, pg_temp.id('com_c')), 'no se borran comentarios ajenos');
select public.delete_comment(pg_temp.id('com_b'));
select pg_temp.check((select count(*) from public.photo_comments where photo_id = pg_temp.id('f1')) = 1, '30. la autora borra su comentario');

-- Fotos: borrar propias, no ajenas; admin modera.
select pg_temp.as_user(pg_temp.id('c'));
select pg_temp.expect_error(format($$select public.delete_photo(%L)$$, pg_temp.id('f2')), 'no se borran fotos ajenas');
select pg_temp.as_user(pg_temp.id('b'));
-- RLS no da error en un DELETE bloqueado: simplemente no borra filas.
delete from storage.objects where name = pg_temp.id('asado') || '/' || pg_temp.id('b') || '/f2.webp';
select pg_temp.check((select count(*) from storage.objects where name like '%/f2.webp') = 1,
  'no se borra el archivo de una foto visible (primero hay que borrar la foto)');
select * from public.delete_photo(pg_temp.id('f2'));
delete from storage.objects where name like pg_temp.id('asado') || '/' || pg_temp.id('b') || '/f2%';
select pg_temp.check((select count(*) from storage.objects where name like '%/f2%') = 0, '30. la autora borra su foto y sus archivos');
select pg_temp.as_user(pg_temp.id('a'));
select public.delete_comment(pg_temp.id('com_c'), 'Fuera de lugar');
select * from public.delete_photo(pg_temp.id('f1'), 'Foto privada');
select pg_temp.check((select count(*) from public.photos) = 0, '31. una admin modera fotos y comentarios ajenos');
select pg_temp.check((select count(*) from public.audit_log where action in ('photo_moderated', 'comment_moderated') and reason is not null) = 2
  and (select count(*) from public.audit_log where action in ('photo_deleted', 'comment_deleted')) = 2,
  '38. borrados y moderaciones quedan auditados con motivo');
select pg_temp.expect_error(format($$select public.toggle_like(%L)$$, pg_temp.id('f1')), 'no se da like a una foto borrada');

-- Pendiente no ve nada.
select pg_temp.as_user(pg_temp.id('b'));
select pg_temp.upload('asado', 'b', 'f3');
insert into ids select 'f3', pg_temp.add('asado', 'b', 'f3');
select pg_temp.as_user(pg_temp.id('e'));
select pg_temp.check((select count(*) from public.photos) = 0 and (select count(*) from public.photo_likes) = 0
  and (select count(*) from storage.objects where bucket_id = 'photos') = 0,
  '24. una integrante no aprobada no ve fotos, likes ni archivos');
select pg_temp.expect_error(format($$select public.toggle_like(%L)$$, pg_temp.id('f3')), '24. ni puede dar like');
