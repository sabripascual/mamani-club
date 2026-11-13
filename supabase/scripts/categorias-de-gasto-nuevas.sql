-- =============================================================================
-- MAMANÍ CLUB · Reemplazar las categorías de GASTO por las nuevas
--
-- Borra todas las categorías y subcategorías de gasto y crea:
--   Bebida · Comida · Entradas · Transporte · Golosinas · Otro
-- sin subcategorías (se agregan después desde Admin → Categorías).
--
-- Los TIPOS DE JUNTADA (Juntada en casa, Salida, Cumple…) no se tocan: también son
-- categorías, pero de otra clase, y las juntadas los necesitan.
--
-- ⚠️  Correr DESPUÉS de "borrar-datos-de-prueba.sql": si quedan gastos cargados con
--     las categorías viejas, el script se frena sin cambiar nada.
--
-- Uso: pegar TODO en el SQL Editor de Supabase y ejecutar.
-- =============================================================================

begin;

do $$
begin
  if exists (select 1 from public.expenses) then
    raise exception 'Hay gastos cargados con las categorías viejas. Corré primero borrar-datos-de-prueba.sql.';
  end if;
end $$;

-- Primero las subcategorías, después las principales.
delete from public.categories where kind = 'gasto' and parent_id is not null;
delete from public.categories where kind = 'gasto';

insert into public.categories (kind, code, name, icon, sort_order) values
  ('gasto', 'bebida',     'Bebida',     'wine',      1),
  ('gasto', 'comida',     'Comida',     'utensils',  2),
  ('gasto', 'entradas',   'Entradas',   'ticket',    3),
  ('gasto', 'transporte', 'Transporte', 'car',       4),
  ('gasto', 'golosinas',  'Golosinas',  'candy',     5),
  ('gasto', 'otro',       'Otro',       'sparkles',  6);

-- Control
select name, icon, sort_order from public.categories where kind = 'gasto' order by sort_order;

commit;
