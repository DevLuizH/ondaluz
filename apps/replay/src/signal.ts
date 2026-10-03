import type { CpeState, InventoryRow, TicketLite } from "./types.js";
import { STALE_MS } from "./types.js";

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

export function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function planAt(inv: InventoryRow, ts: number): number {
  if (inv.previousPlanMbps != null && inv.planSince) {
    const localDate = new Date(ts - BRT_OFFSET_MS).toISOString().slice(0, 10);
    if (localDate < inv.planSince) return inv.previousPlanMbps;
  }
  return inv.planMbps;
}

/** Vendors do not share a unit. Kestrel is dBm × 1000. Norvik RX is mW. Tuim is already dBm. */
export function rxToDbm(vendor: string, raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (vendor === "Kestrel") return raw / 1000;
  if (vendor === "Norvik") {
    if (raw <= 0) return null;
    return 10 * Math.log10(raw);
  }
  return raw;
}

export function isStale(state: CpeState, hour: number): boolean {
  return hour - state.lastTs > STALE_MS;
}

export function isNorvikRevA(state: CpeState): boolean {
  return state.inv.vendor === "Norvik" && (state.inv.hwRevision === "A" || state.softwareVersion.startsWith("V1."));
}

export function opticalBad(state: CpeState, hour: number): boolean {
  if (state.rxDbm == null || isStale(state, hour)) return false;
  if (state.rxDbm <= -27) return true;
  if (state.baselineRx != null && state.rxDbm <= -25 && state.baselineRx - state.rxDbm >= 3) return true;
  return false;
}

export function lowMemory(state: CpeState): boolean {
  return state.memFreeRatio != null && state.memFreeRatio < 0.1;
}

export function bootedWithin(state: CpeState, hour: number, windowMs: number): boolean {
  const cutoff = hour - windowMs;
  return state.bootTimes.some((ts) => ts >= cutoff);
}

export function truncHour(ts: number): number {
  return Math.floor(ts / 3600000) * 3600000;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface DnsHit {
  tickets: number;
  cities: number;
  members: { serial: string; customerId: string }[];
}

export function dnsHits(
  tickets: TicketLite[],
  from: number,
  to: number,
  serialByCustomer: Map<string, string>,
): DnsHit {
  const cities = new Set<string>();
  const members = new Map<string, string>();
  let count = 0;
  for (const ticket of tickets) {
    if (ticket.ts < from || ticket.ts >= to) continue;
    if (ticket.category !== "Sem conexão") continue;
    count += 1;
    if (ticket.city) cities.add(ticket.city);
    const serial = serialByCustomer.get(ticket.customerId);
    if (serial) members.set(serial, ticket.customerId);
  }
  return {
    tickets: count,
    cities: cities.size,
    members: [...members.entries()].map(([serial, customerId]) => ({ serial, customerId })),
  };
}
