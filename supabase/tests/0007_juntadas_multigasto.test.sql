-- Pruebas de la migración 0007: migración de datos + juntadas con varios gastos.
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
insert into ids values ('a','00000000-0000-0000-0000-00000000000a'), ('b','00000000-0000-0000-0000-00000000000b'),
  ('c','00000000-0000-0000-0000-00000000000c'), ('d','00000000-0000-0000-0000-00000000000d'), ('e','00000000-0000-0000-0000-00000000000e');
insert into ids select 'asado_v', id from public.expenses where title = 'Asado viejo';
insert into ids select 'tt_v', id from public.expenses where title = 'Tercer tiempo viejo';
create function pg_temp.net(j uuid, m text) returns bigint language sql as
  $$ select coalesce((select net_cents from public.v_juntada_member_balances where juntada_id = j and member_id = pg_temp.id(m)), 0) $$;

-- ===================== MIGRACIÓN DE DATOS =====================
select pg_temp.check((select count(*) from public.juntadas) = 2 and exists (select 1 from public.juntadas where id = pg_temp.id('asado_v')),
  'cada gasto viejo es una juntada con el mismo id');
select pg_temp.check((select juntada_id from public.expenses where id = pg_temp.id('asado_v')) = pg_temp.id('asado_v'), 'el gasto queda dentro de su juntada');
select pg_temp.check((select count(*) from public.juntada_attendees where juntada_id = pg_temp.id('asado_v')) = 4, 'las participantes pasan a ser asistentes');
select pg_temp.check((select code from public.categories c join public.juntadas j on j.type_id = c.id where j.id = pg_temp.id('tt_v')) = 'j_tercer_tiempo',
  'la subcategoría Tercer tiempo se convierte en tipo de juntada Tercer tiempo');
select pg_temp.check((select code from public.categories c join public.juntadas j on j.type_id = c.id where j.id = pg_temp.id('asado_v')) = 'j_casa',
  'Comida → Juntada en casa');
-- Asado viejo: $80.000 / 4 = $20.000. Caro pagó $25.000 (le reintegran 5.000). Ana y Dani deben 20.000.
select pg_temp.check(pg_temp.net(pg_temp.id('asado_v'), 'a') = -2000000 and pg_temp.net(pg_temp.id('asado_v'), 'd') = -2000000
  and pg_temp.net(pg_temp.id('asado_v'), 'c') = 500000 and pg_temp.net(pg_temp.id('asado_v'), 'b') = 3500000,
  'los saldos migrados coinciden (incluye pago deshecho y reintegro pendiente)');
select pg_temp.check((select count(*) from public.settlements where juntada_id = pg_temp.id('asado_v')) = 2
  and (select count(*) from public.settlements where juntada_id = pg_temp.id('asado_v') and status = 'void') = 1,
  'los pagos viejos pasan a ser transferencias (con su estado)');
select pg_temp.check((select juntada_id from public.photos limit 1) = pg_temp.id('asado_v'), 'las fotos quedan en su juntada');

-- ===================== JUNTADA CON VARIOS GASTOS (ejemplo del diseño) =====================
select pg_temp.as_user(pg_temp.id('a'));
insert into ids select 'casa', id from public.categories where code = 'j_casa';
insert into ids select 'comida', id from public.categories where code = 'comida' and kind = 'gasto';
insert into ids select 'bebidas', id from public.categories where code = 'bebidas';
insert into ids select 'j', public.create_juntada('Asado en lo de Caro', '2026-11-07', pg_temp.id('casa'),
  array[pg_temp.id('b'), pg_temp.id('c')]);
select pg_temp.check((select count(*) from public.juntada_attendees where juntada_id = pg_temp.id('j')) = 3, 'la creadora queda como asistente');
select pg_temp.check((select settlement_status from public.v_juntada_status where juntada_id = pg_temp.id('j')) = 'empty', 'juntada sin gastos');

insert into ids select 'carne', public.create_expense(pg_temp.id('j'), 'Carne', pg_temp.id('comida'), 6000000, pg_temp.id('a'),
  array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c'), pg_temp.id('d')]);
select pg_temp.check(exists (select 1 from public.juntada_attendees where juntada_id = pg_temp.id('j') and member_id = pg_temp.id('d')),
  'quien participa de un gasto pasa a ser asistente');
select pg_temp.as_user(pg_temp.id('b'));
insert into ids select 'bebidas_g', public.create_expense(pg_temp.id('j'), 'Bebidas', pg_temp.id('bebidas'), 3000000, pg_temp.id('b'),
  array[pg_temp.id('b'), pg_temp.id('c'), pg_temp.id('d')]);
select pg_temp.as_user(pg_temp.id('c'));
insert into ids select 'hielo', public.create_expense(pg_temp.id('j'), 'Hielo', pg_temp.id('bebidas'), 400000, pg_temp.id('c'),
  array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c'), pg_temp.id('d')]);
select pg_temp.check(pg_temp.net(pg_temp.id('j'), 'a') = 4400000 and pg_temp.net(pg_temp.id('j'), 'b') = 400000
  and pg_temp.net(pg_temp.id('j'), 'c') = -2200000 and pg_temp.net(pg_temp.id('j'), 'd') = -2600000,
  'saldos netos: Ana +44.000, Bea +4.000, Caro −22.000, Dani −26.000');
select pg_temp.check((select array_agg(format('%s>%s:%s', f.username, t.username, x.amount_cents) order by x.amount_cents desc)
  from public.juntada_transfers(pg_temp.id('j')) x join public.profiles f on f.id = x.from_member join public.profiles t on t.id = x.to_member)
  = array['dani>ana:2600000', 'caro>ana:1800000', 'caro>bea:400000'],
  'transferencias sugeridas mínimas: Dani→Ana 26.000, Caro→Ana 18.000, Caro→Bea 4.000');
select pg_temp.check((select pending_cents = 4800000 and settlement_status = 'pending' and expenses_count = 3 and total_cents = 9400000
  from public.v_juntada_status where juntada_id = pg_temp.id('j')), 'estado de la juntada: pendiente, $94.000, falta $48.000');

-- Permisos de gastos
select pg_temp.expect_error(format($$select public.update_expense(%L, 'X', %L, 1, %L, array[%L]::uuid[])$$,
  pg_temp.id('carne'), pg_temp.id('comida'), pg_temp.id('a'), pg_temp.id('a')), 'solo quien cargó el gasto lo edita');
select pg_temp.expect_error(format($$select public.create_expense(%L, 'X', %L, 100, %L, array[%L]::uuid[])$$,
  pg_temp.id('j'), pg_temp.id('casa'), pg_temp.id('c'), pg_temp.id('c')), 'un tipo de juntada no sirve como categoría de gasto');
select pg_temp.expect_error(format($$select public.create_juntada('X', '2026-11-07', %L)$$, pg_temp.id('comida')),
  'una categoría de gasto no sirve como tipo de juntada');

-- Pagar (transferencias)
select pg_temp.expect_error(format($$select public.settle_transfer(%L, %L, %L, 2600000)$$, pg_temp.id('j'), pg_temp.id('d'), pg_temp.id('a')),
  'una tercera no puede marcar una transferencia ajena');
select pg_temp.as_user(pg_temp.id('d'));
select pg_temp.expect_error(format($$select public.settle_transfer(%L, %L, %L, 1000)$$, pg_temp.id('j'), pg_temp.id('d'), pg_temp.id('a')),
  'el monto tiene que coincidir con la sugerencia (sin pagos parciales ni sobrepagos)');
insert into ids select 'st_d', public.settle_transfer(pg_temp.id('j'), pg_temp.id('d'), pg_temp.id('a'), 2600000, 'ana.mp');
select pg_temp.expect_error(format($$select public.settle_transfer(%L, %L, %L, 2600000)$$, pg_temp.id('j'), pg_temp.id('d'), pg_temp.id('a')),
  'no se puede registrar dos veces la misma transferencia');
select pg_temp.check(pg_temp.net(pg_temp.id('j'), 'd') = 0 and (select settlement_status from public.v_juntada_status where juntada_id = pg_temp.id('j')) = 'partial',
  'Dani queda al día y la juntada pasa a parcialmente saldada');
select pg_temp.check((select alias from public.settlements where id = pg_temp.id('st_d')) = 'ana.mp', 'la transferencia guarda el alias');
select pg_temp.as_user(pg_temp.id('a'));   -- quien recibe también puede marcar
select public.settle_transfer(pg_temp.id('j'), pg_temp.id('c'), pg_temp.id('a'), 1800000);
select pg_temp.as_user(pg_temp.id('c'));
select public.settle_transfer(pg_temp.id('j'), pg_temp.id('c'), pg_temp.id('b'), 400000);
select pg_temp.check((select settlement_status from public.v_juntada_status where juntada_id = pg_temp.id('j')) = 'settled', 'todo transferido → Saldado');
select pg_temp.as_user(pg_temp.id('a'));   -- la creadora (y admin) tampoco puede
select pg_temp.expect_error(format($$select public.void_juntada(%L, 'x')$$, pg_temp.id('j')), 'no se anula una juntada con transferencias');

-- Editar un gasto después de saldar → nuevas sugerencias (reintegro)
select pg_temp.as_user(pg_temp.id('b'));
select public.update_expense(pg_temp.id('bebidas_g'), 'Bebidas', pg_temp.id('bebidas'), 2400000, pg_temp.id('b'),
  array[pg_temp.id('b'), pg_temp.id('c'), pg_temp.id('d')], p_reason => 'Devolvieron envases');
select pg_temp.check((select array_agg(format('%s>%s:%s', f.username, t.username, x.amount_cents) order by t.username)
  from public.juntada_transfers(pg_temp.id('j')) x join public.profiles f on f.id = x.from_member join public.profiles t on t.id = x.to_member)
  = array['bea>caro:200000', 'bea>dani:200000'],
  'al bajar un gasto ya saldado, la app sugiere los reintegros: Bea → Caro $2.000 y Bea → Dani $2.000');
select pg_temp.check((select sum(amount_cents) from public.juntada_transfers(pg_temp.id('j'))) = 400000
  and (select settlement_status from public.v_juntada_status where juntada_id = pg_temp.id('j')) = 'partial',
  'reintegros por $4.000 (Bea cobró $2.000 de más a Caro y a Dani) y la juntada vuelve a parcial');

-- Asistencia
select pg_temp.as_user(pg_temp.id('a'));
insert into ids select 'j2', public.create_juntada('Cumple', '2026-11-08', pg_temp.id('casa'));
select pg_temp.as_user(pg_temp.id('c'));
select public.join_juntada(pg_temp.id('j2'));
select pg_temp.check(exists (select 1 from public.juntada_attendees where juntada_id = pg_temp.id('j2') and member_id = pg_temp.id('c')),
  'cualquiera puede sumarse sola a una juntada');
select public.leave_juntada(pg_temp.id('j2'), pg_temp.id('c'));
select pg_temp.expect_error(format($$select public.leave_juntada(%L, %L)$$, pg_temp.id('j'), pg_temp.id('c')),
  'no se puede sacar a una asistente que está en un gasto');
select pg_temp.expect_error(format($$select public.update_juntada(%L, 'X', '2026-11-08', %L)$$, pg_temp.id('j2'), pg_temp.id('casa')),
  'solo la creadora edita la juntada');

-- Fotos en juntadas nuevas
reset role;
insert into storage.objects (bucket_id, name) values ('photos', pg_temp.id('j') || '/' || pg_temp.id('c') || '/n.webp'), ('photos', pg_temp.id('j') || '/' || pg_temp.id('c') || '/n-thumb.webp');
select pg_temp.as_user(pg_temp.id('c'));
select pg_temp.check(public.add_photo(pg_temp.id('j'), pg_temp.id('j') || '/' || pg_temp.id('c') || '/n.webp',
  pg_temp.id('j') || '/' || pg_temp.id('c') || '/n-thumb.webp', 10, 10, 10, 10, 'image/webp') is not null, 'subir fotos a una juntada nueva');

-- Lecturas en transacción de solo lectura (como las hace la API)
begin read only;
select pg_temp.check((select count(*) from public.v_pending_transfers) >= 1, 'las transferencias pendientes se leen en una transacción de solo lectura');
commit;

-- Balances globales y privacidad
select pg_temp.check((select i_owe_cents from public.v_member_balances where member_id = pg_temp.id('a') and currency = 'ARS') = 2000000 + 1500000,
  'Ana debe $20.000 (asado viejo) + $15.000 (tercer tiempo viejo) en total');
select pg_temp.as_user(pg_temp.id('e'));
select pg_temp.check((select count(*) from public.juntadas) = 0 and (select count(*) from public.v_pending_transfers) = 0
  and (select count(*) from public.settlements) = 0, 'una pendiente no ve juntadas, deudas ni transferencias');
select pg_temp.expect_error(format($$select public.join_juntada(%L)$$, pg_temp.id('j')), 'una pendiente no puede sumarse');
