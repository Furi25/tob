// Local Postgres without Docker: `npm run db:local` (leave it running; Ctrl+C stops it).
// Uses the same credentials and port as docker-compose.yml, so .env and .env.test work with either.
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const databaseDir = path.resolve(".pgdata");
const pg = new EmbeddedPostgres({
  databaseDir,
  user: "tob",
  password: "tob",
  port: 5432,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

if (!existsSync(databaseDir)) await pg.initialise();
await pg.start();

const client = pg.getPgClient();
await client.connect();
const { rows } = await client.query("SELECT datname FROM pg_database");
const existing = new Set(rows.map((r) => r.datname));
await client.end();
for (const name of ["tob_dev", "tob_test"]) {
  if (!existing.has(name)) await pg.createDatabase(name);
}

console.log("Postgres ready on localhost:5432 (tob_dev, tob_test). Ctrl+C to stop.");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
