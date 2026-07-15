import { config } from "dotenv";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";

config({ path: ".env.local", override: true });

type Channel = "bpo" | "tmk" | "cc";
const [channel, ...csvPaths] = process.argv.slice(2) as [Channel, ...string[]];
if (!(["bpo", "tmk", "cc"] as string[]).includes(channel) || csvPaths.length === 0) {
  throw new Error("用法：pnpm cache:import <bpo|tmk|cc> <一个或多个CSV路径>");
}

const definitions: Record<Channel, { temp: string; copyColumns: string; detail: string; rank: string; uid: string }> = {
  bpo: { temp: "dt text, userid text, usertype text, rank text", copyColumns: "dt,userid,usertype,rank", detail: "usertype", rank: "rank", uid: "userid" },
  tmk: { temp: "dt text, user_id text, lead_channel text, queue_rnk text", copyColumns: "dt,user_id,lead_channel,queue_rnk", detail: "lead_channel", rank: "queue_rnk", uid: "user_id" },
  cc: { temp: "dt text, user_id text, final_rank text, business_line_type text", copyColumns: "dt,user_id,final_rank,business_line_type", detail: "business_line_type", rank: "final_rank", uid: "user_id" },
};

async function main() {
  if (!process.env.USER_POSTGRESQL_URL) throw new Error("缺少USER_POSTGRESQL_URL");
  const client = new Client({ connectionString: process.env.USER_POSTGRESQL_URL });
  const d = definitions[channel];
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TEMP TABLE cache_import (${d.temp}) ON COMMIT DROP`);
    for (const csvPath of csvPaths) {
      const copy = client.query(copyFrom(`COPY cache_import (${d.copyColumns}) FROM STDIN WITH (FORMAT csv, HEADER true)`));
      await pipeline(createReadStream(csvPath), copy);
    }
    const range = await client.query("SELECT MIN(dt)::date min_dt, MAX(dt)::date max_dt, COUNT(*)::bigint row_count FROM cache_import");
    if (!range.rows[0].min_dt) throw new Error("CSV没有数据");
    await client.query(
      "DELETE FROM allocation_record_cache WHERE channel=$1 AND dt IN (SELECT DISTINCT dt::date FROM cache_import)",
      [channel],
    );
    await client.query(`
      INSERT INTO allocation_record_cache(channel,dt,user_id,rank,detail)
      SELECT $1, dt::date, ${d.uid}, ${d.rank}::integer, NULLIF(${d.detail}, '')
      FROM cache_import
    `, [channel]);
    await client.query(`
      INSERT INTO allocation_cache_refreshes(channel,dt,status,row_count,refreshed_at,error_message)
      SELECT $1, dt::date, 'success', COUNT(*)::integer, NOW(), NULL
      FROM cache_import GROUP BY dt::date
      ON CONFLICT(channel,dt) DO UPDATE SET
        status='success', row_count=EXCLUDED.row_count, refreshed_at=NOW(), error_message=NULL
    `, [channel]);
    await client.query("COMMIT");
    console.log(JSON.stringify({ channel, ...range.rows[0] }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

void main();
