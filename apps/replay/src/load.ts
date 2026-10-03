import { createReadStream } from "node:fs";
import type { Writable } from "node:stream";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import type { PoolClient } from "pg";
import { from as copyFrom } from "pg-copy-streams";

async function copyFile(
  client: PoolClient,
  sql: string,
  file: string,
  gzip: boolean,
): Promise<void> {
  const source = createReadStream(file);
  const ingest = (client.query as (query: Writable) => Writable)(copyFrom(sql));
  if (gzip) await pipeline(source, createGunzip(), ingest);
  else await pipeline(source, ingest);
}

export async function loadDataset(client: PoolClient, dataDir: string): Promise<number> {
  console.log("loading inventory");
  await copyFile(
    client,
    `COPY inventory (serial, customer_id, vendor, model, hw_revision, software_version, plan_mbps, previous_plan_mbps, plan_since, customer_since, customer_status, cancelled_at, olt, pon_port, cto, city, neighborhood, installed_at, status, removed_at) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '', FORCE_NULL (hw_revision, software_version, plan_mbps, previous_plan_mbps, plan_since, customer_since, customer_status, cancelled_at, olt, pon_port, cto, city, neighborhood, installed_at, status, removed_at))`,
    `${dataDir}/inventory.csv`,
    false,
  );

  console.log("loading tickets");
  await copyFile(
    client,
    `COPY tickets (ticket_id, opened_at, customer_id, channel, category, description, resolution, closed_at) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '', FORCE_NULL (channel, category, description, resolution, closed_at))`,
    `${dataDir}/tickets.csv`,
    false,
  );

  console.log("loading diagnostics");
  await copyFile(
    client,
    `COPY diagnostics (ts, serial, requested_by, diagnostic, state, download_mbps, upload_mbps, test_server) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '', FORCE_NULL (requested_by, diagnostic, state, download_mbps, upload_mbps, test_server))`,
    `${dataDir}/diagnostics.csv`,
    false,
  );

  console.log("loading informs");
  await copyFile(
    client,
    `COPY informs (ts, serial, event_codes, software_version, uptime_s, mem_total_kb, mem_free_kb, optical_rx_power, optical_tx_power, pon_fec_uncorrectable, wan_bytes_rx, wan_bytes_tx, lan1_bit_rate, wifi_clients_24g, wifi_clients_5g, wifi_rssi_avg) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '', FORCE_NULL (event_codes, software_version, uptime_s, mem_total_kb, mem_free_kb, optical_rx_power, optical_tx_power, pon_fec_uncorrectable, wan_bytes_rx, wan_bytes_tx, lan1_bit_rate, wifi_clients_24g, wifi_clients_5g, wifi_rssi_avg))`,
    `${dataDir}/informs.csv.gz`,
    true,
  );

  const count = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM informs");
  console.log(`informs loaded: ${count.rows[0].n}`);
  await client.query("ANALYZE inventory");
  await client.query("ANALYZE tickets");
  await client.query("ANALYZE diagnostics");
  await client.query("ANALYZE informs");
  return Number(count.rows[0].n);
}
