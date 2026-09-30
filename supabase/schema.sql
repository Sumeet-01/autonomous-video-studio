-- LUMEN Studio — Supabase (Postgres) schema
-- Run in the Supabase SQL editor. Mirrors the local SQLite tables so
-- projects/jobs/learning can later move to Supabase without redesign.
-- Auth uses Supabase Auth; row-level security is permissive by default
-- (tighten policies before exposing user data).

create table if not exists projects (
  id text primary key,
  name text not null,
  description text,
  status text not null default 'draft',
  settings jsonb not null default '{}',
  reference_analysis_id text,
  learning_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists scenes (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  index_num integer not null,
  name text not null,
  description text,
  prompt text not null,
  negative_prompt text,
  duration double precision not null,
  status text not null default 'queued',
  approved_attempt_id text,
  audio jsonb,
  continuity_constraints jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, index_num)
);

create table if not exists assets (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  type text not null,
  filename text not null,
  mime_type text not null,
  size bigint not null,
  path text not null,
  url text,
  metadata jsonb not null default '{}',
  thumbnail_path text,
  created_at timestamptz not null default now()
);

create table if not exists generation_attempts (
  id text primary key,
  scene_id text not null references scenes(id) on delete cascade,
  attempt_number integer not null,
  prompt text not null,
  negative_prompt text,
  parameters jsonb not null default '{}',
  provider text not null,
  model text not null,
  status text not null default 'queued',
  input_assets jsonb not null default '[]',
  output_asset_id text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  generation_time bigint,
  qa_report jsonb,
  mutation_summary text,
  unique(scene_id, attempt_number)
);

create table if not exists exports (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  preset text not null,
  status text not null default 'pending',
  output_path text,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists reference_analyses (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  video_asset_id text not null,
  status text not null default 'pending',
  video jsonb not null default '{}',
  visual_style jsonb not null default '{}',
  shots jsonb not null default '[]',
  camera_language jsonb not null default '{}',
  lighting jsonb not null default '{}',
  motion_language jsonb not null default '{}',
  transitions jsonb not null default '[]',
  editing_rhythm jsonb not null default '{}',
  audio_notes jsonb not null default '{}',
  uncertainties jsonb not null default '[]',
  recreation_strategy jsonb not null default '{}',
  analyzed_at timestamptz not null default now(),
  model text not null
);

create table if not exists generation_experiences (
  id text primary key,
  project_id text not null,
  scene_id text not null,
  model text not null,
  provider text not null,
  input_signature text not null,
  prompt text not null,
  parameters jsonb not null default '{}',
  reference_features jsonb not null default '{}',
  result_features jsonb not null default '{}',
  qa_result jsonb not null default '{}',
  defects jsonb not null default '[]',
  corrections jsonb not null default '[]',
  user_feedback jsonb,
  success_score double precision not null,
  confidence double precision not null,
  created_at timestamptz not null default now()
);

create table if not exists correction_patterns (
  id text primary key,
  defect_type text not null,
  correction text not null,
  successful_count integer not null default 0,
  failed_count integer not null default 0,
  confidence double precision not null,
  last_used timestamptz not null default now(),
  examples jsonb not null default '[]'
);

create table if not exists generation_strategies (
  id text primary key,
  name text not null,
  conditions jsonb not null default '{}',
  prompt_pattern text not null,
  parameters jsonb not null default '{}',
  success_rate double precision not null,
  average_attempts double precision not null,
  average_generation_time double precision not null,
  confidence double precision not null,
  usage_count integer not null default 0
);

create table if not exists model_performance (
  id text primary key,
  model text not null,
  provider text not null,
  task_type text not null,
  generations integer not null default 0,
  approved integer not null default 0,
  rejected integer not null default 0,
  average_attempts double precision not null default 0,
  average_generation_time double precision not null default 0,
  common_defects jsonb not null default '[]',
  last_updated timestamptz not null default now(),
  unique(model, provider, task_type)
);

create index if not exists idx_scenes_project on scenes(project_id);
create index if not exists idx_assets_project on assets(project_id);
create index if not exists idx_attempts_scene on generation_attempts(scene_id);
create index if not exists idx_exports_project on exports(project_id);
create index if not exists idx_experiences_project on generation_experiences(project_id);
create index if not exists idx_correction_defect on correction_patterns(defect_type);
