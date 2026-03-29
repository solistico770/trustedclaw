-- TrustedClaw: Case-Centric Transformation
-- ==========================================

-- 1. NEW TABLE: cases
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  thread_id uuid references public.threads(id) on delete set null,

  title text,
  summary text,

  status text not null default 'open' check (status in (
    'open', 'action_needed', 'in_progress', 'addressed', 'scheduled', 'closed', 'escalated'
  )),

  importance_level int not null default 5 check (importance_level between 1 and 10),

  escalation_level text not null default 'none' check (escalation_level in (
    'none', 'low', 'medium', 'high', 'critical'
  )),

  current_severity text not null default 'medium' check (current_severity in ('critical', 'high', 'medium', 'low', 'info')),
  current_urgency text not null default 'normal' check (current_urgency in ('immediate', 'soon', 'normal', 'low')),

  opened_by text not null default 'system' check (opened_by in ('system', 'user', 'heartbeat')),
  event_count int not null default 0,
  first_event_at timestamptz,
  last_event_at timestamptz,
  next_action_date timestamptz,
  closed_at timestamptz,
  resolved_by text check (resolved_by in ('agent', 'user', 'heartbeat', null)),
  resolve_reason text,

  classification_reasoning text,
  escalation_reasoning text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. NEW TABLE: case_entities
create table public.case_entities (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  role text not null default 'related' check (role in ('primary', 'related', 'mentioned')),
  first_seen_at timestamptz not null default now(),
  unique (case_id, entity_id)
);

-- 3. NEW TABLE: case_history
create table public.case_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  changed_by text not null check (changed_by in ('agent', 'user', 'heartbeat', 'system')),
  field_changed text not null,
  old_value text,
  new_value text,
  reasoning text,
  created_at timestamptz not null default now()
);

-- 4. ALTER: events — add case_id
alter table public.events add column case_id uuid references public.cases(id) on delete set null;

-- 5. ALTER: classifications — add case_id
alter table public.classifications add column case_id uuid references public.cases(id) on delete cascade;

-- 6. ALTER: triage_decisions — add case_id
alter table public.triage_decisions add column case_id uuid references public.cases(id) on delete cascade;

-- 7. ALTER: heartbeat_logs — add case counters
alter table public.heartbeat_logs
  add column cases_checked int not null default 0,
  add column cases_escalated int not null default 0,
  add column cases_deescalated int not null default 0;

-- 8. INDEXES
create index idx_cases_user_status on public.cases(user_id, status) where status not in ('closed');
create index idx_cases_user_importance on public.cases(user_id, importance_level desc);
create index idx_cases_user_escalation on public.cases(user_id, escalation_level) where escalation_level != 'none';
create index idx_cases_last_activity on public.cases(user_id, last_event_at desc);
create index idx_cases_channel on public.cases(channel_id) where channel_id is not null;
create index idx_events_case on public.events(case_id) where case_id is not null;
create index idx_classifications_case on public.classifications(case_id) where case_id is not null;
create index idx_triage_case on public.triage_decisions(case_id) where case_id is not null;
create index idx_case_entities_case on public.case_entities(case_id);
create index idx_case_entities_entity on public.case_entities(entity_id);
create index idx_case_history_case on public.case_history(case_id, created_at desc);

-- 9. RLS
alter table public.cases enable row level security;
alter table public.case_entities enable row level security;
alter table public.case_history enable row level security;

-- cases: standard user-scoped
create policy "Users can view own cases" on public.cases for select using (auth.uid() = user_id);
create policy "Users can insert own cases" on public.cases for insert with check (auth.uid() = user_id);
create policy "Users can update own cases" on public.cases for update using (auth.uid() = user_id);

-- case_entities: accessible if user owns the case
create policy "Users can view own case_entities" on public.case_entities
  for select using (exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()));
create policy "Users can insert own case_entities" on public.case_entities
  for insert with check (exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()));

-- case_history: accessible if user owns the case
create policy "Users can view own case_history" on public.case_history
  for select using (exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()));
create policy "Users can insert own case_history" on public.case_history
  for insert with check (exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()));

-- service role full access
create policy "Service role full access on cases" on public.cases for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Service role full access on case_entities" on public.case_entities for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Service role full access on case_history" on public.case_history for all using (auth.jwt() ->> 'role' = 'service_role');

-- 10. REALTIME
alter publication supabase_realtime add table public.cases;

-- 11. AUTO-UPDATE updated_at on cases
create or replace function public.update_cases_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger cases_updated_at
  before update on public.cases
  for each row execute function public.update_cases_updated_at();
