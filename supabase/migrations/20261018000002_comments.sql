-- Comentários e reações em lançamentos ("o que foi isso?" / 👍).
-- Visibilidade: a MESMA dos lançamentos. Quem não enxerga o lançamento (gasto pessoal 🔒 do par)
-- não vê nem cria comentários/reações nele — as políticas consultam public.transactions com a RLS
-- de quem pergunta, então o que a RLS de transactions esconde conta como "não existe".

-- ───────────── comentários
create table public.tx_comments (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  transaction_id  uuid not null references public.transactions (id) on delete cascade,
  author          uuid references auth.users (id) on delete set null default auth.uid(),
  body            text not null check (char_length(body) <= 500 and char_length(btrim(body)) >= 1),
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  -- aviso ao par já enviado (a função notify avisa uma vez só por comentário)
  notified_at     timestamptz
);
create index tx_comments_tx on public.tx_comments (transaction_id, created_at);
create index tx_comments_household on public.tx_comments (household_id, created_at desc);

-- ───────────── reações (lista fechada; uma por pessoa por lançamento — trocar = atualizar)
create table public.tx_reactions (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  transaction_id  uuid not null references public.transactions (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete set null default auth.uid(),
  emoji           text not null check (emoji in ('👍', '❤️', '😬', '🤔', '✅')),
  created_at      timestamptz not null default now(),
  constraint tx_reactions_one_per_person unique (transaction_id, user_id)
);
create index tx_reactions_household on public.tx_reactions (household_id);

-- O lançamento é visível a quem pergunta e é do mesmo casal (RLS de transactions vale aqui dentro).
create or replace function public.tx_visible(p_tx uuid, p_household uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select exists (select 1 from public.transactions t where t.id = p_tx and t.household_id = p_household)
$$;
revoke all on function public.tx_visible(uuid, uuid) from public, anon;
grant execute on function public.tx_visible(uuid, uuid) to authenticated;

-- Casal, lançamento, autor e data não mudam; editar o texto marca edited_at; o aviso não "desacontece".
create or replace function public.tx_comments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.household_id <> old.household_id or new.transaction_id <> old.transaction_id or new.created_at <> old.created_at
     or (new.author is distinct from old.author and new.author is not null) then
    raise exception 'comentário: só o texto pode mudar';
  end if;
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  if old.notified_at is not null then new.notified_at := old.notified_at; end if;
  return new;
end
$$;
create trigger tx_comments_guard before update on public.tx_comments
  for each row execute function public.tx_comments_guard();

create or replace function public.tx_reactions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.household_id <> old.household_id or new.transaction_id <> old.transaction_id
     or (new.user_id is distinct from old.user_id and new.user_id is not null) then
    raise exception 'reação: só o emoji pode mudar';
  end if;
  return new;
end
$$;
create trigger tx_reactions_guard before update on public.tx_reactions
  for each row execute function public.tx_reactions_guard();

-- ───────────── RLS
alter table public.tx_comments enable row level security;
alter table public.tx_reactions enable row level security;
revoke all on public.tx_comments, public.tx_reactions from anon;

create policy tx_comments_select on public.tx_comments for select to authenticated
  using (public.is_member(household_id) and public.tx_visible(transaction_id, household_id));
create policy tx_comments_insert on public.tx_comments for insert to authenticated
  with check (author = auth.uid() and public.is_member(household_id) and public.tx_visible(transaction_id, household_id));
create policy tx_comments_update on public.tx_comments for update to authenticated
  using (author = auth.uid() and public.is_member(household_id) and public.tx_visible(transaction_id, household_id))
  with check (author = auth.uid() and public.is_member(household_id) and public.tx_visible(transaction_id, household_id));
create policy tx_comments_delete on public.tx_comments for delete to authenticated
  using (author = auth.uid() and public.is_member(household_id));

create policy tx_reactions_select on public.tx_reactions for select to authenticated
  using (public.is_member(household_id) and public.tx_visible(transaction_id, household_id));
create policy tx_reactions_insert on public.tx_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(household_id) and public.tx_visible(transaction_id, household_id));
create policy tx_reactions_update on public.tx_reactions for update to authenticated
  using (user_id = auth.uid() and public.is_member(household_id) and public.tx_visible(transaction_id, household_id))
  with check (user_id = auth.uid() and public.is_member(household_id) and public.tx_visible(transaction_id, household_id));
create policy tx_reactions_delete on public.tx_reactions for delete to authenticated
  using (user_id = auth.uid() and public.is_member(household_id));
