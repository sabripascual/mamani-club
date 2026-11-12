-- =============================================================================
-- MAMANÍ CLUB · Migración 0002 · Contraseña temporal
-- Como la app no envía emails, si una integrante olvida su contraseña una admin
-- le genera una temporal. Esta migración agrega:
--   - la marca "debe cambiar la contraseña" en el perfil;
--   - una función que registra esa acción en la auditoría (sin guardar la contraseña).
-- El cambio de contraseña en sí lo hace el servidor de la app con la clave secreta.
-- =============================================================================

alter table public.profiles
  add column must_change_password boolean not null default false;

-- La llama el servidor DESPUÉS de cambiar la contraseña en Supabase Auth.
-- Verifica que quien la llama sea admin, marca el perfil y deja constancia.
create function public.admin_mark_temporary_password(p_member uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo una administradora puede hacer esto' using errcode = '42501';
  end if;

  update public.profiles set must_change_password = true where id = p_member;
  if not found then raise exception 'Integrante inexistente'; end if;

  -- Acción de negocio explícita (el UPDATE de arriba también queda en el log genérico).
  insert into public.audit_log (actor_id, entity, entity_id, action, reason)
  values (auth.uid(), 'profiles', p_member::text, 'temporary_password_set', p_reason);
end;
$$;

revoke execute on function public.admin_mark_temporary_password(uuid, text) from public, anon;
grant  execute on function public.admin_mark_temporary_password(uuid, text) to authenticated;
