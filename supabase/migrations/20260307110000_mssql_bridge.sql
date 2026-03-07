create table if not exists public.mssql_bridge_agents (
  agent_name text primary key,
  status text not null default 'online',
  version text,
  host text,
  meta jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mssql_bridge_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  requested_by text,
  agent_name text references public.mssql_bridge_agents(agent_name) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '2 minute')
);

create index if not exists mssql_bridge_requests_status_created_idx
  on public.mssql_bridge_requests(status, created_at);

create index if not exists mssql_bridge_requests_expires_idx
  on public.mssql_bridge_requests(expires_at);

create or replace function public.mssql_bridge_requeue_stale_requests()
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.mssql_bridge_requests
     set status = 'pending',
         agent_name = null,
         claimed_at = null
   where status = 'claimed'
     and claimed_at is not null
     and claimed_at < now() - interval '2 minute'
     and completed_at is null
     and expires_at > now();

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

create or replace function public.mssql_bridge_claim_request(p_agent_name text)
returns table (
  id uuid,
  request_type text,
  payload jsonb,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
as $$
  with next_request as (
    select r.id
      from public.mssql_bridge_requests r
     where r.status = 'pending'
       and r.expires_at > now()
     order by r.created_at asc
     for update skip locked
     limit 1
  )
  update public.mssql_bridge_requests r
     set status = 'claimed',
         agent_name = p_agent_name,
         claimed_at = now()
    from next_request nr
   where r.id = nr.id
  returning r.id, r.request_type, r.payload, r.created_at, r.expires_at;
$$;
