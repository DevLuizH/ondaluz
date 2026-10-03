CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS inventory (
  serial text PRIMARY KEY,
  customer_id text NOT NULL,
  vendor text NOT NULL,
  model text NOT NULL,
  hw_revision text,
  software_version text,
  plan_mbps integer,
  previous_plan_mbps integer,
  plan_since date,
  customer_since date,
  customer_status text,
  cancelled_at date,
  olt text,
  pon_port text,
  cto text,
  city text,
  neighborhood text,
  installed_at date,
  status text,
  removed_at date
);

CREATE INDEX IF NOT EXISTS inventory_customer_idx ON inventory (customer_id);

CREATE TABLE IF NOT EXISTS tickets (
  ticket_id text PRIMARY KEY,
  opened_at timestamptz NOT NULL,
  customer_id text NOT NULL,
  channel text,
  category text,
  description text,
  resolution text,
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS tickets_opened_idx ON tickets (opened_at);
CREATE INDEX IF NOT EXISTS tickets_customer_idx ON tickets (customer_id);

CREATE TABLE IF NOT EXISTS diagnostics (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL,
  serial text NOT NULL,
  requested_by text,
  diagnostic text,
  state text,
  download_mbps double precision,
  upload_mbps double precision,
  test_server text
);

CREATE INDEX IF NOT EXISTS diagnostics_serial_ts_idx ON diagnostics (serial, ts DESC);

CREATE TABLE IF NOT EXISTS informs (
  ts timestamptz NOT NULL,
  serial text NOT NULL,
  event_codes text,
  software_version text,
  uptime_s bigint,
  mem_total_kb double precision,
  mem_free_kb double precision,
  optical_rx_power double precision,
  optical_tx_power double precision,
  pon_fec_uncorrectable double precision,
  wan_bytes_rx double precision,
  wan_bytes_tx double precision,
  lan1_bit_rate double precision,
  wifi_clients_24g double precision,
  wifi_clients_5g double precision,
  wifi_rssi_avg double precision
);

CREATE TABLE IF NOT EXISTS incidents (
  id bigserial PRIMARY KEY,
  opened_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  resolved_at timestamptz,
  scope_type text NOT NULL,
  scope_key text NOT NULL,
  cause text NOT NULL,
  severity text NOT NULL,
  priority integer NOT NULL,
  recommended_action text NOT NULL,
  affected integer NOT NULL,
  title text NOT NULL,
  speech text NOT NULL,
  reason text NOT NULL,
  evidence jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS incidents_asof_idx ON incidents (opened_at, resolved_at);

CREATE TABLE IF NOT EXISTS incident_members (
  incident_id bigint NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  serial text NOT NULL,
  customer_id text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz
);

CREATE INDEX IF NOT EXISTS incident_members_customer_idx
  ON incident_members (customer_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS incident_members_incident_idx
  ON incident_members (incident_id);

CREATE TABLE IF NOT EXISTS bootstrap_state (
  id integer PRIMARY KEY,
  finished_at timestamptz,
  informs_loaded bigint,
  incidents_open bigint
);
