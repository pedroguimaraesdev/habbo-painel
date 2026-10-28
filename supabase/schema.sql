-- Execute uma vez no SQL Editor do seu projeto Supabase.
create table public.bank_ledgers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  constraint ledger_shape check (
    jsonb_typeof(data) = 'object'
    and data ?& array['version', 'mobis', 'transactions']
    and data @> '{"version":1}'::jsonb
    and jsonb_typeof(data->'mobis') = 'array'
    and jsonb_typeof(data->'transactions') = 'array'
  )
);
alter table public.bank_ledgers enable row level security;
revoke all on public.bank_ledgers from anon;
grant select, insert, update on public.bank_ledgers to authenticated;
create policy "Read own bank" on public.bank_ledgers for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own bank" on public.bank_ledgers for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own bank" on public.bank_ledgers for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
