-- Datos cargados con el MODELO VIEJO (antes de 0007), para probar la migración.
\set ON_ERROR_STOP on
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','a@x.com','{"first_name":"Ana","last_name":"A","username":"ana"}'),
 ('00000000-0000-0000-0000-00000000000b','b@x.com','{"first_name":"Bea","last_name":"B","username":"bea"}'),
 ('00000000-0000-0000-0000-00000000000c','c@x.com','{"first_name":"Caro","last_name":"C","username":"caro"}'),
 ('00000000-0000-0000-0000-00000000000d','d@x.com','{"first_name":"Dani","last_name":"D","username":"dani"}'),
 ('00000000-0000-0000-0000-00000000000e','e@x.com','{"first_name":"Eli","last_name":"E","username":"eli"}');
update public.profiles set status = 'active' where username in ('ana','bea','caro','dani');
update public.profiles set role = 'admin' where username = 'ana';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
set role authenticated;
-- Asado viejo: $100.000 entre 4, pagó Bea. Caro pagó; Dani pagó y después se deshizo.
select public.create_expense('Asado viejo', '2026-03-14', (select id from public.categories where code = 'comida'), 10000000,
  '00000000-0000-0000-0000-00000000000b', array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b',
  '00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000d']::uuid[]);
select public.mark_share_paid((select s.id from public.expense_shares s join public.expenses e on e.id = s.expense_id
  where e.title = 'Asado viejo' and s.member_id = '00000000-0000-0000-0000-00000000000c'));
select public.mark_share_paid((select s.id from public.expense_shares s join public.expenses e on e.id = s.expense_id
  where e.title = 'Asado viejo' and s.member_id = '00000000-0000-0000-0000-00000000000d'));
select public.void_payment((select p.id from public.payments p join public.expenses e on e.id = p.expense_id
  where e.title = 'Asado viejo' and p.from_member = '00000000-0000-0000-0000-00000000000d'), 'error');
-- Edición que deja a Caro con reintegro: baja a $80.000 → parte $20.000 (pagó $25.000).
select public.update_expense((select id from public.expenses where title = 'Asado viejo'), 'Asado viejo', '2026-03-14',
  (select id from public.categories where code = 'comida'), 8000000, '00000000-0000-0000-0000-00000000000b',
  array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b',
  '00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000d']::uuid[]);
-- Tercer tiempo viejo (subcategoría Tercer tiempo), pagó Caro.
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
set role authenticated;
select public.create_expense('Tercer tiempo viejo', '2026-04-02', (select id from public.categories where code = 'deportes'), 3000000,
  '00000000-0000-0000-0000-00000000000c', array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000c']::uuid[],
  p_subcategory_id => (select id from public.categories where code = 'tercer_tiempo'));
-- Una foto en el asado viejo.
grant select, insert on storage.objects to authenticated;
reset role;
insert into storage.objects (bucket_id, name) select 'photos', id || '/00000000-0000-0000-0000-00000000000c/f.webp' from public.expenses where title = 'Asado viejo';
insert into storage.objects (bucket_id, name) select 'photos', id || '/00000000-0000-0000-0000-00000000000c/f-thumb.webp' from public.expenses where title = 'Asado viejo';
set role authenticated;
select public.add_photo((select id from public.expenses where title = 'Asado viejo'),
  (select id from public.expenses where title = 'Asado viejo') || '/00000000-0000-0000-0000-00000000000c/f.webp',
  (select id from public.expenses where title = 'Asado viejo') || '/00000000-0000-0000-0000-00000000000c/f-thumb.webp', 10, 10, 10, 10, 'image/webp');
reset role;
