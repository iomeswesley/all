-- Mesada pessoal 🔒 ("dinheiro livre"): cada pessoa tem um valor mensal para gastar sem dar satisfação.
-- O par vê só "usou X de Y" (via allowance_status), nunca os itens — que seguem protegidos pelo is_private.
--
-- Decisão: o valor é um ACORDO DO CASAL — qualquer um dos dois pode definir/alterar a mesada de qualquer
-- membro (fica registrado quem mudou e quando, em updated_by/updated_at). A liberdade está no uso, não no valor.
-- Conta como "usado" todo gasto pessoal (is_private) da pessoa no mês: fatura confirmada pelo mês do
-- vencimento (statement_month) e lançamento manual pelo mês do pagamento; estornos pessoais abatem.

create table public.member_allowances (
  household_id   uuid not null,
  user_id        uuid not null,
  monthly_cents  bigint not null check (monthly_cents >= 0 and monthly_cents <= 100000000),
  updated_by     uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at     timestamptz not null default now(),
  primary key (household_id, user_id),
  -- a mesada pertence ao vínculo com o casal: some quando a pessoa sai, é removida ou exclui a conta
  foreign key (household_id, user_id) references public.members (household_id, user_id) on delete cascade
);

alter table public.member_allowances enable row level security;
create policy member_allowances_all on public.member_allowances for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Quem mudou e quando são sempre gravados pelo banco (não dá para atribuir a mudança ao par).
create or replace function public.member_allowances_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- só quando o valor muda (o "set null" de quem excluiu a conta não é uma alteração da mesada)
  if tg_op = 'INSERT' or new.monthly_cents is distinct from old.monthly_cents then
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger member_allowances_stamp before insert or update on public.member_allowances
  for each row execute function public.member_allowances_stamp();

-- Por membro do casal de quem chama: limite (null = sem mesada) e quanto do gasto pessoal já saiu no mês.
-- SECURITY DEFINER para somar o gasto pessoal do par sem expor nenhuma linha dele; devolve só totais.
create or replace function public.allowance_status(p_month text default to_char(current_date, 'YYYY-MM'))
returns table (user_id uuid, display_name text, monthly_cents bigint, used_cents bigint, is_me boolean)
language sql stable security definer
set search_path = public
as $$
  with me as (
    select m.household_id from public.members m where m.user_id = auth.uid()
  )
  select
    mb.user_id,
    mb.display_name,
    a.monthly_cents,
    coalesce((
      select sum(t.amount_cents)
      from public.transactions t
      left join public.statements s on s.id = t.statement_id
      where t.household_id = mb.household_id
        and t.owner_user_id = mb.user_id
        and t.is_private
        and t.kind <> 'pagamento'
        and (t.statement_id is null or s.status = 'confirmed')
        and coalesce(to_char(s.due_date, 'YYYY-MM'), to_char(t.posted_on, 'YYYY-MM')) = p_month
    ), 0)::bigint,
    mb.user_id = auth.uid()
  from public.members mb
  join me on me.household_id = mb.household_id
  left join public.member_allowances a on a.household_id = mb.household_id and a.user_id = mb.user_id
  where p_month ~ '^\d{4}-(0[1-9]|1[0-2])$'
  order by (mb.user_id = auth.uid()) desc, mb.display_name
$$;

revoke all on function public.allowance_status(text) from public, anon;
grant execute on function public.allowance_status(text) to authenticated;
