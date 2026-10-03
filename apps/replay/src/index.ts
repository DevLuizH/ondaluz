import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadDataset } from "./load.js";
import { replay } from "./replay.js";

const { Pool } = pg;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const dataDir = process.env.DATA_DIR ?? join(process.cwd(), "..", "..", "ondaluz-pack", "data");
  const informs = join(dataDir, "informs.csv.gz");
  if (!existsSync(informs)) {
    throw new Error(`Dataset not found at ${informs}. Place ondaluz-pack/data where DATA_DIR points.`);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "..", "sql", "001_schema.sql");
    await client.query(readFileSync(schemaPath, "utf8"));
    await client.query(
      "SELECT create_hypertable('informs', 'ts', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE)",
    );

    const done = await client.query<{ finished_at: Date | null }>(
      "SELECT finished_at FROM bootstrap_state WHERE id = 1",
    );
    if (done.rows[0]?.finished_at) {
      console.log("dataset already loaded, skipping replay");
      return;
    }

    await client.query(
      "TRUNCATE incident_members, incidents, informs, diagnostics, tickets, inventory, bootstrap_state RESTART IDENTITY CASCADE",
    );
    const loaded = await loadDataset(client, dataDir);
    const open = await replay(client);
    await client.query(
      `INSERT INTO bootstrap_state (id, finished_at, informs_loaded, incidents_open)
       VALUES (1, now(), $1, $2)`,
      [loaded, open],
    );
    console.log(`bootstrap finished, informs=${loaded}, incidents still open=${open}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
