-- Exportação (LGPD) inclui divisão/acertos, renda própria, mesada, comentários, reações e encontros do dinheiro.
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
    'split_rules', (select coalesce(jsonb_agg(to_jsonb(sr)), '[]'::jsonb) from public.split_rules sr),
    'split_overrides', (select coalesce(jsonb_agg(to_jsonb(so)), '[]'::jsonb) from public.split_overrides so),
    'settlements', (select coalesce(jsonb_agg(to_jsonb(st)), '[]'::jsonb) from public.settlements st),
    -- a RLS só deixa ler a própria renda: cada um exporta a sua, nunca a do par
    'my_income', (select coalesce(jsonb_agg(to_jsonb(mi)), '[]'::jsonb) from public.member_incomes mi),
    'member_allowances', (select coalesce(jsonb_agg(to_jsonb(ma)), '[]'::jsonb) from public.member_allowances ma),
    'tx_comments', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.tx_comments c),
    'tx_reactions', (select coalesce(jsonb_agg(to_jsonb(rx)), '[]'::jsonb) from public.tx_reactions rx),
    'money_dates', (select coalesce(jsonb_agg(to_jsonb(md)), '[]'::jsonb) from public.money_dates md),
    'saved_queries', (select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from public.saved_queries q),
    'settings', (select to_jsonb(hs) from public.household_settings hs limit 1)
  )
$$;
revoke all on function public.export_household_data() from public, anon;
grant execute on function public.export_household_data() to authenticated;
