-- "Já aconteceu?": baixa de uma ocorrência de gasto planejado.
-- 'feito'    = aconteceu (com o lançamento que corresponde, ou marcado à mão sem lançamento);
-- 'ignorado' = com transaction_id: "não é este lançamento"; sem transaction_id: não perguntar mais.

create table public.planned_matches (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  planned_id       uuid not null references public.planned_expenses (id) on delete cascade,
  occurrence_date  date not null,
  -- o lançamento some (fatura reimportada/apagada): a baixa continua valendo, sem o vínculo
  transaction_id   uuid references public.transactions (id) on delete set null,
  status           text not null check (status in ('feito', 'ignorado')),
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now()
);
create index planned_matches_household on public.planned_matches (household_id, planned_id, occurrence_date);
-- uma baixa "feito" por ocorrência
create unique index planned_matches_one_done on public.planned_matches (planned_id, occurrence_date) where status = 'feito';
-- um lançamento dá baixa em uma ocorrência só
create unique index planned_matches_tx_once on public.planned_matches (transaction_id) where status = 'feito' and transaction_id is not null;
-- sem repetir o mesmo par recusado / a mesma dispensa
create unique index planned_matches_no_dup on public.planned_matches (planned_id, occurrence_date, coalesce(transaction_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'ignorado';

-- O planejado e o lançamento precisam ser do mesmo casal da baixa.
-- Roda com os direitos de quem grava: o que a RLS esconde conta como "não existe".
create or replace function public.planned_matches_check()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- lançamento apagado (on delete set null): nada a conferir
  if tg_op = 'UPDATE' and new.household_id = old.household_id and new.planned_id = old.planned_id and new.transaction_id is null then
    return new;
  end if;
  if not exists (select 1 from public.planned_expenses p where p.id = new.planned_id and p.household_id = new.household_id) then
    raise exception 'gasto planejado não pertence ao casal';
  end if;
  if new.transaction_id is not null
     and not exists (select 1 from public.transactions t where t.id = new.transaction_id and t.household_id = new.household_id) then
    raise exception 'lançamento não pertence ao casal';
  end if;
  return new;
end
$$;
create trigger planned_matches_check before insert or update of household_id, planned_id, transaction_id on public.planned_matches
  for each row execute function public.planned_matches_check();

alter table public.planned_matches enable row level security;
create policy planned_matches_all on public.planned_matches for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
