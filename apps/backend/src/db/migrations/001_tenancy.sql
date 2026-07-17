-- Migration 001: tenant scoping + usage metering.
-- Apply to databases created from the pre-tenancy schema.sql.

alter table repos add column if not exists owner_id text not null default '';
alter table repos drop constraint if exists repos_github_id_key;
create unique index if not exists repos_github_owner_key on repos (github_id, owner_id);
create index if not exists repos_owner_idx on repos (owner_id);

create table if not exists usage_events (
  id         uuid primary key default gen_random_uuid(),
  owner_id   text not null,
  kind       text not null,
  quantity   numeric not null,
  meta       jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_owner_idx on usage_events (owner_id, created_at);
