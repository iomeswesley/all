-- "Encontro do dinheiro": o check-in mensal guiado que o casal faz junto.
-- Uma linha por casal e mês revisado, com os combinados (até 3 textos curtos) que reaparecem
-- no próximo encontro e as assinaturas marcadas para cancelar.

-- combinados: array de 0 a 3 textos de 1 a 80 caracteres
create function public.money_date_agreements_ok(a jsonb)
returns boolean
language sql immutable
set search_path = public
as $$
  select jsonb_typeof(a) = 'array'
    and jsonb_array_length(a) <= 3
    and not exists (
      select 1 from jsonb_array_elements(a) e
      where jsonb_typeof(e) <> 'string' or char_length(btrim(e #>> '{}')) not between 1 and 80
    )
$$;

-- assinaturas para cancelar: array de até 20 objetos {key, label, cents}
create function public.money_date_cancel_ok(a jsonb)
returns boolean
language sql immutable
set search_path = public
as $$
  select jsonb_typeof(a) = 'array'
    and jsonb_array_length(a) <= 20
    and not exists (
      select 1 from jsonb_array_elements(a) e
      where jsonb_typeof(e) <> 'object'
         or jsonb_typeof(e -> 'key') is distinct from 'string'
         or jsonb_typeof(e -> 'label') is distinct from 'string'
         or char_length(e ->> 'label') > 80
    )
$$;

create table public.money_dates (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  -- competência revisada (sempre dia 1)
  month          date not null check (extract(day from month) = 1),
  agreements     jsonb not null default '[]'::jsonb check (public.money_date_agreements_ok(agreements)),
  to_cancel      jsonb not null default '[]'::jsonb check (public.money_date_cancel_ok(to_cancel)),
  completed_at   timestamptz,
  completed_by   uuid references auth.users (id) on delete set null,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (household_id, month)
);
create index money_dates_household on public.money_dates (household_id, month desc);

alter table public.money_dates enable row level security;
create policy money_dates_all on public.money_dates for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
