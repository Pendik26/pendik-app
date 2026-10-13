-- The curriculum: the blocks of the course (1.1, 1.2, …). Questions, packages, readiness and the
-- study catalog point at a real block instead of a loose string. Blocks are added by the content
-- catalog (`npm run db:content`) and by question imports; a block that is in use can't be removed.

create table app.blocks (
  id         text primary key check (id ~ '^[0-9]+\.[0-9]+$'),
  name       text check (length(name) <= 120),
  created_at timestamptz not null default now()
);

alter table app.blocks enable row level security;
create policy blocks_read on app.blocks for select to authenticated using (true);
grant select on app.blocks to authenticated;
grant select, insert, update on app.blocks to service_role;

-- Makes sure a block exists (imports and the catalog use it before pointing at one).
create function app.ensure_block(p_block text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_block is null then return null; end if;
  if p_block !~ '^[0-9]+\.[0-9]+$' then raise exception 'bad_block'; end if;
  insert into app.blocks (id) values (p_block) on conflict do nothing;
  return p_block;
end;
$$;

create view public.blocks
with (security_invoker = on) as
select id, name from app.blocks;

revoke all on public.blocks from public, anon, authenticated;
grant select on public.blocks to authenticated;
