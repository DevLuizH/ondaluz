import cors from "@fastify/cors";
import Fastify from "fastify";
import pg from "pg";

const { Pool } = pg;

const ACTION_LABEL: Record<string, string> = {
  phone: "Resolver no telefone",
  noc: "Escalar para o NOC",
  field_visit: "Agendar visita técnica",
  external_plant: "Acionar rede externa",
};

const SCOPE_GROUP: Record<string, "network" | "cohort" | "customer"> = {
  pon: "network",
  cto: "network",
  olt: "network",
  cohort: "cohort",
  customer: "customer",
};

interface IncidentRow {
  id: string;
  opened_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  scope_type: string;
  scope_key: string;
  cause: string;
  severity: string;
  priority: number;
  recommended_action: string;
  affected: number;
  title: string;
  speech: string;
  reason: string;
  evidence: Record<string, unknown>;
}

function asOfFrom(value: unknown): Date {
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date("2026-08-30T23:00:00-03:00");
}

function mapIncident(row: IncidentRow) {
  return {
    id: Number(row.id),
    openedAt: row.opened_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    scopeType: row.scope_type,
    scopeKey: row.scope_key,
    group: SCOPE_GROUP[row.scope_type] ?? "customer",
    cause: row.cause,
    severity: row.severity,
    priority: row.priority,
    action: row.recommended_action,
    actionLabel: ACTION_LABEL[row.recommended_action] ?? row.recommended_action,
    affected: row.affected,
    title: row.title,
    speech: row.speech,
    reason: row.reason,
    evidence: row.evidence,
  };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl });
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/meta", async () => {
    const result = await pool.query<{ min: Date; max: Date; customers: string }>(
      `SELECT min(ts) AS min, max(ts) AS max,
              (SELECT count(*)::text FROM inventory WHERE status = 'active') AS customers
       FROM informs`,
    );
    const row = result.rows[0];
    return {
      from: row?.min?.toISOString() ?? null,
      to: row?.max?.toISOString() ?? null,
      customers: Number(row?.customers ?? 0),
    };
  });

  app.get("/api/incidents", async (request) => {
    const asOf = asOfFrom((request.query as { asOf?: string }).asOf);
    const result = await pool.query<IncidentRow>(
      `SELECT id, opened_at, updated_at, resolved_at, scope_type, scope_key, cause, severity,
              priority, recommended_action, affected, title, speech, reason, evidence
       FROM incidents
       WHERE opened_at <= $1 AND (resolved_at IS NULL OR resolved_at > $1)
       ORDER BY priority DESC, affected DESC`,
      [asOf],
    );
    const incidents = result.rows.map(mapIncident).filter((item) => {
      // Cabo negociado em 100 Mbps é roteiro de ligação, não uma ação de turno.
      // A coorte da Norvik revisão A continua no quadro. O caso isolado aparece no suporte.
      return !(item.cause === "lan_fast_ethernet" && item.scopeType === "customer");
    });
    const groups = {
      network: incidents.filter((item) => item.group === "network"),
      cohort: incidents.filter((item) => item.group === "cohort"),
      customer: incidents.filter((item) => item.group === "customer"),
    };
    return {
      asOf: asOf.toISOString(),
      totals: {
        network: groups.network.length,
        cohort: groups.cohort.length,
        customer: groups.customer.length,
      },
      groups: {
        network: groups.network,
        cohort: groups.cohort,
        customer: groups.customer.slice(0, 40),
      },
    };
  });

  app.get<{ Params: { id: string } }>("/api/incidents/:id", async (request, reply) => {
    const asOf = asOfFrom((request.query as { asOf?: string }).asOf);
    const id = Number(request.params.id);
    const result = await pool.query<IncidentRow>(
      `SELECT id, opened_at, updated_at, resolved_at, scope_type, scope_key, cause, severity,
              priority, recommended_action, affected, title, speech, reason, evidence
       FROM incidents WHERE id = $1`,
      [id],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: "Incidente não encontrado" });
    const members = await pool.query<{ serial: string; customer_id: string }>(
      `SELECT serial, customer_id
       FROM incident_members
       WHERE incident_id = $1 AND valid_from <= $2 AND (valid_to IS NULL OR valid_to > $2)
       ORDER BY customer_id
       LIMIT 40`,
      [id, asOf],
    );
    const count = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n
       FROM incident_members
       WHERE incident_id = $1 AND valid_from <= $2 AND (valid_to IS NULL OR valid_to > $2)`,
      [id, asOf],
    );
    return {
      ...mapIncident(result.rows[0]),
      memberCount: Number(count.rows[0]?.n ?? 0),
      members: members.rows.map((row) => ({ serial: row.serial, customerId: row.customer_id })),
    };
  });

  app.get<{ Params: { customerId: string } }>("/api/support/:customerId", async (request, reply) => {
    const asOf = asOfFrom((request.query as { asOf?: string }).asOf);
    const customerId = request.params.customerId.trim();
    const equipment = await pool.query<{
      serial: string;
      customer_id: string;
      vendor: string;
      model: string;
      hw_revision: string | null;
      software_version: string | null;
      plan_mbps: number | null;
      olt: string | null;
      pon_port: string | null;
      cto: string | null;
      city: string | null;
      neighborhood: string | null;
      status: string | null;
    }>(
      `SELECT serial, customer_id, vendor, model, hw_revision, software_version, plan_mbps,
              olt, pon_port, cto, city, neighborhood, status
       FROM inventory
       WHERE customer_id = $1
       ORDER BY (status = 'active') DESC, installed_at DESC NULLS LAST
       LIMIT 1`,
      [customerId],
    );
    if (!equipment.rows[0]) return reply.code(404).send({ error: "Cliente não encontrado" });
    const cpe = equipment.rows[0];

    const incidents = await pool.query<IncidentRow>(
      `SELECT i.id, i.opened_at, i.updated_at, i.resolved_at, i.scope_type, i.scope_key, i.cause,
              i.severity, i.priority, i.recommended_action, i.affected, i.title, i.speech, i.reason, i.evidence
       FROM incidents i
       WHERE i.opened_at <= $2 AND (i.resolved_at IS NULL OR i.resolved_at > $2)
         AND (
           (i.cause = 'upstream_dns' AND i.evidence->>'global' = 'true')
           OR EXISTS (
             SELECT 1 FROM incident_members m
             WHERE m.incident_id = i.id AND m.customer_id = $1
               AND m.valid_from <= $2 AND (m.valid_to IS NULL OR m.valid_to > $2)
           )
         )
       ORDER BY i.priority DESC`,
      [customerId, asOf],
    );
    const mapped = incidents.rows.map(mapIncident);
    const speed = await pool.query<{
      ts: Date;
      download_mbps: number | null;
      upload_mbps: number | null;
      state: string | null;
      requested_by: string | null;
    }>(
      `SELECT ts, download_mbps, upload_mbps, state, requested_by
       FROM diagnostics
       WHERE serial = $1 AND ts <= $2
       ORDER BY ts DESC
       LIMIT 1`,
      [cpe.serial, asOf],
    );
    const test = speed.rows[0];
    return {
      asOf: asOf.toISOString(),
      customer: {
        customerId: cpe.customer_id,
        serial: cpe.serial,
        vendor: cpe.vendor,
        model: cpe.model,
        hwRevision: cpe.hw_revision,
        firmware: cpe.software_version,
        planMbps: cpe.plan_mbps,
        olt: cpe.olt,
        ponPort: cpe.pon_port,
        cto: cpe.cto,
        city: cpe.city,
        neighborhood: cpe.neighborhood,
        status: cpe.status,
      },
      primary: mapped[0] ?? null,
      others: mapped.slice(1, 4),
      speedtest: test
        ? {
            ts: test.ts.toISOString(),
            downloadMbps: test.download_mbps,
            uploadMbps: test.upload_mbps,
            state: test.state,
            requestedBy: test.requested_by,
            planMbps: cpe.plan_mbps,
          }
        : null,
    };
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
