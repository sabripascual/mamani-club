-- =============================================================================
-- MAMANÍ CLUB · Migración 0020 · Sumar a otras integrantes a una juntada
--
-- Botón "+ Sumar" en "Fueron": quien creó la juntada, cualquiera que ya esté en ella
-- o una admin puede sumar a otras integrantes activas. Cada una se puede seguir
-- sumando sola (join_juntada). Devuelve a quiénes sumó de verdad (las nuevas), para
-- avisarles.
-- =============================================================================
begin;

create or replace function public.add_juntada_attendees(p_juntada_id uuid, p_members uuid[])
returns setof uuid language plpgsql security definer set search_path = '' as $$
declare v public.juntadas;
begin
  if not public.is_active_member() then raise exception 'Solo integrantes activas' using errcode = '42501'; end if;
  select * into v from public.juntadas where id = p_juntada_id;
  if not found or v.status <> 'active' then raise exception 'La juntada no existe'; end if;
  if not (public.is_admin() or auth.uid() = v.created_by
          or exists (select 1 from public.juntada_attendees where juntada_id = p_juntada_id and member_id = auth.uid())) then
    raise exception 'Solo quien está en la juntada puede sumar a otras' using errcode = '42501';
  end if;
  if coalesce(array_length(p_members, 1), 0) = 0 then return; end if;
  if coalesce(array_length(p_members, 1), 0) > 50 then raise exception 'Demasiadas integrantes'; end if;
  if exists (select 1 from unnest(p_members) m
             where not exists (select 1 from public.profiles where id = m and status = 'active')) then
    raise exception 'Hay integrantes inválidas';
  end if;
  return query
    insert into public.juntada_attendees (juntada_id, member_id, added_by)
    select distinct p_juntada_id, m, auth.uid() from unnest(p_members) m
    on conflict do nothing
    returning member_id;
end $$;
revoke all on function public.add_juntada_attendees(uuid, uuid[]) from public, anon;
grant execute on function public.add_juntada_attendees(uuid, uuid[]) to authenticated;

commit;

-- Fin de la migración 0020.
