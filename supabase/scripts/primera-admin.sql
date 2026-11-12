-- Convierte a una usuaria ya registrada en la PRIMERA administradora.
-- Correr UNA vez en Supabase → SQL Editor, después de registrarte en la app.
-- Reemplazá TU_USERNAME por tu username (en minúsculas).

update public.profiles
set role = 'admin', status = 'active'
where username = 'TU_USERNAME';

-- Verificación: tiene que devolver una fila con role = admin y status = active.
select username, role, status, joined_at from public.profiles where username = 'TU_USERNAME';
