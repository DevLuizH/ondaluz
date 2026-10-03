export interface Incident {
  id: number;
  openedAt: string;
  updatedAt: string;
  scopeType: string;
  scopeKey: string;
  group: "network" | "cohort" | "customer";
  cause: string;
  severity: string;
  priority: number;
  action: string;
  actionLabel: string;
  affected: number;
  title: string;
  speech: string;
  reason: string;
  evidence: Record<string, unknown>;
  memberCount?: number;
  members?: { serial: string; customerId: string }[];
}

export interface IncidentList {
  asOf: string;
  totals: { network: number; cohort: number; customer: number };
  groups: { network: Incident[]; cohort: Incident[]; customer: Incident[] };
}

export interface SupportView {
  asOf: string;
  customer: {
    customerId: string;
    serial: string;
    vendor: string;
    model: string;
    hwRevision: string | null;
    firmware: string | null;
    planMbps: number | null;
    olt: string | null;
    ponPort: string | null;
    cto: string | null;
    city: string | null;
    neighborhood: string | null;
    status: string | null;
  };
  primary: Incident | null;
  others: Incident[];
  speedtest: {
    ts: string;
    downloadMbps: number | null;
    uploadMbps: number | null;
    state: string | null;
    requestedBy: string | null;
    planMbps: number | null;
  } | null;
}

export interface Meta {
  from: string | null;
  to: string | null;
  customers: number;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Erro ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function fetchMeta(): Promise<Meta> {
  return getJson("/api/meta");
}

export function fetchIncidents(asOf: string): Promise<IncidentList> {
  return getJson(`/api/incidents?asOf=${encodeURIComponent(asOf)}`);
}

export function fetchIncident(id: number, asOf: string): Promise<Incident> {
  return getJson(`/api/incidents/${id}?asOf=${encodeURIComponent(asOf)}`);
}

export function fetchSupport(customerId: string, asOf: string): Promise<SupportView> {
  return getJson(`/api/support/${encodeURIComponent(customerId)}?asOf=${encodeURIComponent(asOf)}`);
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
