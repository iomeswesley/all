-- Lançamentos manuais (Pix, dinheiro, débito, boleto…): entram no painel sem fatura.
-- Competência = mês do pagamento (a fatura do cartão usa o mês do vencimento).

-- Só lançamento manual pode existir sem fatura.
alter table public.transactions
  add constraint transactions_statement_required check (statement_id is not null or source = 'manual');

-- Conta "Pix e dinheiro" do casal (criada sob demanda, uma só).
create or replace function public.ensure_cash_account()
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select household_id into v_household from public.members where user_id = v_user;
  if v_household is null then raise exception 'no_household' using errcode = 'P0001'; end if;
  select id into v_id from public.accounts where household_id = v_household and institution = 'manual' and kind = 'checking' order by created_at limit 1;
  if v_id is null then
    insert into public.accounts (household_id, kind, institution, name) values (v_household, 'checking', 'manual', 'Pix e dinheiro') returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.ensure_cash_account() from public, anon;
grant execute on function public.ensure_cash_account() to authenticated;

-- A view do painel passa a incluir os manuais (mês do pagamento).
drop view public.v_transactions;
create view public.v_transactions with (security_invoker = true) as
select
  t.*,
  coalesce(to_char(s.due_date, 'YYYY-MM'), to_char(t.posted_on, 'YYYY-MM')) as statement_month,
  coalesce(s.due_date, t.posted_on)                                          as statement_due_date
from public.transactions t
left join public.statements s on s.id = t.statement_id
where t.statement_id is null or s.status = 'confirmed';
grant select on public.v_transactions to authenticated;

-- Gasto pessoal do par: também os manuais.
create or replace function public.partner_private_totals()
returns table (statement_month text, category_id smallint, owner_user_id uuid, total_cents bigint, n integer)
language sql stable security definer
set search_path = public
as $$
  select coalesce(to_char(s.due_date, 'YYYY-MM'), to_char(t.posted_on, 'YYYY-MM')), t.category_id, t.owner_user_id, sum(t.amount_cents)::bigint, count(*)::int
  from public.transactions t
  left join public.statements s on s.id = t.statement_id
  where (t.statement_id is null or s.status = 'confirmed')
    and t.is_private
    and t.kind <> 'pagamento'
    and t.owner_user_id <> auth.uid()
    and t.household_id = (select m.household_id from public.members m where m.user_id = auth.uid())
  group by 1, 2, 3
$$;
