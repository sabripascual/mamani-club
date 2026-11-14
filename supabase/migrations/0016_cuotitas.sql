-- =============================================================================
-- MAMANÍ CLUB · Migración 0016 · Las Cuotitas ("Mamaní te banca")
--
-- Compras con tarjeta en cuotas y préstamos, TOTALMENTE APARTE de juntadas y gastos
-- (no tocan saldos, estadísticas de juntadas ni rankings, salvo los avisos de deuda
-- que suman para "El roedor").
--
--   member_cards          tarjetas de cada una: SOLO la marca y un nombre opcional
--                         (nunca números).
--   cuotitas              la compra o el préstamo: total, cuotas, desde qué mes, quién pagó.
--   cuotita_parts         parte de cada participante (la de quien pagó no se le debe a nadie).
--   cuotita_installments  las cuotas de cada deudora: número, mes, importe, si se pagó.
--
-- División: el total se reparte entre participantes (igual o personalizado, al centavo)
-- y la parte de cada deudora en N cuotas; los centavos que sobran van a las primeras.
--
-- IMPORTANTE: correr el archivo ENTERO (los ALTER TYPE van fuera de la transacción).
-- =============================================================================

alter type public.notification_kind add value if not exists 'cuotita';
alter type public.notification_kind add value if not exists 'cuotita_cobro';

begin;

-- -----------------------------------------------------------------------------
-- 1. MIS TARJETAS (solo marca + nombre, sin números)
-- -----------------------------------------------------------------------------
create table public.member_cards (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles(id),
  brand       text not null check (brand in ('visa', 'mastercard', 'amex', 'naranja', 'cabal', 'otra')),
  label       text check (label is null or (length(trim(label)) between 1 and 30 and label !~ '[0-9]')),
  created_at  timestamptz not null default now()
);
create index member_cards_member_idx on public.member_cards (member_id);

create function public.guard_member_card()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.label := nullif(trim(new.label), '');
  if tg_op = 'INSERT' and (select count(*) from public.member_cards where member_id = new.member_id) >= 8 then
    raise exception 'Podés tener hasta 8 tarjetas';
  end if;
  return new;
end $$;
create trigger guard_member_card before insert or update on public.member_cards
  for each row execute function public.guard_member_card();

-- "Visa Galicia", "Naranja X", "Tarjeta"...
create function public.card_display(p_brand text, p_label text)
returns text language sql immutable set search_path = '' as $$
  select concat_ws(' ',
    case p_brand when 'visa' then 'Visa' when 'mastercard' then 'Mastercard' when 'amex' then 'American Express'
                 when 'naranja' then 'Naranja X' when 'cabal' then 'Cabal' else 'Tarjeta' end,
    nullif(trim(p_label), ''));
$$;

-- -----------------------------------------------------------------------------
-- 2. CUOTITAS
-- -----------------------------------------------------------------------------
create table public.cuotitas (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(trim(title)) between 1 and 80),
  kind          text not null check (kind in ('tarjeta', 'prestamo')),
  card_id       uuid references public.member_cards(id) on delete set null,
  card_label    text,                                   -- "Visa Galicia" (queda aunque borren la tarjeta)
  total_cents   bigint not null check (total_cents > 0),
  installments  int not null check (installments between 1 and 48),
  first_month   date not null check (extract(day from first_month) = 1),
  paid_by       uuid not null references public.profiles(id),
  created_by    uuid not null references public.profiles(id),
  split_type    public.split_type not null default 'equal',
  refund_alias  text check (refund_alias is null or length(refund_alias) between 6 and 20),
  description   text check (description is null or length(description) <= 500),
  status        public.record_status not null default 'active',
  void_reason   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (kind = 'tarjeta' or card_id is null)
);
create index cuotitas_paid_by_idx on public.cuotitas (paid_by);

create table public.cuotita_parts (
  cuotita_id    uuid not null references public.cuotitas(id) on delete cascade,
  member_id     uuid not null references public.profiles(id),
  amount_cents  bigint not null check (amount_cents >= 0),
  primary key (cuotita_id, member_id)
);

create table public.cuotita_installments (
  id            uuid primary key default gen_random_uuid(),
  cuotita_id    uuid not null references public.cuotitas(id) on delete cascade,
  member_id     uuid not null references public.profiles(id),   -- quien debe esta cuota
  number        int not null check (number >= 1),
  due_month     date not null,                                  -- 1° del mes en que se paga
  amount_cents  bigint not null check (amount_cents >= 0),
  paid_at       timestamptz,
  paid_by       uuid references public.profiles(id),            -- quién la marcó pagada
  unique (cuotita_id, member_id, number)
);
create index cuotita_installments_member_idx on public.cuotita_installments (member_id, due_month) where paid_at is null;

create function public.cuotita_snapshot(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(c) || jsonb_build_object(
    'parts', coalesce((select jsonb_agg(jsonb_build_object('member_id', p.member_id, 'amount_cents', p.amount_cents) order by p.member_id)
                       from public.cuotita_parts p where p.cuotita_id = c.id), '[]'::jsonb),
    'paid_installments', (select count(*) from public.cuotita_installments i where i.cuotita_id = c.id and i.paid_at is not null))
  from public.cuotitas c where c.id = p_id;
$$;

-- Valida y calcula las partes (en _parts) de una cuotita. Uso interno.
create function public.cuotita_validate(
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
  delete from _parts;
  insert into _parts select s.member_id, s.amount_cents from public.compute_shares_v2(p_total_cents, p_split, p_participants, p_custom, null) s;
  select array_agg(member_id) into v_members from _parts;
  perform public.assert_members(v_members || p_paid_by);
  if not exists (select 1 from _parts where member_id <> p_paid_by and amount_cents > 0) then
    raise exception 'Tiene que haber al menos una persona que le deba a quien pagó';
  end if;
end $$;

-- Guarda partes y cuotas a partir de _parts. Uso interno.
create function public.cuotita_fill(p_id uuid, p_installments int, p_first_month date, p_paid_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.cuotita_installments where cuotita_id = p_id;
  delete from public.cuotita_parts where cuotita_id = p_id;
  insert into public.cuotita_parts (cuotita_id, member_id, amount_cents) select p_id, member_id, amount_cents from _parts;
  insert into public.cuotita_installments (cuotita_id, member_id, number, due_month, amount_cents)
  select p_id, p.member_id, n, (p_first_month + make_interval(months => n - 1))::date,
         p.amount_cents / p_installments + case when n <= p.amount_cents % p_installments then 1 else 0 end
  from _parts p cross join generate_series(1, p_installments) n
  where p.member_id <> p_paid_by and p.amount_cents > 0;
end $$;

create function public.create_cuotita(
  p_title         text,
  p_kind          text,
  p_total_cents   bigint,
  p_installments  int,
  p_first_month   date,
  p_paid_by       uuid,
  p_participants  uuid[]            default null,
  p_split_type    public.split_type default 'equal',
  p_custom_shares jsonb             default null,
  p_card_id       uuid              default null,
  p_description   text              default null,
  p_refund_alias  text              default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_month date := date_trunc('month', p_first_month)::date;
begin
  if not public.is_active_member() then raise exception 'Solo integrantes activas pueden cargar cuotitas' using errcode = '42501'; end if;
  perform public.cuotita_validate(p_kind, p_card_id, p_total_cents, p_installments, p_paid_by, p_participants, p_split_type, p_custom_shares, p_refund_alias);
  insert into public.cuotitas (title, kind, card_id, card_label, total_cents, installments, first_month, paid_by, created_by,
                               split_type, refund_alias, description)
  values (trim(p_title), p_kind, case when p_kind = 'tarjeta' then p_card_id end,
          (select public.card_display(brand, label) from public.member_cards where id = p_card_id and p_kind = 'tarjeta'),
          p_total_cents, p_installments, v_month, p_paid_by, auth.uid(), p_split_type,
          lower(nullif(trim(p_refund_alias), '')), nullif(trim(p_description), ''))
  returning id into v_id;
  perform public.cuotita_fill(v_id, p_installments, v_month, p_paid_by);
  perform public.write_audit('cuotitas', v_id, 'cuotita_created', null, public.cuotita_snapshot(v_id));
  return v_id;
end $$;

-- Editar: quien pagó, quien la cargó o una admin. Con cuotas ya pagadas solo se cambian
-- el nombre, la tarjeta, el alias y el detalle.
create function public.update_cuotita(
  p_id            uuid,
  p_title         text,
  p_kind          text,
  p_total_cents   bigint,
  p_installments  int,
  p_first_month   date,
  p_paid_by       uuid,
  p_participants  uuid[]            default null,
  p_split_type    public.split_type default 'equal',
  p_custom_shares jsonb             default null,
  p_card_id       uuid              default null,
  p_description   text              default null,
  p_refund_alias  text              default null,
  p_reason        text              default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v public.cuotitas; v_before jsonb; v_month date := date_trunc('month', p_first_month)::date;
begin
  select * into v from public.cuotitas where id = p_id for update;
  if not found or v.status <> 'active' then raise exception 'La cuotita no existe o está anulada'; end if;
  if not (public.is_admin() or (public.is_active_member() and auth.uid() in (v.paid_by, v.created_by))) then
    raise exception 'Solo quien pagó, quien la cargó o una admin puede editarla' using errcode = '42501';
  end if;
  perform public.cuotita_validate(p_kind, p_card_id, p_total_cents, p_installments, p_paid_by, p_participants, p_split_type, p_custom_shares, p_refund_alias);
  if exists (select 1 from public.cuotita_installments where cuotita_id = p_id and paid_at is not null) and (
       p_kind <> v.kind or p_total_cents <> v.total_cents or p_installments <> v.installments or v_month <> v.first_month
       or p_paid_by <> v.paid_by
       or exists (select member_id, amount_cents from _parts except select member_id, amount_cents from public.cuotita_parts where cuotita_id = p_id)
       or exists (select member_id, amount_cents from public.cuotita_parts where cuotita_id = p_id except select member_id, amount_cents from _parts)) then
    raise exception 'Ya hay cuotas pagadas: solo podés cambiar el nombre, la tarjeta, el alias y el detalle';
  end if;
  v_before := public.cuotita_snapshot(p_id);
  update public.cuotitas set title = trim(p_title), kind = p_kind, card_id = case when p_kind = 'tarjeta' then p_card_id end,
    card_label = (select public.card_display(brand, label) from public.member_cards where id = p_card_id and p_kind = 'tarjeta'),
    total_cents = p_total_cents, installments = p_installments, first_month = v_month, paid_by = p_paid_by,
    split_type = p_split_type, refund_alias = lower(nullif(trim(p_refund_alias), '')), description = nullif(trim(p_description), ''),
    updated_at = now()
  where id = p_id;
  if not exists (select 1 from public.cuotita_installments where cuotita_id = p_id and paid_at is not null) then
    perform public.cuotita_fill(p_id, p_installments, v_month, p_paid_by);
  end if;
  perform public.write_audit('cuotitas', p_id, 'cuotita_updated', v_before, public.cuotita_snapshot(p_id), p_reason);
end $$;

create function public.void_cuotita(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.cuotitas; v_before jsonb;
begin
  select * into v from public.cuotitas where id = p_id for update;
  if not found or v.status <> 'active' then raise exception 'La cuotita no existe o ya está anulada'; end if;
  if not (public.is_admin() or (public.is_active_member() and auth.uid() in (v.paid_by, v.created_by))) then
    raise exception 'Solo quien pagó, quien la cargó o una admin puede anularla' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo'; end if;
  v_before := public.cuotita_snapshot(p_id);
  update public.cuotitas set status = 'void', void_reason = trim(p_reason), updated_at = now() where id = p_id;
  perform public.write_audit('cuotitas', p_id, 'cuotita_voided', v_before, public.cuotita_snapshot(p_id), p_reason);
end $$;

-- Marcar (o desmarcar) cuotas pagadas: quien debe, quien cobra o una admin.
create function public.set_installments_paid(p_ids uuid[], p_paid boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int; v_cuotita uuid;
begin
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Elegí al menos una cuota'; end if;
  if exists (
    select 1 from public.cuotita_installments i join public.cuotitas c on c.id = i.cuotita_id
    where i.id = any(p_ids)
      and (c.status <> 'active' or not (public.is_admin() or (public.is_active_member() and auth.uid() in (i.member_id, c.paid_by))))
  ) or (select count(*) from public.cuotita_installments where id = any(p_ids)) <> cardinality(p_ids) then
    raise exception 'Solo quien debe, quien cobra o una admin puede marcar estas cuotas' using errcode = '42501';
  end if;
  for v_cuotita in select distinct cuotita_id from public.cuotita_installments where id = any(p_ids) loop
    perform public.write_audit('cuotitas', v_cuotita, case when p_paid then 'installments_paid' else 'installments_unpaid' end,
      null, jsonb_build_object('installments', (select jsonb_agg(jsonb_build_object('member_id', member_id, 'number', number))
                                                 from public.cuotita_installments where cuotita_id = v_cuotita and id = any(p_ids))));
  end loop;
  update public.cuotita_installments
     set paid_at = case when p_paid then coalesce(paid_at, now()) end,
         paid_by = case when p_paid then coalesce(paid_by, auth.uid()) end
   where id = any(p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- "El roedor" también cuenta los recordatorios de cuotitas.
create or replace function public.debt_reminders_sent()
returns table (member_id uuid, sent_on date)
language sql stable security definer set search_path = '' as $$
  select l.member_id, l.sent_on
  from public.notification_log l
  where l.kind::text in ('debtor', 'cuotita') and l.devices > 0 and public.is_active_member();
$$;

-- -----------------------------------------------------------------------------
-- 3. PERMISOS
-- -----------------------------------------------------------------------------
alter table public.member_cards enable row level security;
alter table public.cuotitas enable row level security;
alter table public.cuotita_parts enable row level security;
alter table public.cuotita_installments enable row level security;

create policy "leer tarjetas" on public.member_cards for select to authenticated using (public.is_active_member() or member_id = auth.uid());
create policy "cargar mis tarjetas" on public.member_cards for insert to authenticated with check (member_id = auth.uid());
create policy "editar mis tarjetas" on public.member_cards for update to authenticated using (member_id = auth.uid()) with check (member_id = auth.uid());
create policy "borrar mis tarjetas" on public.member_cards for delete to authenticated using (member_id = auth.uid());

-- Todas las integrantes ven todas las cuotitas (como los gastos). Se escriben solo con las funciones.
create policy "leer cuotitas" on public.cuotitas for select to authenticated using (public.is_active_member());
create policy "leer partes de cuotitas" on public.cuotita_parts for select to authenticated using (public.is_active_member());
create policy "leer cuotas" on public.cuotita_installments for select to authenticated using (public.is_active_member());
revoke insert, update, delete, truncate on public.cuotitas, public.cuotita_parts, public.cuotita_installments from anon, authenticated;
revoke all on public.member_cards, public.cuotitas, public.cuotita_parts, public.cuotita_installments from anon;

do $$
declare f text;
begin
  foreach f in array array[
    'public.create_cuotita(text, text, bigint, int, date, uuid, uuid[], public.split_type, jsonb, uuid, text, text)',
    'public.update_cuotita(uuid, text, text, bigint, int, date, uuid, uuid[], public.split_type, jsonb, uuid, text, text, text)',
    'public.void_cuotita(uuid, text)',
    'public.set_installments_paid(uuid[], boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.cuotita_validate(text, uuid, bigint, int, uuid, uuid[], public.split_type, jsonb, text) from public, anon, authenticated;
revoke execute on function public.cuotita_fill(uuid, int, date, uuid) from public, anon, authenticated;

commit;

-- Fin de la migración 0016.
