-- Gastos planejados: o que o casal já sabe que vai gastar numa data (uma vez, todo mês ou todo ano).
-- Entram na previsão dos próximos meses (média do histórico + planejados do mês).

create table public.planned_expenses (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  description   text not null check (char_length(btrim(description)) between 1 and 80),
  amount_cents  bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  first_date    date not null,
  repeat        text not null default 'once' check (repeat in ('once', 'monthly', 'yearly')),
  -- null = sem fim; "uma vez" é sempre 1
  occurrences   int check (occurrences is null or occurrences between 1 and 120),
  category_id   smallint references public.categories (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint planned_once_is_single check (repeat <> 'once' or occurrences is null or occurrences = 1)
);
create index planned_expenses_household on public.planned_expenses (household_id, first_date);

alter table public.planned_expenses enable row level security;
create policy planned_expenses_all on public.planned_expenses for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Exportação (LGPD) passa a incluir os planejados.
create or replace function public.export_household_data()
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'note', 'Apenas os dados que você pode ver; gastos pessoais do seu par não estão incluídos.',
    'household', (select to_jsonb(h) from public.households h limit 1),
    'members', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.members m),
    'accounts', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.accounts a),
    'account_cards', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.account_cards c),
    'statements', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.statements s),
    'transactions', (select coalesce(jsonb_agg(to_jsonb(t) - 'dedupe_hash'), '[]'::jsonb) from public.transactions t),
    'rules', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.rules r),
    'budgets', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from public.budgets b),
    'goals', (select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from public.goals g),
    'planned_expenses', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.planned_expenses p),
    'saved_queries', (select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from public.saved_queries q),
    'settings', (select to_jsonb(hs) from public.household_settings hs limit 1)
  )
$$;
revoke all on function public.export_household_data() from public, anon;
grant execute on function public.export_household_data() to authenticated;
