-- Fase 2: gasto pessoal, push e alertas de orçamento.

-- Gasto pessoal precisa ter dono (só o dono vê os itens).
alter table public.transactions
  add constraint transactions_private_has_owner check (not is_private or owner_user_id is not null);

-- Tokens de push do Expo (um por aparelho). Membros do casal leem os do casal (para avisar o par).
create table public.push_tokens (
  user_id       uuid not null references auth.users (id) on delete cascade,
  household_id  uuid not null references public.households (id) on delete cascade,
  token         text not null check (token like 'ExponentPushToken[%' or token like 'ExpoPushToken[%'),
  platform      text,
  updated_at    timestamptz not null default now(),
  primary key (user_id, token)
);
alter table public.push_tokens enable row level security;
create policy push_tokens_select on public.push_tokens for select to authenticated using (public.is_member(household_id));
create policy push_tokens_write on public.push_tokens for all to authenticated
  using (user_id = auth.uid() and public.is_member(household_id))
  with check (user_id = auth.uid() and public.is_member(household_id));

-- Alertas de orçamento já enviados (cada nível sai uma vez por categoria e mês).
create table public.budget_alerts (
  household_id  uuid not null references public.households (id) on delete cascade,
  category_id   smallint not null references public.categories (id),
  month         date not null check (extract(day from month) = 1),
  level         text not null check (level in ('warn80', 'over100')),
  sent_at       timestamptz not null default now(),
  primary key (household_id, category_id, month, level)
);
alter table public.budget_alerts enable row level security;
create policy budget_alerts_all on public.budget_alerts for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Totais do gasto pessoal DO PARCEIRO por mês e categoria (sem itens): é só isso que o par enxerga.
create or replace function public.partner_private_totals()
returns table (statement_month text, category_id smallint, owner_user_id uuid, total_cents bigint, n integer)
language sql stable security definer
set search_path = public
as $$
  select to_char(s.due_date, 'YYYY-MM'), t.category_id, t.owner_user_id, sum(t.amount_cents)::bigint, count(*)::int
  from public.transactions t
  join public.statements s on s.id = t.statement_id
  where s.status = 'confirmed'
    and t.is_private
    and t.kind <> 'pagamento'
    and t.owner_user_id <> auth.uid()
    and t.household_id = (select m.household_id from public.members m where m.user_id = auth.uid())
  group by 1, 2, 3
$$;

-- Somas dos lançamentos que o usuário não enxerga numa fatura (para a conferência fechar).
create or replace function public.statement_hidden_sums(p_statement_id uuid)
returns table (expenses_cents bigint, expenses_usd_cents bigint, future_cents bigint, remaining_installments bigint, n integer)
language sql stable security definer
set search_path = public
as $$
  select
    coalesce(sum(t.amount_cents) filter (where t.section <> 'pagamentos'), 0)::bigint,
    coalesce(sum(t.amount_usd_cents), 0)::bigint,
    coalesce(sum((t.installment_total - t.installment_n) * t.amount_cents) filter (where t.kind = 'parcela'), 0)::bigint,
    coalesce(sum(t.installment_total - t.installment_n) filter (where t.kind = 'parcela'), 0)::bigint,
    count(*)::int
  from public.transactions t
  where t.statement_id = p_statement_id
    and t.is_private
    and t.owner_user_id <> auth.uid()
    and public.is_member(t.household_id)
$$;

revoke all on function public.partner_private_totals() from public, anon;
revoke all on function public.statement_hidden_sums(uuid) from public, anon;
grant execute on function public.partner_private_totals() to authenticated;
grant execute on function public.statement_hidden_sums(uuid) to authenticated;
