import { config } from "dotenv";
import { Client } from "pg";
import { queryAllocationRecordsForCache } from "../app/api/allocation/data-source";
import type { TmkRecord } from "../app/api/allocation/mock-data";

config({ path: ".env.local", override: true });

const [startDate, endDate = startDate] = process.argv.slice(2);
const allowZero = process.argv.includes("--allow-zero");

if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
  throw new Error("用法：pnpm tsx scripts/rebuild-tmk-cache.ts <开始日期YYYY-MM-DD> [结束日期YYYY-MM-DD]");
}

if (startDate > endDate) {
  throw new Error("开始日期不能晚于结束日期");
}

function datesBetween(start: string, end: string): string[] {
  const output: string[] = [];
  const current = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (current <= last) {
    output.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return output;
}

function chunkDates(dates: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let offset = 0; offset < dates.length; offset += size) {
    chunks.push(dates.slice(offset, offset + size));
  }
  return chunks;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function nullable(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value);
  if (!text || text === "@pipe_null@" || text.toLowerCase() === "null") return null;
  return text;
}

function validateRecords(records: TmkRecord[], dates: string[]): Map<string, TmkRecord[]> {
  const byDate = new Map<string, TmkRecord[]>();
  for (const date of dates) byDate.set(date, []);

  for (const record of records) {
    const rows = byDate.get(record.dt);
    if (!rows) throw new Error(`返回了请求范围外日期：${record.dt}`);
    rows.push(record);
  }

  for (const [date, rows] of Array.from(byDate.entries())) {
    if (rows.length === 0) {
      if (!allowZero) throw new Error(`TMK ${date} 返回0条，默认拒绝重建；确认需要0条时追加 --allow-zero`);
      continue;
    }
    const ranks = new Set<number>();
    const users = new Set<string>();

    for (const row of rows) {
      const rank = Number(row.queue_rnk);
      if (!Number.isInteger(rank) || rank <= 0) {
        throw new Error(`TMK ${date} 存在非法 rank：${row.queue_rnk}`);
      }
      if (!asBoolean(row.has_actual_assignment)) {
        throw new Error(`TMK ${date} 存在非实际分配记录：${row.user_id}`);
      }
      if (users.has(row.user_id)) {
        throw new Error(`TMK ${date} 存在重复 UID：${row.user_id}`);
      }
      ranks.add(rank);
      users.add(row.user_id);
    }

    if (!ranks.has(1) || !ranks.has(rows.length) || ranks.size !== rows.length) {
      const rankValues = Array.from(ranks);
      const minRank = Math.min(...rankValues);
      const maxRank = Math.max(...rankValues);
      throw new Error(`TMK ${date} rank 不连续：count=${rows.length}, min=${minRank}, max=${maxRank}, distinct=${ranks.size}`);
    }
  }

  return byDate;
}

async function replaceChunk(client: Client, byDate: Map<string, TmkRecord[]>): Promise<void> {
  await client.query("BEGIN");
  try {
    const dates = Array.from(byDate.keys());
    const existing = await client.query<{ dt: string; row_count: number | string }>(`
      SELECT dt::text,row_count
      FROM allocation_cache_refreshes
      WHERE channel='tmk' AND dt = ANY($1::date[]) AND status='success'
    `, [dates]);
    const existingCounts = new Map(existing.rows.map((row) => [row.dt, Number(row.row_count || 0)]));
    for (const [date, rows] of Array.from(byDate.entries())) {
      const existingCount = existingCounts.get(date) || 0;
      if (rows.length === 0 && existingCount > 0) {
        throw new Error(`TMK ${date} 查询返回0条，已保留原有${existingCount}条缓存`);
      }
    }

    await client.query(
      "DELETE FROM allocation_record_cache WHERE channel='tmk' AND dt = ANY($1::date[])",
      [dates],
    );

    for (const [date, rows] of Array.from(byDate.entries())) {
      for (let offset = 0; offset < rows.length; offset += 1000) {
        const batch = rows.slice(offset, offset + 1000);
        const values: unknown[] = [];
        const placeholders = batch.map((row, index) => {
          const base = index * 11;
          values.push(
            date,
            row.user_id,
            Number(row.queue_rnk),
            nullable(row.lead_channel),
            nullable(row.sales_ldap),
            nullable(row.assigned_at),
            asBoolean(row.has_called),
            asBoolean(row.has_connected),
            Number(row.call_count || 0),
            nullable(row.latest_touch_at),
            asBoolean(row.has_actual_assignment),
          );
          return `('tmk',$${base + 1}::date,$${base + 2},$${base + 3},$${base + 4},$${base + 11},$${base + 5},$${base + 6}::timestamptz,$${base + 7},$${base + 8},$${base + 9},$${base + 10}::timestamptz)`;
        });
        if (placeholders.length > 0) {
          await client.query(`INSERT INTO allocation_record_cache(
            channel,dt,user_id,rank,detail,has_actual_assignment,sales_ldap,assigned_at,
            has_called,has_connected,call_count,latest_touch_at
          ) VALUES ${placeholders.join(",")}`, values);
        }
      }

      await client.query(`
        INSERT INTO allocation_cache_refreshes(channel,dt,status,row_count,refreshed_at,error_message)
        VALUES('tmk',$1::date,'success',$2,NOW(),NULL)
        ON CONFLICT(channel,dt) DO UPDATE SET
          status='success',row_count=EXCLUDED.row_count,refreshed_at=NOW(),error_message=NULL
      `, [date, rows.length]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  if (!process.env.USER_POSTGRESQL_URL) throw new Error("缺少USER_POSTGRESQL_URL");
  if (process.env.ALLOCATION_QUERY_PROVIDER !== "bigdata-mcp" || !process.env.ALLOCATION_BIGDATA_MCP_URL) {
    throw new Error("缺少真实大数据MCP配置，拒绝用 mock/sql-api 重建 TMK 缓存");
  }

  const allDates = datesBetween(startDate, endDate);
  const client = new Client({ connectionString: process.env.USER_POSTGRESQL_URL });
  await client.connect();
  try {
    const summaries: Array<{ start: string; end: string; rows: number }> = [];
    for (const dates of chunkDates(allDates, 7)) {
      const chunkStart = dates[0];
      const chunkEnd = dates[dates.length - 1];
      const result = await queryAllocationRecordsForCache({
        channel: "tmk",
        dateMode: "range",
        startDate: chunkStart,
        endDate: chunkEnd,
      });
      const byDate = validateRecords(result.tmkRecords, dates);
      await replaceChunk(client, byDate);
      summaries.push({ start: chunkStart, end: chunkEnd, rows: result.tmkRecords.length });
      console.log(JSON.stringify(summaries[summaries.length - 1]));
    }
  } finally {
    await client.end();
  }
}

void main();
