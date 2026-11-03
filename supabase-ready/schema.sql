-- start.here: database schema for Supabase (Postgres)
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Goal: a student can only ever read or write THEIR OWN data. Admins can see everything.

-- =====================================================================
-- 1. Profiles: one row per user. Role is 'student' unless you promote it.
-- =====================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  year text,
  why text,
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz not null default now()
);

-- Is the person making this request an admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Create the profile automatically at sign-up.
-- The role is NEVER taken from sign-up data, because users can edit that.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, year, why)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'year',
    new.raw_user_meta_data ->> 'why'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "read own profile, admins read all"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id or public.is_admin());

create policy "update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Students may edit only these columns. They can never change their own role.
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, phone, year, why) on public.profiles to authenticated;

-- =====================================================================
-- 2. Workshops, private links, sessions, enrollments
-- =====================================================================
create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  level_no int not null unique,
  title text not null,
  description text,
  dates_text text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

-- Live link lives in its own table so it can be shown only to enrolled students.
create table public.workshop_links (
  workshop_id uuid primary key references public.workshops (id) on delete cascade,
  live_url text
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  position int not null,
  title text not null,
  description text,
  starts_at timestamptz,
  recording_url text,  -- YouTube (unlisted) link for now
  unique (workshop_id, position)
);

create table public.enrollments (
  user_id uuid not null references auth.users (id) on delete cascade,
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, workshop_id)
);

create table public.session_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

create or replace function public.is_enrolled(w uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments
    where workshop_id = w and user_id = (select auth.uid())
  );
$$;

alter table public.workshops enable row level security;
alter table public.workshop_links enable row level security;
alter table public.sessions enable row level security;
alter table public.enrollments enable row level security;
alter table public.session_progress enable row level security;

-- Workshops: anyone signed in sees published ones. Only admins change them.
create policy "see published workshops" on public.workshops
  for select to authenticated using (published or public.is_admin());
create policy "admins manage workshops" on public.workshops
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Live link and sessions (with recordings): enrolled students and admins only.
create policy "enrolled see live link" on public.workshop_links
  for select to authenticated using (public.is_admin() or public.is_enrolled(workshop_id));
create policy "admins manage live link" on public.workshop_links
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "enrolled see sessions" on public.sessions
  for select to authenticated using (public.is_admin() or public.is_enrolled(workshop_id));
create policy "admins manage sessions" on public.sessions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Enrollments: you see and create only your own, and only for published workshops.
create policy "see own enrollments" on public.enrollments
  for select to authenticated using ((select auth.uid()) = user_id or public.is_admin());
create policy "enroll yourself" on public.enrollments
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.workshops w where w.id = workshop_id and w.published)
  );

-- Progress: strictly your own.
create policy "see own progress" on public.session_progress
  for select to authenticated using ((select auth.uid()) = user_id or public.is_admin());
create policy "mark own progress" on public.session_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "unmark own progress" on public.session_progress
  for delete to authenticated using ((select auth.uid()) = user_id);

-- =====================================================================
-- 3. Competitions and submissions
-- =====================================================================
create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'locked' check (status in ('locked', 'open', 'closed')),
  closes_at timestamptz,
  -- The submission form is described as data, so admins can change the questions.
  fields jsonb not null default '[
    {"key":"project_link","label":"Project link","type":"url","required":true},
    {"key":"about","label":"Tell us about your project","type":"text","required":false}
  ]',
  created_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  answers jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, user_id)
);

-- Can this person submit right now? (enrolled, competition open, not past the deadline)
create or replace function public.competition_open(c uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.competitions x
    where x.id = c
      and x.status = 'open'
      and (x.closes_at is null or x.closes_at > now())
      and public.is_enrolled(x.workshop_id)
  );
$$;

alter table public.competitions enable row level security;
alter table public.submissions enable row level security;

create policy "enrolled see competitions" on public.competitions
  for select to authenticated using (public.is_admin() or public.is_enrolled(workshop_id));
create policy "admins manage competitions" on public.competitions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "see own submissions" on public.submissions
  for select to authenticated using ((select auth.uid()) = user_id or public.is_admin());
create policy "submit while open" on public.submissions
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.competition_open(competition_id));
create policy "edit own submission while open" on public.submissions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and public.competition_open(competition_id));
create policy "admins manage submissions" on public.submissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- 4. Usage tracking and admin statistics
-- =====================================================================
create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,           -- e.g. 'login', 'open_workshop', 'watch_recording'
  workshop_id uuid references public.workshops (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "log own events" on public.events
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "admins read events" on public.events
  for select to authenticated using (public.is_admin());

-- One call returns the numbers for the admin dashboard. Refuses non-admins.
create or replace function public.admin_stats()
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  return json_build_object(
    'students',      (select count(*) from public.profiles where role = 'student'),
    'enrollments',   (select count(*) from public.enrollments),
    'active_24h',    (select count(distinct user_id) from public.events where created_at > now() - interval '24 hours'),
    'active_7d',     (select count(distinct user_id) from public.events where created_at > now() - interval '7 days'),
    'sessions_done', (select count(*) from public.session_progress),
    'submissions',   (select count(*) from public.submissions)
  );
end;
$$;

revoke execute on function public.admin_stats() from public, anon;

-- =====================================================================
-- 5. Starting data: Level 1 and its seven sessions (hidden until you publish)
-- =====================================================================
with w as (
  insert into public.workshops (level_no, title, description, published)
  values (1, 'Start Here', 'The free beginner workshop. Seven sessions, in the order that makes sense.', false)
  returning id
), l as (
  insert into public.workshop_links (workshop_id) select id from w
)
insert into public.sessions (workshop_id, position, title, description)
select w.id, s.position, s.title, s.description
from w, (values
  (1, 'The tech world, mapped',   'Paths, what to learn first, what to ignore.'),
  (2, 'Vibe coding and AI tools', 'Build with AI and check what it gives you.'),
  (3, 'A LinkedIn that works',    'Show what you are learning and building.'),
  (4, 'Git and GitHub basics',    'Save your work and share it.'),
  (5, 'APIs, explained simply',   'How apps talk to each other.'),
  (6, 'Deploying your work',      'From your laptop to a link anyone can open.'),
  (7, 'Build a real project',     'Put it all together.')
) as s (position, title, description);

-- =====================================================================
-- 6. Make yourself the admin (do this AFTER creating your admin user)
-- 1) Dashboard > Authentication > Users > Add user (email + a STRONG password).
-- 2) Copy that user's UUID, then run:
--      update public.profiles set role = 'admin' where id = 'PASTE-UUID-HERE';
-- =====================================================================
