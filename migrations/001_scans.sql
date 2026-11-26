-- Reports and per-IP rate limiting (ADR-0003).

create table scans (
  -- Random and unguessable: it is the report's public link.
  id text primary key,
  -- Normalized domain + path of the address typed: the 24-hour cache looks it up.
  cache_key text not null,
  domain text not null,
  url text not null,
  created_at timestamptz not null default now(),
  status text not null check (status in ('running', 'done', 'partial')),
  -- Raw results with the catalog version; texts come from the catalog when the report is shown.
  checks jsonb not null,
  -- Scores as computed at scan time.
  scores jsonb not null
);

create index scans_cache_key_created_at on scans (cache_key, created_at desc);
-- The global daily cap counts the last 24 hours.
create index scans_created_at on scans (created_at);

create table scan_requests (
  -- HMAC of the IP with IP_HASH_SECRET, never the IP itself.
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index scan_requests_ip_hash_created_at on scan_requests (ip_hash, created_at);
