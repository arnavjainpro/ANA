-- Ana pgvector schema for repo indexing and RAG retrieval.
-- Run this once against your Supabase Postgres instance.

create extension if not exists vector;

-- One row per indexed repository.
create table if not exists repos (
  id            uuid primary key default gen_random_uuid(),
  github_id     bigint not null,
  full_name     text not null,
  default_branch text not null default 'main',
  head_sha      text,
  size_kb       integer not null default 0,
  indexed_at    timestamptz,
  architecture_summary text,
  created_at    timestamptz not null default now(),
  unique (github_id)
);

-- Idempotent add for databases created before architecture_summary existed.
alter table repos add column if not exists architecture_summary text;

-- One row per embedded chunk. text-embedding-3-small is 1536-dim.
create table if not exists chunks (
  id          uuid primary key default gen_random_uuid(),
  repo_id     uuid not null references repos (id) on delete cascade,
  file_path   text not null,
  chunk_index integer not null,
  content     text not null,
  embedding   vector(1536) not null,
  created_at  timestamptz not null default now()
);

create index if not exists chunks_repo_idx on chunks (repo_id);

-- Approximate nearest-neighbour index for cosine similarity search.
create index if not exists chunks_embedding_idx
  on chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Cosine-similarity retrieval scoped to a single repo. Returns top-k chunks.
create or replace function match_chunks (
  p_repo_id     uuid,
  query_embedding vector(1536),
  match_count   int
)
returns table (
  file_path  text,
  content    text,
  similarity float
)
language sql stable
as $$
  select
    c.file_path,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where c.repo_id = p_repo_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
