-- Tables the Supabase adapter stub (src/lib/data/supabase.ts) expects.
-- This is a reference schema. It has not been applied to a live project.
-- All timestamps are timestamptz. Money is whole dollars.

create table if not exists leads (
  id                 text primary key,
  source             text not null check (source in ('web_form', 'phone', 'referral', 'repeat')),
  created_at         timestamptz not null,
  first_response_at  timestamptz,
  booked_at          timestamptz,
  outcome            text not null default 'open' check (outcome in ('open', 'won', 'lost')),
  decided_at         timestamptz
);

create table if not exists jobs (
  id            text primary key,
  lead_id       text references leads (id),
  completed_at  timestamptz,
  revenue       numeric not null default 0,
  cost          numeric not null default 0
);

create table if not exists change_orders (
  id            text primary key,
  job_id        text references jobs (id),
  amount        numeric not null default 0,
  requested_at  timestamptz not null,
  resolved_at   timestamptz,
  resolution    text check (resolution in ('approved', 'declined'))
);

create table if not exists review_requests (
  id                  text primary key,
  job_id              text references jobs (id),
  sent_at             timestamptz not null,
  review_received_at  timestamptz,
  rating              integer check (rating between 1 and 5)
);

-- The adapter filters on these columns.
create index if not exists leads_created_at_idx on leads (created_at);
create index if not exists leads_booked_at_idx on leads (booked_at);
create index if not exists leads_decided_at_idx on leads (decided_at);
create index if not exists jobs_completed_at_idx on jobs (completed_at);
create index if not exists change_orders_requested_at_idx on change_orders (requested_at);
create index if not exists review_requests_sent_at_idx on review_requests (sent_at);

-- The dashboard reads with the service role key from the server only.
-- Keep row level security on so the anon key cannot read these tables.
alter table leads enable row level security;
alter table jobs enable row level security;
alter table change_orders enable row level security;
alter table review_requests enable row level security;
