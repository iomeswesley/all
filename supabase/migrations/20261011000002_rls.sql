-- Segurança: Row Level Security por casal (household).
-- Regra geral: só quem é membro do casal enxerga/altera as linhas do casal.

-- ─────────────────────────── funções auxiliares ───────────────────────────
create or replace function public.is_member(h uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.household_id = h and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_owner(h uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.household_id = h and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- Primeiro segmento do caminho no Storage ("{household_id}/arquivo.pdf") como uuid, ou null.
create or replace function public.path_household(p text)
returns uuid
language plpgsql immutable
as $$
begin
  return split_part(p, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

-- ─────────────────────────── liga RLS em tudo ───────────────────────────
alter table public.households    enable row level security;
alter table public.members       enable row level security;
alter table public.invites       enable row level security;
alter table public.accounts      enable row level security;
alter table public.account_cards enable row level security;
alter table public.statements    enable row level security;
alter table public.categories    enable row level security;
alter table public.merchants     enable row level security;
alter table public.rules         enable row level security;
alter table public.transactions  enable row level security;
alter table public.budgets       enable row level security;
alter table public.goals         enable row level security;

-- ─────────────────────────── políticas ───────────────────────────
-- Casal e membros: leitura para membros; criação/entrada só por funções (security definer).
create policy households_select on public.households for select to authenticated using (public.is_member(id));
create policy households_update on public.households for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));

create policy members_select on public.members for select to authenticated using (public.is_member(household_id));
create policy members_update_self on public.members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and role = (select m.role from public.members m where m.household_id = members.household_id and m.user_id = auth.uid()));

create policy invites_select on public.invites for select to authenticated using (public.is_owner(household_id));
create policy invites_delete on public.invites for delete to authenticated using (public.is_owner(household_id));

-- Tabelas do casal: tudo para membros.
create policy accounts_all on public.accounts for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy account_cards_all on public.account_cards for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy statements_all on public.statements for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy rules_all on public.rules for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy budgets_all on public.budgets for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy goals_all on public.goals for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Lançamentos: lançamento privado de outra pessoa não aparece (modo "gasto pessoal").
create policy transactions_all on public.transactions for all to authenticated
  using (public.is_member(household_id) and (not is_private or owner_user_id = auth.uid()))
  with check (public.is_member(household_id));

-- Categorias: leitura para qualquer usuário logado.
create policy categories_select on public.categories for select to authenticated using (true);

-- Dicionário: global (household_id null) é só leitura; o do casal é do casal.
create policy merchants_select on public.merchants for select to authenticated
  using (household_id is null or public.is_member(household_id));
create policy merchants_insert on public.merchants for insert to authenticated
  with check (household_id is not null and public.is_member(household_id));
create policy merchants_update on public.merchants for update to authenticated
  using (household_id is not null and public.is_member(household_id))
  with check (household_id is not null and public.is_member(household_id));
create policy merchants_delete on public.merchants for delete to authenticated
  using (household_id is not null and public.is_member(household_id));

-- ─────────────────────────── Storage (PDFs em bucket privado) ───────────────────────────
insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do update set public = false;

create policy statements_files_select on storage.objects for select to authenticated
  using (bucket_id = 'statements' and public.is_member(public.path_household(name)));
create policy statements_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'statements' and public.is_member(public.path_household(name)));
create policy statements_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'statements' and public.is_member(public.path_household(name)));

-- ─────────────────────────── view para o dashboard ───────────────────────────
-- Lançamentos de faturas confirmadas + competência (mês do vencimento).
-- security_invoker: respeita a RLS de quem consulta.
create view public.v_transactions with (security_invoker = true) as
select
  t.*,
  to_char(s.due_date, 'YYYY-MM') as statement_month,
  s.due_date                     as statement_due_date
from public.transactions t
join public.statements s on s.id = t.statement_id
where s.status = 'confirmed';
