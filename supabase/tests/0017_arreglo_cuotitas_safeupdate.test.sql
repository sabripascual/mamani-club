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

-- Supabase (pg-safeupdate) rechaza DELETE sin WHERE: ninguna función de cuotitas lo usa.
select pg_temp.check(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'cuotita%' and p.prosrc ~* 'delete\s+from\s+[a-z_."]+\s*;'
), 'las funciones de cuotitas no tienen DELETE sin WHERE');

-- Cargar dos cuotitas seguidas (la tabla temporal se vacía con "where true").
select pg_temp.as_user(pg_temp.id('a'));
insert into ids select 'p1', public.create_cuotita('Préstamo 1', 'prestamo', 100000, 2, '2026-12-01', pg_temp.id('a'), array[pg_temp.id('b')]);
insert into ids select 'p2', public.create_cuotita('Préstamo 2', 'prestamo', 300000, 3, '2026-12-01', pg_temp.id('a'), array[pg_temp.id('a'), pg_temp.id('b')]);
select pg_temp.check((select count(*) from public.cuotita_installments where cuotita_id = pg_temp.id('p1')) = 2
  and (select count(*) from public.cuotita_installments where cuotita_id = pg_temp.id('p2')) = 3, 'se cargan cuotitas seguidas');
