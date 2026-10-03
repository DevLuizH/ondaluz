import { num, rxToDbm } from "./signal.js";
import type { CpeState, InformRow, InventoryRow } from "./types.js";

export function blankState(inv: InventoryRow): CpeState {
  return {
    inv,
    lastTs: 0,
    softwareVersion: inv.vendor === "Kestrel" ? "" : "",
    rxDbm: null,
    baselineRx: null,
    baselineSamples: 0,
    baselineSum: 0,
    memFreeRatio: null,
    lanMbps: null,
    lan100Streak: 0,
    wifiRaw: null,
    wifiClients: 0,
    poorWifiStreak: 0,
    bootTimes: [],
    prevFec: null,
    fecHour: -1,
    fecDelta: 0,
  };
}

export function applyInform(state: CpeState, row: InformRow, hour: number): void {
  const ts = row.ts.getTime();
  state.lastTs = ts;
  if (row.software_version) state.softwareVersion = row.software_version;

  const rx = rxToDbm(state.inv.vendor, num(row.optical_rx_power));
  if (rx != null) {
    state.rxDbm = rx;
    if (state.baselineSamples < 12) {
      state.baselineSum += rx;
      state.baselineSamples += 1;
      if (state.baselineSamples === 12) state.baselineRx = state.baselineSum / 12;
    }
  }

  const total = num(row.mem_total_kb);
  const free = num(row.mem_free_kb);
  if (total != null && total > 0 && free != null) state.memFreeRatio = free / total;

  const lan = num(row.lan1_bit_rate);
  if (lan != null) {
    state.lanMbps = lan;
    state.lan100Streak = lan === 100 ? state.lan100Streak + 1 : 0;
  }

  const clients = (num(row.wifi_clients_24g) ?? 0) + (num(row.wifi_clients_5g) ?? 0);
  state.wifiClients = clients;
  const rssi = num(row.wifi_rssi_avg);
  if (rssi != null) {
    state.wifiRaw = rssi;
    const poor =
      clients >= 1 &&
      (state.inv.vendor === "Tuim" ? rssi <= 30 : state.inv.vendor === "Kestrel" ? rssi <= -85 : false);
    state.poorWifiStreak = poor ? state.poorWifiStreak + 1 : 0;
  }

  const event = row.event_codes ?? "";
  if (event.includes("1 BOOT") || event.includes("BOOTSTRAP")) state.bootTimes.push(ts);
  const cutoff = ts - 24 * 60 * 60 * 1000;
  while (state.bootTimes.length > 0 && state.bootTimes[0] < cutoff) state.bootTimes.shift();

  const fec = num(row.pon_fec_uncorrectable);
  if (state.fecHour !== hour) {
    state.fecHour = hour;
    state.fecDelta = 0;
  }
  if (fec != null) {
    if (state.prevFec != null && fec >= state.prevFec) state.fecDelta += fec - state.prevFec;
    state.prevFec = fec;
  }
}
