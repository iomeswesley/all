-- Divisão do "nosso" e acerto de contas do casal.
-- A conta (quanto cada um pagou × deveria, saldo, "quem deve a quem") é feita no app pelo core
-- (packages/core/src/split.ts); o banco guarda a regra, a renda (privada), as exceções e os acertos.
-- Gasto pessoal 🔒 nunca entra.

-- ───────────── quem lançou (manual): é quem pagou o Pix/dinheiro
alter table public.transactions
  add column created_by uuid references auth.users (id) on delete set null default auth.uid();

-- ───────────── regra do casal por mês (vale para o mês e os seguintes até mudar)
create table public.split_rules (
  household_id    uuid not null references public.households (id) on delete cascade,
  month           date not null check (extract(day from month) = 1),
  mode            text not null check (mode in ('equal', 'income', 'custom')),
  -- personalizado: custom_user_id arca com custom_pct % (o outro, com o resto)
  custom_user_id  uuid references auth.users (id) on delete set null,
  custom_pct      smallint check (custom_pct between 0 and 100),
  updated_by      uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at      timestamptz not null default now(),
  primary key (household_id, month),
  constraint split_rules_custom_pct check (mode <> 'custom' or custom_pct is not null)
);
alter table public.split_rules enable row level security;
create policy split_rules_all on public.split_rules for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- ───────────── renda de cada pessoa: só a própria pessoa lê e grava
create table public.member_incomes (
  household_id  uuid not null references public.households (id) on delete cascade,
  -- dado pessoal: some junto com a pessoa
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  income_cents  bigint not null check (income_cents >= 0 and income_cents <= 100000000000),
  updated_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
alter table public.member_incomes enable row level security;
create policy member_incomes_own on public.member_incomes for all to authenticated
  using (user_id = auth.uid() and public.is_member(household_id))
  with check (user_id = auth.uid() and public.is_member(household_id));

-- Quem sai do casal leva a renda informada junto.
create or replace function public.member_incomes_on_leave()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  delete from public.member_incomes where household_id = old.household_id and user_id = old.user_id;
  return old;
end;
$$;
create trigger members_drop_income after delete on public.members
  for each row execute function public.member_incomes_on_leave();

-- O par vê só a PROPORÇÃO (percentual inteiro), nunca o salário. Só sai percentual quando as duas
-- pessoas do casal informaram renda > 0; "informed" diz quem já informou.
-- Obs.: com duas pessoas, quem sabe a própria renda consegue estimar a do outro pela proporção;
-- o arredondamento para inteiro deixa só uma faixa. Isso é inerente à divisão proporcional.
create or replace function public.split_income_shares()
returns table (user_id uuid, informed boolean, share_pct integer)
language sql stable security definer
set search_path = public
as $$
  with h as (
    select m.household_id from public.members m where m.user_id = auth.uid()
  ),
  mem as (
    select m.user_id, coalesce(i.income_cents, 0) as cents
    from public.members m
    left join public.member_incomes i on i.household_id = m.household_id and i.user_id = m.user_id
    where m.household_id = (select household_id from h)
  ),
  ok as (
    select count(*) = 2 and bool_and(cents > 0) as ready, sum(cents)::bigint as total from mem
  ),
  ranked as (
    select mem.*, row_number() over (order by mem.user_id) as rn from mem
  ),
  first_pct as (
    -- divisão inteira (bigint) = arredonda meio para cima, igual a incomePct() do core
    select ((200 * r.cents + ok.total) / (2 * ok.total))::integer as pct
    from ranked r, ok where r.rn = 1 and ok.ready
  )
  select r.user_id,
         r.cents > 0,
         case when (select ready from ok) then
           case when r.rn = 1 then (select pct from first_pct) else 100 - (select pct from first_pct) end
         end
  from ranked r
$$;
revoke all on function public.split_income_shares() from public, anon;
grant execute on function public.split_income_shares() to authenticated;

-- ───────────── exceção por lançamento ("100% meu", 70/30, "quem pagou")
create table public.split_overrides (
  transaction_id   uuid primary key references public.transactions (id) on delete cascade,
  household_id     uuid not null references public.households (id) on delete cascade,
  -- share_user_id arca com share_pct % (o outro, com o resto); null = segue a regra do casal
  share_user_id    uuid references auth.users (id) on delete set null,
  share_pct        smallint check (share_pct between 0 and 100),
  -- "quem pagou" informado à mão; null = automático
  paid_by_user_id  uuid references auth.users (id) on delete set null,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at       timestamptz not null default now()
);
create index split_overrides_household on public.split_overrides (household_id);
alter table public.split_overrides enable row level security;
-- Só dá para marcar lançamento que a própria pessoa enxerga (o subselect respeita a RLS de lançamentos:
-- o gasto pessoal do par conta como "não existe") e que é do mesmo casal.
create policy split_overrides_all on public.split_overrides for all to authenticated
  using (public.is_member(household_id))
  with check (
    public.is_member(household_id)
    and exists (select 1 from public.transactions t where t.id = transaction_id and t.household_id = split_overrides.household_id)
  );

-- ───────────── acertos registrados (Pix feito fora do app)
create table public.settlements (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  from_user_id  uuid references auth.users (id) on delete set null,
  to_user_id    uuid references auth.users (id) on delete set null,
  amount_cents  bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  settled_on    date not null default current_date,
  note          text check (note is null or char_length(note) <= 120),
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint settlements_distinct check (from_user_id <> to_user_id)
);
create index settlements_household on public.settlements (household_id, settled_on desc);
alter table public.settlements enable row level security;
create policy settlements_select on public.settlements for select to authenticated using (public.is_member(household_id));
create policy settlements_insert on public.settlements for insert to authenticated
  with check (
    public.is_member(household_id) and created_by = auth.uid()
    and exists (select 1 from public.members m where m.household_id = settlements.household_id and m.user_id = from_user_id)
    and exists (select 1 from public.members m where m.household_id = settlements.household_id and m.user_id = to_user_id)
  );
-- Desfazer um acerto lançado por engano: só quem registrou.
create policy settlements_delete on public.settlements for delete to authenticated
  using (public.is_member(household_id) and created_by = auth.uid());

-- ───────────── lançamentos que entram no acerto, com "quem pagou" já resolvido
-- quem pagou = exceção → dono do cartão (account_cards.holder_user_id) → quem lançou (manual sem fatura)
--            → quem importou a fatura. SECURITY INVOKER: a RLS vale (gasto pessoal do par não aparece)
-- e o filtro abaixo tira qualquer gasto pessoal. Devolve um único jsonb (sem o limite de 1000 linhas).
create or replace function public.split_entries()
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'month', x.month, 'posted_on', x.posted_on, 'description', x.description_clean,
           'amount_cents', x.amount_cents, 'owner_user_id', x.owner_user_id, 'payer_user_id', x.payer,
           'share_user_id', x.share_user_id, 'share_pct', x.share_pct, 'paid_by_user_id', x.paid_by_user_id
         ) order by x.posted_on, x.id), '[]'::jsonb)
  from (
    select t.id, t.posted_on, t.description_clean, t.amount_cents, t.owner_user_id,
           coalesce(to_char(s.due_date, 'YYYY-MM'), to_char(t.posted_on, 'YYYY-MM')) as month,
           coalesce(o.paid_by_user_id, c.holder_user_id, case when t.statement_id is null then t.created_by end, s.created_by) as payer,
           o.share_user_id, o.share_pct, o.paid_by_user_id
    from public.transactions t
    left join public.statements s on s.id = t.statement_id
    left join public.account_cards c on c.account_id = t.account_id and c.last4 = t.card_last4
    left join public.split_overrides o on o.transaction_id = t.id
    where (t.statement_id is null or s.status = 'confirmed')
      and not t.is_private
      and t.kind <> 'pagamento'
      and t.amount_cents <> 0
  ) x
  -- com dono: só interessa se o outro pagou (sem pagador conhecido, presume-se o próprio dono)
  where x.owner_user_id is null or x.share_pct is not null or (x.payer is not null and x.payer <> x.owner_user_id)
$$;
revoke all on function public.split_entries() from public, anon;
grant execute on function public.split_entries() to authenticated;
