import type { PoolClient } from "pg";
import { applyInform, blankState } from "./apply.js";
import { detectHour } from "./detect.js";
import { num, truncHour } from "./signal.js";
import type { CpeState, Draft, InformRow, InventoryRow, Member, TicketLite } from "./types.js";
import { DAY_MS, HOUR_MS, SILENCE_HOURS } from "./types.js";

interface OpenIncident {
  id: number;
  silence: number;
  lastWrite: number;
  members: Map<string, string>;
}

export async function replay(client: PoolClient): Promise<number> {
  const inventory = await loadInventory(client);
  const states = new Map<string, CpeState>();
  const ponPopulation = new Map<string, number>();
  const ctoPopulation = new Map<string, number>();
  const serialByCustomer = new Map<string, string>();

  for (const inv of inventory.values()) {
    states.set(inv.serial, blankState(inv));
    if (inv.status !== "active") continue;
    const ponKey = `${inv.olt}|${inv.ponPort}`;
    ponPopulation.set(ponKey, (ponPopulation.get(ponKey) ?? 0) + 1);
    ctoPopulation.set(inv.cto, (ctoPopulation.get(inv.cto) ?? 0) + 1);
    serialByCustomer.set(inv.customerId, inv.serial);
  }

  const tickets = await loadTickets(client, inventory);
  const bounds = await client.query<{ min: Date; max: Date }>("SELECT min(ts) AS min, max(ts) AS max FROM informs");
  const start = truncHour(bounds.rows[0].min.getTime());
  const end = truncHour(bounds.rows[0].max.getTime());
  const open = new Map<string, OpenIncident>();

  for (let day = start; day <= end; day += DAY_MS) {
    const dayEnd = Math.min(day + DAY_MS, end + HOUR_MS);
    const rows = await client.query<InformRow>(
      `SELECT ts, serial, event_codes, software_version, optical_rx_power, mem_total_kb, mem_free_kb,
              pon_fec_uncorrectable, lan1_bit_rate, wifi_clients_24g, wifi_clients_5g, wifi_rssi_avg
       FROM informs
       WHERE ts >= $1 AND ts < $2
       ORDER BY ts`,
      [new Date(day), new Date(dayEnd)],
    );

    const byHour = new Map<number, InformRow[]>();
    for (const row of rows.rows) {
      const hour = truncHour(row.ts.getTime());
      const list = byHour.get(hour);
      if (list) list.push(row);
      else byHour.set(hour, [row]);
    }

    for (let hour = day; hour < dayEnd; hour += HOUR_MS) {
      for (const row of byHour.get(hour) ?? []) {
        const state = states.get(row.serial);
        if (!state) continue;
        applyInform(state, normalizeRow(row), hour);
      }
      const drafts = detectHour(states, hour, ponPopulation, ctoPopulation, tickets, serialByCustomer);
      await reconcile(client, open, drafts, hour);
    }
    console.log(`replay ${new Date(day).toISOString().slice(0, 10)} informs=${rows.rowCount} open=${open.size}`);
  }

  return open.size;
}

function normalizeRow(row: InformRow): InformRow {
  return {
    ...row,
    ts: row.ts instanceof Date ? row.ts : new Date(row.ts),
    optical_rx_power: num(row.optical_rx_power),
    mem_total_kb: num(row.mem_total_kb),
    mem_free_kb: num(row.mem_free_kb),
    pon_fec_uncorrectable: num(row.pon_fec_uncorrectable),
    lan1_bit_rate: num(row.lan1_bit_rate),
    wifi_clients_24g: num(row.wifi_clients_24g),
    wifi_clients_5g: num(row.wifi_clients_5g),
    wifi_rssi_avg: num(row.wifi_rssi_avg),
  };
}

function dateOnly(value: Date | string | null): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

async function loadInventory(client: PoolClient): Promise<Map<string, InventoryRow>> {
  const result = await client.query<{
    serial: string;
    customer_id: string;
    vendor: string;
    model: string;
    hw_revision: string | null;
    plan_mbps: number | null;
    previous_plan_mbps: number | null;
    plan_since: Date | null;
    olt: string | null;
    pon_port: string | null;
    cto: string | null;
    city: string | null;
    neighborhood: string | null;
    status: string | null;
  }>(
    `SELECT serial, customer_id, vendor, model, hw_revision, plan_mbps, previous_plan_mbps, plan_since,
            olt, pon_port, cto, city, neighborhood, status
     FROM inventory`,
  );

  const map = new Map<string, InventoryRow>();
  for (const row of result.rows) {
    map.set(row.serial, {
      serial: row.serial,
      customerId: row.customer_id,
      vendor: row.vendor,
      model: row.model,
      hwRevision: row.hw_revision ?? "",
      planMbps: row.plan_mbps ?? 0,
      previousPlanMbps: row.previous_plan_mbps,
      planSince: dateOnly(row.plan_since),
      olt: row.olt ?? "",
      ponPort: row.pon_port ?? "",
      cto: row.cto ?? "",
      city: row.city ?? "",
      neighborhood: row.neighborhood ?? "",
      status: row.status ?? "",
    });
  }
  return map;
}

async function loadTickets(client: PoolClient, inventory: Map<string, InventoryRow>): Promise<TicketLite[]> {
  const cityByCustomer = new Map<string, string>();
  for (const inv of inventory.values()) {
    if (!cityByCustomer.has(inv.customerId)) cityByCustomer.set(inv.customerId, inv.city);
  }
  const result = await client.query<{ opened_at: Date; customer_id: string; category: string | null }>(
    "SELECT opened_at, customer_id, category FROM tickets ORDER BY opened_at",
  );
  return result.rows.map((row) => ({
    ts: row.opened_at.getTime(),
    customerId: row.customer_id,
    category: row.category ?? "",
    city: cityByCustomer.get(row.customer_id) ?? "",
  }));
}

async function reconcile(
  client: PoolClient,
  open: Map<string, OpenIncident>,
  drafts: Draft[],
  hour: number,
): Promise<void> {
  const seen = new Set<string>();
  const when = new Date(hour);
  for (const item of drafts) {
    seen.add(item.key);
    const current = open.get(item.key);
    if (!current) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO incidents
          (opened_at, updated_at, scope_type, scope_key, cause, severity, priority, recommended_action, affected, title, speech, reason, evidence)
         VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
         RETURNING id`,
        [
          when,
          item.scopeType,
          item.scopeKey,
          item.cause,
          item.severity,
          item.priority,
          item.action,
          item.affected,
          item.title,
          item.speech,
          item.reason,
          JSON.stringify(item.evidence),
        ],
      );
      const id = Number(inserted.rows[0].id);
      const members = new Map<string, string>();
      await syncMembers(client, id, when, members, item.members);
      open.set(item.key, { id, silence: 0, lastWrite: hour, members });
      continue;
    }
    current.silence = 0;
    if (hour - current.lastWrite >= 6 * HOUR_MS) {
      current.lastWrite = hour;
      await client.query(
        `UPDATE incidents
         SET updated_at = $2, severity = $3, priority = $4, recommended_action = $5,
             affected = $6, title = $7, speech = $8, reason = $9, evidence = $10::jsonb
         WHERE id = $1`,
        [
          current.id,
          when,
          item.severity,
          item.priority,
          item.action,
          item.affected,
          item.title,
          item.speech,
          item.reason,
          JSON.stringify(item.evidence),
        ],
      );
    }
    await syncMembers(client, current.id, when, current.members, item.members);
  }

  for (const [key, current] of open) {
    if (seen.has(key)) continue;
    current.silence += 1;
    if (current.silence < SILENCE_HOURS) continue;
    await client.query("UPDATE incidents SET resolved_at = $2, updated_at = $2 WHERE id = $1", [current.id, when]);
    if (current.members.size > 0) {
      await client.query(
        "UPDATE incident_members SET valid_to = $2 WHERE incident_id = $1 AND valid_to IS NULL",
        [current.id, when],
      );
    }
    open.delete(key);
  }
}

async function syncMembers(
  client: PoolClient,
  incidentId: number,
  when: Date,
  current: Map<string, string>,
  next: Member[],
): Promise<void> {
  const nextMap = new Map(next.map((member) => [member.serial, member.customerId]));
  const leaving: string[] = [];
  for (const serial of current.keys()) {
    if (!nextMap.has(serial)) leaving.push(serial);
  }
  const arrivingSerial: string[] = [];
  const arrivingCustomer: string[] = [];
  for (const [serial, customerId] of nextMap) {
    if (!current.has(serial)) {
      arrivingSerial.push(serial);
      arrivingCustomer.push(customerId);
    }
  }
  if (leaving.length > 0) {
    await client.query(
      `UPDATE incident_members SET valid_to = $3
       WHERE incident_id = $1 AND valid_to IS NULL AND serial = ANY($2::text[])`,
      [incidentId, leaving, when],
    );
    for (const serial of leaving) current.delete(serial);
  }
  if (arrivingSerial.length > 0) {
    await client.query(
      `INSERT INTO incident_members (incident_id, serial, customer_id, valid_from)
       SELECT $1, x.serial, x.customer_id, $4
       FROM unnest($2::text[], $3::text[]) AS x(serial, customer_id)`,
      [incidentId, arrivingSerial, arrivingCustomer, when],
    );
    for (let i = 0; i < arrivingSerial.length; i += 1) current.set(arrivingSerial[i], arrivingCustomer[i]);
  }
}
