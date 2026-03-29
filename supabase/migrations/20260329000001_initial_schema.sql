-- TrustedClaw Phase 1 — Full Schema
-- ===================================

-- Enable required extensions
create extension if not exists "uuid-ossp" schema extensions;
create extension if not exists "pg_trgm";
create extension if not exists "pg_cron";
create extension if not exists "pg_net";

-- ===================================
-- TABLES
-- ===================================

-- Gates (source interfaces)
create table public.gates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('simulator', 'whatsapp', 'telegram', 'slack', 'email', 'webhook', 'generic')),
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'error', 'reconnecting')),
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

-- Channels within gates
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  gate_id uuid not null references public.gates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_channel_id text,
  display_name text not null,
  last_activity_at timestamptz default now(),
  created_at timestamptz not null default now()
);

-- Threads within channels
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.channels(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text,
  started_at timestamptz not null default now(),
  last_event_at timestamptz default now()
);

-- Events (core — append-only for raw_payload)
create table public.events (
  id uuid primary key default gen_random_uuid(),
  gate_id uuid references public.gates(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,
  thread_id uuid references public.threads(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  raw_payload jsonb not null,
  normalized_payload jsonb,
  enrichment_data jsonb,
  processing_status text not null default 'pending' check (processing_status in (
    'pending', 'processing', 'normalized', 'enriched', 'classified', 'completed',
    'normalization_failed', 'enrichment_failed', 'classification_failed',
    'triage_pending', 'stuck', 'permanent_failure', 'needs_review'
  )),
  processing_started_at timestamptz,
  retry_count int not null default 0,
  created_at timestamptz not null default now()
);

-- Entities (real-world objects)
create table public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('person', 'company', 'group', 'project', 'invoice', 'bank_account', 'contract', 'product', 'other', 'unknown')),
  canonical_name text not null,
  aliases text[] default '{}',
  gate_identifiers jsonb default '{}',
  auto_created boolean not null default false,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

-- Event-Entity links
create table public.event_entities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  role text not null default 'mentioned' check (role in ('sender', 'recipient', 'mentioned', 'subject')),
  confidence_score numeric(3,2) not null default 1.0
);

-- Classifications
create table public.classifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  urgency text not null check (urgency in ('immediate', 'soon', 'normal', 'low')),
  importance_score numeric(5,2) not null default 0,
  reasoning text,
  confidence numeric(3,2) default 1.0,
  classified_by text not null default 'agent' check (classified_by in ('agent', 'user')),
  created_at timestamptz not null default now()
);

-- Triage decisions
create table public.triage_decisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null check (decision in ('autonomous_resolve', 'escalate', 'snooze', 'discard')),
  reasoning text,
  status text not null default 'open' check (status in ('open', 'resolved', 'snoozed', 'dismissed', 'timeout_expired')),
  snoozed_until timestamptz,
  reminded boolean not null default false,
  resolved_by text check (resolved_by in ('agent', 'user', 'timeout', null)),
  resolve_reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Agent actions (proposals)
create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  triage_decision_id uuid references public.triage_decisions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  proposal_payload jsonb not null default '{}',
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'executed', 'failed', 'timeout_expired')),
  created_at timestamptz not null default now()
);

-- Policies (versioned)
create table public.policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version int not null default 1,
  rules jsonb not null default '[]',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Policy decisions
create table public.policy_decisions (
  id uuid primary key default gen_random_uuid(),
  agent_action_id uuid not null references public.agent_actions(id) on delete cascade,
  policy_version int not null,
  decision text not null check (decision in ('approve', 'reject', 'require_human')),
  matched_rule_id text,
  reasoning text,
  evaluated_at timestamptz not null default now()
);

-- Executions
create table public.executions (
  id uuid primary key default gen_random_uuid(),
  agent_action_id uuid not null references public.agent_actions(id) on delete cascade,
  gate_id uuid references public.gates(id) on delete set null,
  status text not null check (status in ('success', 'failure', 'partial')),
  response_payload jsonb,
  error_details text,
  executed_at timestamptz not null default now()
);

-- Heartbeat logs
create table public.heartbeat_logs (
  id uuid primary key default gen_random_uuid(),
  run_id text unique not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  triggered_by text not null check (triggered_by in ('pg_cron', 'vercel_cron', 'manual')),
  run_at timestamptz not null default now(),
  duration_ms int,
  events_checked int not null default 0,
  events_requeued int not null default 0,
  events_stuck int not null default 0,
  escalations_reminded int not null default 0,
  status text not null default 'success' check (status in ('success', 'partial_failure', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

-- Audit logs (append-only)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor text not null check (actor in ('agent', 'user', 'heartbeat', 'policy_engine', 'system')),
  action_type text not null,
  target_type text not null,
  target_id uuid,
  reasoning text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

-- Simulator scenarios
create table public.simulator_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  gate_type text not null default 'generic',
  sender_name text,
  channel_name text,
  content_template text not null,
  created_at timestamptz not null default now()
);

-- ===================================
-- INDEXES
-- ===================================

create index idx_events_user_status on public.events(user_id, processing_status, received_at);
create index idx_events_user_date on public.events(user_id, occurred_at desc);
create index idx_events_processing on public.events(processing_status, received_at) where processing_status not in ('completed');
create index idx_triage_user_status on public.triage_decisions(user_id, status);
create index idx_triage_open on public.triage_decisions(user_id, status, created_at) where status = 'open';
create index idx_heartbeat_user_date on public.heartbeat_logs(user_id, run_at desc);
create index idx_audit_user_date on public.audit_logs(user_id, created_at desc);
create index idx_audit_target on public.audit_logs(target_id, action_type);
create index idx_entities_user_name on public.entities(user_id, canonical_name);
create index idx_entities_search on public.entities using gin(canonical_name gin_trgm_ops);
create index idx_event_entities_event on public.event_entities(event_id);
create index idx_event_entities_entity on public.event_entities(entity_id);
create index idx_classifications_event on public.classifications(event_id);

-- ===================================
-- ROW LEVEL SECURITY
-- ===================================

alter table public.gates enable row level security;
alter table public.channels enable row level security;
alter table public.threads enable row level security;
alter table public.events enable row level security;
alter table public.entities enable row level security;
alter table public.event_entities enable row level security;
alter table public.classifications enable row level security;
alter table public.triage_decisions enable row level security;
alter table public.agent_actions enable row level security;
alter table public.policies enable row level security;
alter table public.policy_decisions enable row level security;
alter table public.executions enable row level security;
alter table public.heartbeat_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.simulator_scenarios enable row level security;

-- Standard RLS: user sees own data
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'gates', 'channels', 'threads', 'events', 'entities',
    'classifications', 'triage_decisions', 'agent_actions',
    'policies', 'heartbeat_logs', 'simulator_scenarios'
  ]) loop
    execute format('create policy "Users can view own %1$s" on public.%1$s for select using (auth.uid() = user_id)', t);
    execute format('create policy "Users can insert own %1$s" on public.%1$s for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "Users can update own %1$s" on public.%1$s for update using (auth.uid() = user_id)', t);
  end loop;
end
$$;

-- event_entities: accessible if user owns the event
create policy "Users can view own event_entities" on public.event_entities
  for select using (exists (select 1 from public.events e where e.id = event_id and e.user_id = auth.uid()));
create policy "Users can insert own event_entities" on public.event_entities
  for insert with check (exists (select 1 from public.events e where e.id = event_id and e.user_id = auth.uid()));

-- policy_decisions: accessible if user owns the agent_action
create policy "Users can view own policy_decisions" on public.policy_decisions
  for select using (exists (select 1 from public.agent_actions a where a.id = agent_action_id and a.user_id = auth.uid()));
create policy "Users can insert own policy_decisions" on public.policy_decisions
  for insert with check (exists (select 1 from public.agent_actions a where a.id = agent_action_id and a.user_id = auth.uid()));

-- executions: accessible if user owns the agent_action
create policy "Users can view own executions" on public.executions
  for select using (exists (select 1 from public.agent_actions a where a.id = agent_action_id and a.user_id = auth.uid()));
create policy "Users can insert own executions" on public.executions
  for insert with check (exists (select 1 from public.agent_actions a where a.id = agent_action_id and a.user_id = auth.uid()));

-- audit_logs: INSERT only, no UPDATE/DELETE
create policy "Users can view own audit_logs" on public.audit_logs
  for select using (auth.uid() = user_id);
create policy "Users can insert own audit_logs" on public.audit_logs
  for insert with check (auth.uid() = user_id);
-- NO update or delete policy — enforced at DB level

-- Service role policies for server-side operations
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'gates', 'channels', 'threads', 'events', 'entities', 'event_entities',
    'classifications', 'triage_decisions', 'agent_actions',
    'policies', 'policy_decisions', 'executions',
    'heartbeat_logs', 'audit_logs', 'simulator_scenarios'
  ]) loop
    execute format('create policy "Service role full access on %1$s" on public.%1$s for all using (auth.jwt() ->> ''role'' = ''service_role'')', t);
  end loop;
end
$$;

-- ===================================
-- REALTIME
-- ===================================

alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.triage_decisions;
alter publication supabase_realtime add table public.heartbeat_logs;

-- ===================================
-- PROTECT AUDIT LOGS FROM MODIFICATION
-- ===================================

create or replace function public.prevent_audit_log_modification()
returns trigger as $$
begin
  raise exception 'audit_logs table is append-only. UPDATE and DELETE are not permitted.';
end;
$$ language plpgsql;

create trigger prevent_audit_update
  before update on public.audit_logs
  for each row execute function public.prevent_audit_log_modification();

create trigger prevent_audit_delete
  before delete on public.audit_logs
  for each row execute function public.prevent_audit_log_modification();
