import { config } from "dotenv";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";

config({ path: ".env.local", override: true });

type Channel = "bpo" | "tmk";
const [channel, ...csvPaths] = process.argv.slice(2) as [Channel, ...string[]];
if (!(["bpo", "tmk"] as string[]).includes(channel) || csvPaths.length === 0) {
  throw new Error("用法：pnpm tsx scripts/import-full-cache-csv.ts <bpo|tmk> <一个或多个CSV路径>");
}

const definitions: Record<Channel, { temp: string; copyColumns: string; detail: string; rank: string; uid: string }> = {
  bpo: {
    temp: "dt text, userid text, usertype text, rank text, has_actual_assignment text, sales_ldap text, assigned_at text, has_called text, has_connected text, call_count text, latest_touch_at text",
    copyColumns: "dt,userid,usertype,rank,has_actual_assignment,sales_ldap,assigned_at,has_called,has_connected,call_count,latest_touch_at",
    detail: "usertype",
    rank: "rank",
    uid: "userid",
  },
  tmk: {
    temp: "dt text, user_id text, lead_channel text, queue_rnk text, has_actual_assignment text, sales_ldap text, assigned_at text, has_called text, has_connected text, call_count text, latest_touch_at text",
    copyColumns: "dt,user_id,lead_channel,queue_rnk,has_actual_assignment,sales_ldap,assigned_at,has_called,has_connected,call_count,latest_touch_at",
    detail: "lead_channel",
    rank: "queue_rnk",
    uid: "user_id",
  },
};

function boolExpr(column: string): string {
  return `CASE WHEN lower(coalesce(${column}, '')) IN ('1','true','t','yes') THEN true ELSE false END`;
}

function timestampExpr(column: string): string {
  return `NULLIF(NULLIF(${column}, ''), '@pipe_null@')::timestamptz`;
}

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

    const range = await client.query<{
      min_dt: string | null;
      max_dt: string | null;
      row_count: string;
      day_count: string;
    }>("SELECT MIN(dt)::date min_dt, MAX(dt)::date max_dt, COUNT(*)::bigint row_count, COUNT(DISTINCT dt::date)::bigint day_count FROM cache_import");
    if (!range.rows[0].min_dt) throw new Error("CSV没有数据");

    const invalidRows = await client.query<{ invalid_count: string }>(`
      SELECT COUNT(*)::bigint AS invalid_count
      FROM cache_import
      WHERE NULLIF(dt, '') IS NULL
        OR NULLIF(${d.uid}, '') IS NULL
        OR NULLIF(${d.rank}, '') IS NULL
        OR ${d.rank} !~ '^[0-9]+$'
        OR ${d.rank}::integer <= 0
    `);
    if (Number(invalidRows.rows[0]?.invalid_count || 0) > 0) {
      throw new Error(`${channel} CSV存在空日期/空UID/非法rank，已取消导入`);
    }

    const duplicateUsers = await client.query<{ duplicate_count: string }>(`
      SELECT COUNT(*)::bigint AS duplicate_count
      FROM (
        SELECT dt::date,${d.uid}
        FROM cache_import
        GROUP BY dt::date,${d.uid}
        HAVING COUNT(*) > 1
      ) t
    `);
    if (Number(duplicateUsers.rows[0]?.duplicate_count || 0) > 0) {
      throw new Error(`${channel} CSV存在同一天重复UID，已取消导入`);
    }

    if (channel === "tmk") {
      const badRankDays = await client.query<{
        dt: string;
        row_count: string;
        min_rank: number;
        max_rank: number;
        distinct_rank: string;
      }>(`
        SELECT dt::date AS dt,COUNT(*)::bigint AS row_count,MIN(${d.rank}::integer) AS min_rank,
          MAX(${d.rank}::integer) AS max_rank,COUNT(DISTINCT ${d.rank}::integer)::bigint AS distinct_rank
        FROM cache_import
        GROUP BY dt::date
        HAVING MIN(${d.rank}::integer) <> 1
          OR MAX(${d.rank}::integer) <> COUNT(*)
          OR COUNT(DISTINCT ${d.rank}::integer) <> COUNT(*)
      `);
      if (badRankDays.rows.length > 0) {
        throw new Error(`TMK rank不连续，已取消导入：${JSON.stringify(badRankDays.rows)}`);
      }
    }

    await client.query(
      "DELETE FROM allocation_record_cache WHERE channel=$1 AND dt IN (SELECT DISTINCT dt::date FROM cache_import)",
      [channel],
    );

    await client.query(`
      INSERT INTO allocation_record_cache(
        channel,dt,user_id,rank,detail,has_actual_assignment,sales_ldap,assigned_at,
        has_called,has_connected,call_count,latest_touch_at
      )
      SELECT
        $1
        ,dt::date
        ,${d.uid}
        ,${d.rank}::integer
        ,NULLIF(${d.detail}, '')
        ,${boolExpr("has_actual_assignment")}
        ,NULLIF(NULLIF(sales_ldap, ''), '@pipe_null@')
        ,${timestampExpr("assigned_at")}
        ,${boolExpr("has_called")}
        ,${boolExpr("has_connected")}
        ,COALESCE(NULLIF(call_count, '')::integer, 0)
        ,${timestampExpr("latest_touch_at")}
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
