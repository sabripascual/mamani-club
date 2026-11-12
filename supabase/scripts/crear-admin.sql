-- =============================================================================
-- Crear una ADMIN directamente desde la base (sin pasar por el registro).
-- Supabase → SQL Editor → New query → completar los 6 datos → Run.
--
-- - Si el email ya tiene cuenta, no la duplica: solo la convierte en admin activa.
-- - La contraseña que pongas acá es TEMPORAL: al primer ingreso la app te pide cambiarla
--   (porque este texto queda guardado en el historial del SQL Editor).
-- =============================================================================
do $$
declare
  -- ▼▼▼ COMPLETAR ▼▼▼
  v_email      text := 'tu-email@ejemplo.com';
  v_password   text := 'temporal-cambiar-123';   -- mínimo 8 caracteres
  v_first_name text := 'Nombre';
  v_last_name  text := 'Apellido';
  v_username   text := 'tu.username';            -- minúsculas, números, punto o guion bajo (3 a 20)
  v_nickname   text := '';                       -- opcional: dejar '' si no querés apodo
  -- ▲▲▲ COMPLETAR ▲▲▲
  v_id uuid;
begin
  v_email := lower(trim(v_email));
  select id into v_id from auth.users where email = v_email;

  if v_id is null then
    v_id := gen_random_uuid();

    -- 1) Usuaria de Supabase Auth, con email ya confirmado y la contraseña encriptada (bcrypt).
    --    Los campos *_token van en '' porque Supabase Auth falla si están en NULL.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('first_name', v_first_name, 'last_name', v_last_name,
                         'username', v_username, 'nickname', v_nickname),
      now(), now(), '', '', '', ''
    );

    -- 2) Identidad "email" (Supabase la necesita para permitir el login con contraseña).
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );
    -- El trigger on_auth_user_created ya creó su perfil (pending/member).
  end if;

  -- 3) Admin activa, con cambio de contraseña obligatorio al ingresar. Queda auditado.
  update public.profiles
     set role = 'admin', status = 'active', must_change_password = true
   where id = v_id;

  raise notice 'Listo: % es admin. Ingresá con tu email o username y la contraseña temporal.', v_email;
end $$;

-- Verificación: tiene que mostrar tu fila con role = admin y status = active.
select p.username, u.email, p.role, p.status, p.must_change_password, p.joined_at
from public.profiles p join auth.users u on u.id = p.id
where p.role = 'admin';
