-- Pruebas de la migración 0003 (casos 6, 7, 9–16, 18 y 22 del prompt maestro).
-- Se corre sobre una base con 0001 + 0002 + 0003 aplicadas, SIN los datos de otros tests.
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

-- Integrantes: Ana (admin), Bea, Caro, Dani (activas), Eli (pendiente).
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','a@x.com','{"first_name":"Ana","last_name":"A","username":"ana"}'),
 ('00000000-0000-0000-0000-00000000000b','b@x.com','{"first_name":"Bea","last_name":"B","username":"bea"}'),
 ('00000000-0000-0000-0000-00000000000c','c@x.com','{"first_name":"Caro","last_name":"C","username":"caro"}'),
 ('00000000-0000-0000-0000-00000000000d','d@x.com','{"first_name":"Dani","last_name":"D","username":"dani"}'),
 ('00000000-0000-0000-0000-00000000000e','e@x.com','{"first_name":"Eli","last_name":"E","username":"eli"}');
update public.profiles set status = 'active' where username in ('ana','bea','caro','dani');
update public.profiles set role = 'admin' where username = 'ana';

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids select 'comida', id from public.categories where code = 'comida';
insert into ids select 'asados', id from public.categories where name = 'Asados';
insert into ids select 'bebidas', id from public.categories where code = 'bebidas';
insert into ids values
 ('a','00000000-0000-0000-0000-00000000000a'), ('b','00000000-0000-0000-0000-00000000000b'),
 ('c','00000000-0000-0000-0000-00000000000c'), ('d','00000000-0000-0000-0000-00000000000d'),
 ('e','00000000-0000-0000-0000-00000000000e');
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create function pg_temp.share(e uuid, m text) returns uuid language sql as
  $$ select id from public.expense_shares where expense_id = e and member_id = pg_temp.id(m) $$;
create function pg_temp.owed(e uuid, m text) returns bigint language sql as
  $$ select outstanding_cents from public.v_share_balances where expense_id = e and member_id = pg_temp.id(m) $$;
create function pg_temp.status(e uuid) returns text language sql as
  $$ select settlement_status from public.v_expense_status where expense_id = e $$;

select pg_temp.check((select count(*) from public.categories where parent_id is null) = 8, 'categorías iniciales: 8 principales');
select pg_temp.check((select count(*) from public.categories where code = 'tercer_tiempo') = 1, 'subcategoría "Tercer tiempo" con código para rankings');

-- ---------------------------------------------------------------------------
-- Caso 9 y 10: $100.000 entre cuatro → $25.000 c/u. Bea adelanta y participa.
-- ---------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.id('b'));
insert into ids select 'asado', public.create_expense(
  'Asado en lo de Bea', '2026-03-14', pg_temp.id('comida'), 10000000, pg_temp.id('b'),
  array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c'), pg_temp.id('d')],
  p_subcategory_id => pg_temp.id('asados'));

select pg_temp.check((select bool_and(amount_cents = 2500000) and count(*) = 4 from public.expense_shares where expense_id = pg_temp.id('asado')),
  '9. $100.000 / 4 = $25.000 por integrante');
select pg_temp.check(pg_temp.owed(pg_temp.id('asado'), 'b') = 0, '10. la pagadora no se debe a sí misma');
select pg_temp.check(pg_temp.owed(pg_temp.id('asado'), 'c') = 2500000, '10. cada participante le debe $25.000 a la pagadora');
select pg_temp.check((select fx_rate = 1 and base_amount_cents = 10000000 and base_currency = 'ARS' from public.expenses where id = pg_temp.id('asado')),
  'en ARS se guarda cotización 1 y monto base');
select pg_temp.check(pg_temp.status(pg_temp.id('asado')) = 'pending', 'estado inicial: pendiente');
select pg_temp.check((select advanced_cents = 10000000 and consumed_cents = 2500000 and owed_to_me_cents = 7500000
                      from public.v_member_balances where member_id = pg_temp.id('b')),
  '22. adelantado ($100.000) ≠ consumo propio ($25.000); le deben $75.000');

-- División con centavos: $100.000 entre 3 suma exacto.
insert into ids select 'tres', public.create_expense('Picada', '2026-03-20', pg_temp.id('comida'), 10000000, pg_temp.id('b'),
  array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c')]);
select pg_temp.check((select sum(amount_cents) = 10000000 and max(amount_cents) - min(amount_cents) = 1
                      from public.expense_shares where expense_id = pg_temp.id('tres')),
  'división entre 3: suma exacta, diferencia máxima 1 centavo');

-- ---------------------------------------------------------------------------
-- Caso 11 y 12: pagos → parcial → saldado.
-- ---------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.id('c'));
insert into ids select 'pago_c', public.mark_share_paid(pg_temp.share(pg_temp.id('asado'), 'c'), 'Transferencia');
select pg_temp.check((select amount_cents = 2500000 and from_member = pg_temp.id('c') and to_member = pg_temp.id('b')
                      from public.payments where id = pg_temp.id('pago_c')),
  'marcar pagado registra el monto exacto de la parte, de deudora a pagadora');
select pg_temp.check(pg_temp.owed(pg_temp.id('asado'), 'c') = 0 and pg_temp.status(pg_temp.id('asado')) = 'partial',
  '11. un pago actualiza el saldo y la juntada queda parcialmente saldada');

-- Caso 15: pago duplicado.
select pg_temp.expect_error(format($$select public.mark_share_paid(%L)$$, pg_temp.share(pg_temp.id('asado'), 'c')),
  '15. pago duplicado rechazado');
-- Una tercera no puede marcar la deuda de otra.
select pg_temp.expect_error(format($$select public.mark_share_paid(%L)$$, pg_temp.share(pg_temp.id('asado'), 'd')),
  'no se puede marcar como pagada la deuda de otra (sin ser pagadora ni admin)');
-- Nadie escribe pagos directo en la tabla.
select pg_temp.expect_error(format($$insert into public.payments (share_id, expense_id, from_member, to_member, amount_cents, currency, paid_on, created_by)
  values (%L, %L, %L, %L, 1, 'ARS', current_date, %L)$$, pg_temp.share(pg_temp.id('asado'), 'd'), pg_temp.id('asado'),
  pg_temp.id('d'), pg_temp.id('b'), pg_temp.id('c')), 'insertar pagos directo en la tabla está prohibido');

select pg_temp.as_user(pg_temp.id('b'));   -- la pagadora registra que le pagaron
select public.mark_share_paid(pg_temp.share(pg_temp.id('asado'), 'd'));
select pg_temp.as_user(pg_temp.id('a'));   -- Ana paga lo suyo
select public.mark_share_paid(pg_temp.share(pg_temp.id('asado'), 'a'));
select pg_temp.check(pg_temp.status(pg_temp.id('asado')) = 'settled', '12. con todas las partes pagadas, la juntada queda saldada');
select pg_temp.expect_error(format($$select public.mark_share_paid(%L)$$, pg_temp.share(pg_temp.id('asado'), 'b')),
  'la pagadora no puede "pagarse" su propia parte');

-- ---------------------------------------------------------------------------
-- Caso 13: pagadora que NO participó.
-- ---------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.id('d'));
insert into ids select 'fernet', public.create_expense('Fernet para la previa', '2026-04-02', pg_temp.id('bebidas'), 3000000, pg_temp.id('d'),
  array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c')]);
select pg_temp.check(not exists (select 1 from public.expense_shares where expense_id = pg_temp.id('fernet') and member_id = pg_temp.id('d')),
  '13. si la pagadora no participó, no tiene consumo a su nombre');
select pg_temp.check((select advanced_cents = 3000000 and consumed_cents = 2500000 from public.v_member_balances where member_id = pg_temp.id('d')),
  '13. Dani adelantó $30.000 (fernet) y su consumo es solo el del asado ($25.000): el fernet no le suma');

-- ---------------------------------------------------------------------------
-- Caso 14: división personalizada debe sumar exacto.
-- ---------------------------------------------------------------------------
select pg_temp.expect_error(format($$select public.create_expense('Bar', '2026-04-10', %L, 1000000, %L,
  p_split_type => 'custom', p_custom_shares => %L)$$, pg_temp.id('bebidas'), pg_temp.id('d'),
  jsonb_build_array(jsonb_build_object('member_id', pg_temp.id('a'), 'amount_cents', 600000),
                    jsonb_build_object('member_id', pg_temp.id('d'), 'amount_cents', 300000))),
  '14. división personalizada que no suma el total es rechazada');
insert into ids select 'bar', public.create_expense('Bar', '2026-04-10', pg_temp.id('bebidas'), 1000000, pg_temp.id('d'),
  p_split_type => 'custom', p_custom_shares => jsonb_build_array(
    jsonb_build_object('member_id', pg_temp.id('a'), 'amount_cents', 700000),
    jsonb_build_object('member_id', pg_temp.id('d'), 'amount_cents', 300000)));
select pg_temp.check(pg_temp.owed(pg_temp.id('bar'), 'a') = 700000, '14. división personalizada válida');

-- Validaciones varias.
select pg_temp.expect_error(format($$select public.create_expense('X', '2026-04-10', %L, 1000, %L, array[%L]::uuid[])$$,
  pg_temp.id('bebidas'), pg_temp.id('d'), pg_temp.id('e')), 'una integrante pendiente no puede participar');
select pg_temp.expect_error(format($$select public.create_expense('X', '2026-04-10', %L, 1000, %L, array[]::uuid[])$$,
  pg_temp.id('bebidas'), pg_temp.id('d')), 'sin participantes es rechazado');
select pg_temp.expect_error(format($$select public.create_expense('X', '2026-04-10', %L, 1000, %L, array[%L]::uuid[], p_subcategory_id => %L)$$,
  pg_temp.id('bebidas'), pg_temp.id('d'), pg_temp.id('a'), pg_temp.id('asados')), 'subcategoría de otra categoría es rechazada');
select pg_temp.expect_error(format($$select public.create_expense('X', null, %L, 1000, %L, array[%L]::uuid[])$$,
  pg_temp.id('bebidas'), pg_temp.id('d'), pg_temp.id('a')), 'la fecha de la juntada es obligatoria');

-- Caso 18: no se mezclan monedas sin conversión explícita.
select pg_temp.expect_error(format($$select public.create_expense('X', '2026-04-10', %L, 1000, %L, array[%L]::uuid[], p_currency => 'USD')$$,
  pg_temp.id('bebidas'), pg_temp.id('d'), pg_temp.id('a')), '18. moneda no habilitada es rechazada');
reset role; update public.currencies set enabled = true where code = 'USD';
select pg_temp.as_user(pg_temp.id('d'));
select pg_temp.expect_error(format($$select public.create_expense('X', '2026-04-10', %L, 1000, %L, array[%L]::uuid[], p_currency => 'USD')$$,
  pg_temp.id('bebidas'), pg_temp.id('d'), pg_temp.id('a')), '18. gasto en USD sin cotización es rechazado');
insert into ids select 'usd', public.create_expense('Excursión', '2026-04-11', pg_temp.id('bebidas'), 10000, pg_temp.id('d'),
  array[pg_temp.id('a')], p_currency => 'USD', p_fx_rate => 1200, p_fx_rate_date => '2026-04-11');
select pg_temp.check((select base_amount_cents = 12000000 and fx_rate = 1200 from public.expenses where id = pg_temp.id('usd')),
  '18. USD 100 × 1200 = ARS 120.000 en moneda base, con la cotización guardada');
select pg_temp.check((select count(*) = 2 from public.v_member_balances where member_id = pg_temp.id('a') and i_owe_cents > 0),
  '18. los saldos se muestran por moneda, sin sumar ARS con USD');
reset role; update public.currencies set enabled = false where code = 'USD';

-- ---------------------------------------------------------------------------
-- Casos 6 y 7: permisos de edición.
-- ---------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.id('c'));
select pg_temp.expect_error(format($$select public.update_expense(%L, 'Hackeo', '2026-04-02', %L, 1, %L, array[%L]::uuid[])$$,
  pg_temp.id('fernet'), pg_temp.id('bebidas'), pg_temp.id('d'), pg_temp.id('c')),
  '6. una integrante no puede editar gastos creados por otra');
select pg_temp.expect_error(format($$update public.expenses set amount_cents = 1 where id = %L$$, pg_temp.id('fernet')),
  '6. tampoco puede modificar la tabla directo');

select pg_temp.as_user(pg_temp.id('a'));
select public.update_expense(pg_temp.id('fernet'), 'Fernet para la previa', '2026-04-02', pg_temp.id('bebidas'), 3000000, pg_temp.id('d'),
  array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c')], p_description => 'Corregido por admin');
select pg_temp.check((select description = 'Corregido por admin' from public.expenses where id = pg_temp.id('fernet')),
  '7. una admin puede editar cualquier gasto');

-- ---------------------------------------------------------------------------
-- Caso 16: cambiar el importe de un gasto con pagos recalcula y audita.
-- ---------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.id('b'));
select public.update_expense(pg_temp.id('asado'), 'Asado en lo de Bea', '2026-03-14', pg_temp.id('comida'), 12000000, pg_temp.id('b'),
  array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c'), pg_temp.id('d')], p_reason => 'Faltaba el carbón');
select pg_temp.check((select bool_and(amount_cents = 3000000) from public.expense_shares where expense_id = pg_temp.id('asado')),
  '16. al subir a $120.000 las partes pasan a $30.000');
select pg_temp.check(pg_temp.owed(pg_temp.id('asado'), 'c') = 500000 and pg_temp.status(pg_temp.id('asado')) = 'partial',
  '16. quien ya había pagado $25.000 ahora debe la diferencia ($5.000)');
select public.mark_share_paid(pg_temp.share(pg_temp.id('asado'), 'c'));
select pg_temp.check(pg_temp.owed(pg_temp.id('asado'), 'c') = 0, '16. "marcar pagado" salda exactamente la diferencia');

-- Ahora baja el total y sacamos a Dani (que ya había pagado): corresponde reintegro.
select public.update_expense(pg_temp.id('asado'), 'Asado en lo de Bea', '2026-03-14', pg_temp.id('comida'), 9000000, pg_temp.id('b'),
  array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c')], p_reason => 'Dani no vino');
select pg_temp.check((select not is_participant and amount_cents = 0 from public.expense_shares
                      where expense_id = pg_temp.id('asado') and member_id = pg_temp.id('d')),
  '16. la que salió de la juntada conserva su fila (con sus pagos) y deja de participar');
select pg_temp.check(pg_temp.owed(pg_temp.id('asado'), 'd') = -2500000, '16. a quien pagó y salió le corresponde reintegro de $25.000');
select pg_temp.check(pg_temp.owed(pg_temp.id('asado'), 'c') = 0,
  '16. Caro: parte $30.000, ya pagó $30.000 → sigue saldada');
select public.mark_share_paid(pg_temp.share(pg_temp.id('asado'), 'd'));   -- Bea le reintegra a Dani
select pg_temp.check((select kind = 'refund' and from_member = pg_temp.id('b') and to_member = pg_temp.id('d') and amount_cents = 2500000
                      from public.payments where share_id = pg_temp.share(pg_temp.id('asado'), 'd') order by created_at desc limit 1),
  '16. el reintegro va de la pagadora a la que pagó de más');
select pg_temp.as_user(pg_temp.id('a'));  -- la auditoría solo la leen admins
select pg_temp.check((select count(*) from public.audit_log where entity_id = pg_temp.id('asado')::text and action = 'expense_updated'
                      and old_values ? 'shares' and new_values ? 'shares' and reason is not null) = 2,
  '16. cada edición queda auditada con snapshot de partes antes y después y motivo');

select pg_temp.as_user(pg_temp.id('b'));
select pg_temp.check((select count(*) from public.audit_log) = 0, 'una integrante común no ve la auditoría');
-- No se puede cambiar quién pagó si hay pagos.
select pg_temp.expect_error(format($$select public.update_expense(%L, 'Asado', '2026-03-14', %L, 9000000, %L, array[%L, %L, %L]::uuid[])$$,
  pg_temp.id('asado'), pg_temp.id('comida'), pg_temp.id('a'), pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c')),
  'no se puede cambiar quién pagó si ya hay pagos');

-- ---------------------------------------------------------------------------
-- Deshacer pagos y anular juntadas.
-- ---------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.id('c'));
select public.void_payment(pg_temp.id('pago_c'), 'Me equivoqué');
select pg_temp.check(pg_temp.owed(pg_temp.id('asado'), 'c') = 2500000, 'deshacer un pago vuelve a dejar la deuda');
select pg_temp.check((select status = 'void' from public.payments where id = pg_temp.id('pago_c')), 'el pago deshecho no se borra: queda anulado');
select pg_temp.expect_error(format($$select public.void_expense(%L, 'x')$$, pg_temp.id('asado')), 'una integrante no anula gastos ajenos');
select pg_temp.as_user(pg_temp.id('b'));
select pg_temp.expect_error(format($$select public.void_expense(%L, 'Prueba')$$, pg_temp.id('asado')), 'no se anula una juntada con pagos activos');
select public.void_expense(pg_temp.id('tres'), 'Cargada dos veces');
select pg_temp.check(not exists (select 1 from public.v_expense_status where expense_id = pg_temp.id('tres')),
  'una juntada anulada deja de contar en saldos');
select pg_temp.check(exists (select 1 from public.expenses where id = pg_temp.id('tres') and status = 'void'),
  'pero sigue existiendo en el historial');

-- Pendiente no ve nada financiero.
select pg_temp.as_user(pg_temp.id('e'));
select pg_temp.check((select count(*) from public.expenses) = 0 and (select count(*) from public.v_debts) = 0
                     and (select count(*) from public.categories) = 0,
  '2. una pendiente no ve gastos, deudas ni categorías');

-- Auditoría de pagos.
select pg_temp.as_user(pg_temp.id('a'));
select pg_temp.check((select count(*) from public.audit_log where action in ('payment_created', 'refund_created', 'payment_voided')) = 6,
  '38. pagos, reintegros y anulaciones quedan auditados');
