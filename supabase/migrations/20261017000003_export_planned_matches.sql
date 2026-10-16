-- Exportação (LGPD) passa a incluir as baixas de gastos planejados ("Já aconteceu?").
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
    'planned_matches', (select coalesce(jsonb_agg(to_jsonb(pm)), '[]'::jsonb) from public.planned_matches pm),
    'saved_queries', (select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from public.saved_queries q),
    'settings', (select to_jsonb(hs) from public.household_settings hs limit 1)
  )
$$;
revoke all on function public.export_household_data() from public, anon;
grant execute on function public.export_household_data() to authenticated;
