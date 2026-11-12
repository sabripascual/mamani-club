-- =============================================================================
-- MAMANÍ CLUB · Migración 0006 · Solicitudes de cambio de contraseña
--
-- Como la app no manda emails, quien olvida su contraseña la pide desde la
-- pantalla de ingreso. La solicitud le llega a las admins (push + panel), y una
-- admin la aprueba: la app genera una contraseña temporal para pasársela.
--
-- La solicitud la crea el SERVIDOR (con la clave secreta), porque quien la pide
-- no tiene sesión. Para no revelar quién tiene cuenta, la pantalla responde
-- siempre lo mismo, exista o no el email/username.
-- =============================================================================

create type public.request_status as enum ('pending', 'approved', 'rejected');

create table public.password_reset_requests (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.profiles(id),
  status       public.request_status not null default 'pending',
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles(id)
);

-- Una sola solicitud pendiente por integrante (si pide dos veces, no se duplica).
create unique index password_reset_one_pending
  on public.password_reset_requests (member_id) where status = 'pending';

alter table public.password_reset_requests enable row level security;

create policy "admins ven solicitudes de contraseña" on public.password_reset_requests
  for select to authenticated using (public.is_admin());

revoke insert, update, delete, truncate on public.password_reset_requests from anon, authenticated;
revoke all on public.password_reset_requests from anon;

-- Resolver una solicitud (aprobar o rechazar). Solo admins; queda auditado.
-- La contraseña temporal la genera la app con admin_mark_temporary_password.
create function public.admin_resolve_password_request(p_request_id uuid, p_status public.request_status)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v public.password_reset_requests;
begin
  if not public.is_admin() then
    raise exception 'Solo una administradora puede hacer esto' using errcode = '42501';
  end if;
  if p_status = 'pending' then raise exception 'Estado inválido'; end if;
  select * into v from public.password_reset_requests where id = p_request_id for update;
  if not found then raise exception 'La solicitud no existe'; end if;
  if v.status <> 'pending' then raise exception 'La solicitud ya fue resuelta'; end if;

  update public.password_reset_requests
     set status = p_status, resolved_at = now(), resolved_by = auth.uid()
   where id = p_request_id;
  perform public.write_audit('password_reset_requests', p_request_id,
    case when p_status = 'approved' then 'password_request_approved' else 'password_request_rejected' end,
    to_jsonb(v), (select to_jsonb(r) from public.password_reset_requests r where r.id = p_request_id));
  return v.member_id;
end $$;

revoke execute on function public.admin_resolve_password_request(uuid, public.request_status) from public, anon;
grant  execute on function public.admin_resolve_password_request(uuid, public.request_status) to authenticated;

-- Encontrar a una integrante ACTIVA por email o username (para pedir el cambio).
-- Solo la puede ejecutar el servidor (service_role): nunca el navegador.
create function public.member_id_for_login(identifier text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.status = 'active'
    and (p.username = lower(trim(identifier)) or lower(u.email) = lower(trim(identifier)))
  limit 1;
$$;

revoke execute on function public.member_id_for_login(text) from public, anon, authenticated;
grant  execute on function public.member_id_for_login(text) to service_role;

-- Fin de la migración 0006.
