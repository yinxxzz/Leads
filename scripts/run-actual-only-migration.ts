import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

async function main() {
  const connectionString = process.env.USER_POSTGRESQL_URL;
  if (!connectionString) throw new Error("缺少 USER_POSTGRESQL_URL");

  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20260717_keep_actual_assignments_only.sql"),
    "utf8",
  );
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(migration);
    await client.query("COMMIT");
    console.log("缓存已切换为仅保留实际分配记录");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
