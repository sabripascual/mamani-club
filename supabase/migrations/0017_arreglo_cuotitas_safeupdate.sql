-- =============================================================================
-- MAMANÍ CLUB · Migración 0017 · Arreglo: cargar cuotitas desde la app
--
-- Supabase protege las llamadas de la app con "pg-safeupdate": rechaza cualquier
-- DELETE o UPDATE sin WHERE, aunque esté dentro de una función. cuotita_validate
-- vaciaba su tabla temporal con "delete from _parts;" y por eso cargar una cuotita
-- daba "DELETE requires a WHERE clause". Ahora usa "where true".
-- =============================================================================

begin;

create or replace function public.cuotita_validate(
  p_kind text, p_card_id uuid, p_total_cents bigint, p_installments int, p_paid_by uuid,
  p_participants uuid[], p_split public.split_type, p_custom jsonb, p_refund_alias text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_members uuid[];
begin
  if p_kind not in ('tarjeta', 'prestamo') then raise exception 'Elegí si es una compra con tarjeta o un préstamo'; end if;
  if p_installments is null or p_installments < 1 or p_installments > 48 then raise exception 'Las cuotas tienen que ser entre 1 y 48'; end if;
  if p_kind = 'tarjeta' and not exists (select 1 from public.member_cards where id = p_card_id and member_id = p_paid_by) then
    raise exception 'Elegí una tarjeta de quien pagó';
  end if;
  if nullif(trim(p_refund_alias), '') is not null
     and not exists (select 1 from public.member_aliases where member_id = p_paid_by and alias = lower(trim(p_refund_alias))) then
    raise exception 'Ese alias no es de quien pagó';
  end if;
  create temp table if not exists _parts (member_id uuid, amount_cents bigint) on commit drop;
  delete from _parts where true;  -- Supabase (pg-safeupdate) rechaza DELETE sin WHERE
  insert into _parts select s.member_id, s.amount_cents from public.compute_shares_v2(p_total_cents, p_split, p_participants, p_custom, null) s;
  select array_agg(member_id) into v_members from _parts;
  perform public.assert_members(v_members || p_paid_by);
  if not exists (select 1 from _parts where member_id <> p_paid_by and amount_cents > 0) then
    raise exception 'Tiene que haber al menos una persona que le deba a quien pagó';
  end if;
end $$;
revoke execute on function public.cuotita_validate(text, uuid, bigint, int, uuid, uuid[], public.split_type, jsonb, text) from public, anon, authenticated;

commit;

-- Fin de la migración 0017.
