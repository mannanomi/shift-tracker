-- Run this once in Supabase → SQL Editor. Each row belongs to one user; RLS enforces it.
-- Documents are stored as JSON so the app's types can evolve without migrations.
create table if not exists public.records (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('job','shift','holiday','settings')),
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false,
  primary key (user_id, kind, id)
);

alter table public.records enable row level security;

create policy "own rows: select" on public.records for select using (auth.uid() = user_id);
create policy "own rows: insert" on public.records for insert with check (auth.uid() = user_id);
create policy "own rows: update" on public.records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows: delete" on public.records for delete using (auth.uid() = user_id);

-- Server-side timestamps so devices can ask "what changed since I last synced?" without clock skew.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_updated_at();

create index if not exists records_cursor on public.records (user_id, updated_at);
