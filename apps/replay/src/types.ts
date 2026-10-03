export type Severity = "high" | "medium" | "low";
export type Action = "phone" | "noc" | "field_visit" | "external_plant";
export type ScopeType = "customer" | "cto" | "pon" | "olt" | "cohort";

export interface InventoryRow {
  serial: string;
  customerId: string;
  vendor: string;
  model: string;
  hwRevision: string;
  planMbps: number;
  previousPlanMbps: number | null;
  planSince: string | null;
  olt: string;
  ponPort: string;
  cto: string;
  city: string;
  neighborhood: string;
  status: string;
}

export interface CpeState {
  inv: InventoryRow;
  lastTs: number;
  softwareVersion: string;
  rxDbm: number | null;
  baselineRx: number | null;
  baselineSamples: number;
  baselineSum: number;
  memFreeRatio: number | null;
  lanMbps: number | null;
  lan100Streak: number;
  wifiRaw: number | null;
  wifiClients: number;
  poorWifiStreak: number;
  bootTimes: number[];
  prevFec: number | null;
  fecHour: number;
  fecDelta: number;
}

export interface Member {
  serial: string;
  customerId: string;
}

export interface Draft {
  key: string;
  cause: string;
  scopeType: ScopeType;
  scopeKey: string;
  severity: Severity;
  action: Action;
  priority: number;
  affected: number;
  title: string;
  speech: string;
  reason: string;
  evidence: Record<string, unknown>;
  members: Member[];
}

export interface InformRow {
  ts: Date;
  serial: string;
  event_codes: string | null;
  software_version: string | null;
  optical_rx_power: number | null;
  mem_total_kb: number | null;
  mem_free_kb: number | null;
  pon_fec_uncorrectable: number | null;
  lan1_bit_rate: number | null;
  wifi_clients_24g: number | null;
  wifi_clients_5g: number | null;
  wifi_rssi_avg: number | null;
}

export interface TicketLite {
  ts: number;
  customerId: string;
  category: string;
  city: string;
}

export const STALE_MS = 12 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const SILENCE_HOURS = 6;
