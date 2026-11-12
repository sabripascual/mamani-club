\set ON_ERROR_STOP on
-- Se corre después de 0001_fundamentos.test.sql (reutiliza sus usuarias: a=admin, b=member).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false); set role authenticated;
do $$ begin
  begin perform public.admin_mark_temporary_password('00000000-0000-0000-0000-00000000000a');
  exception when others then raise notice 'OK  integrante no puede generar contraseñas temporales'; return; end;
  raise exception 'FALLA  integrante generó contraseña temporal';
end $$;
reset role; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false); set role authenticated;
select public.admin_mark_temporary_password('00000000-0000-0000-0000-00000000000b', 'Contraseña olvidada');
do $$ begin
  if not (select must_change_password from public.profiles where id='00000000-0000-0000-0000-00000000000b') then raise exception 'FALLA marca'; end if;
  if (select count(*) from public.audit_log where action='temporary_password_set') <> 1 then raise exception 'FALLA auditoría'; end if;
  raise notice 'OK  admin genera contraseña temporal: queda marcada y auditada';
end $$;
-- La integrante, al cambiarla, puede bajar su propia marca.
reset role; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false); set role authenticated;
update public.profiles set must_change_password = false where id = auth.uid();
do $$ begin
  if (select must_change_password from public.profiles where id='00000000-0000-0000-0000-00000000000b') then raise exception 'FALLA'; end if;
  raise notice 'OK  la integrante baja su marca al cambiar la contraseña';
end $$;
