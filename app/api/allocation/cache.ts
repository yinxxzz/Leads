import type { Pool, PoolClient } from "pg";
import type { AllocationQueryParams, AllocationQueryResult, Channel } from "./data-source";

type CacheChannel = Exclude<Channel, "all">;
interface CacheRow { channel: CacheChannel; dt: string; user_id: string; rank: number; detail: string | null }

let cachePool: Pool | null = null;
function getCachePool(): Pool {
  if (cachePool) return cachePool;
  if (!process.env.USER_POSTGRESQL_URL) throw new Error("缺少USER_POSTGRESQL_URL，无法使用分配缓存");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require("pg") as typeof import("pg");
  pg.types.setTypeParser(1082, (value: string) => value);
  cachePool = new pg.Pool({
    connectionString: process.env.USER_POSTGRESQL_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  return cachePool;
}

export function isAllocationCacheEnabled(): boolean { return process.env.ALLOCATION_CACHE_ENABLED === "true"; }
export function cacheRetentionDays(): number {
  const value = Number(process.env.ALLOCATION_CACHE_RETENTION_DAYS || 90);
  return Number.isInteger(value) && value > 0 ? value : 90;
}
function shanghaiDate(offsetDays = 0): string {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
function cacheCutoffDate(): string { return shanghaiDate(-cacheRetentionDays()); }
function selectedChannels(channel: Channel): CacheChannel[] { return channel === "all" ? ["bpo", "tmk", "cc"] : [channel]; }
function getDateBounds(params: AllocationQueryParams): { start?: string; end?: string } {
  if (params.dateMode === "specific") return { start: params.date, end: params.date };
  if (params.dateMode === "range") return { start: params.startDate, end: params.endDate };
  return { start: cacheCutoffDate(), end: shanghaiDate(-1) };
}

export async function queryCachedAllocationRecords(params: AllocationQueryParams): Promise<AllocationQueryResult | null> {
  if (!isAllocationCacheEnabled()) return null;
  const pool = getCachePool();
  const channels = selectedChannels(params.channel);
  const { start, end } = getDateBounds(params);
  const coverage = await pool.query<{ channel: CacheChannel }>(`
    SELECT DISTINCT channel FROM allocation_cache_refreshes
    WHERE channel = ANY($1) AND status='success'
      AND ($2::date IS NULL OR dt >= $2::date)
      AND ($3::date IS NULL OR dt <= $3::date)
  `, [channels, start || null, end || null]);
  const covered = new Set(coverage.rows.map((row) => row.channel));
  if (channels.some((channel) => !covered.has(channel))) return null;

  const result = await pool.query<CacheRow>(`
    SELECT channel,dt,user_id,rank,detail FROM allocation_record_cache
    WHERE channel = ANY($1)
      AND ($2::text IS NULL OR user_id=$2)
      AND ($3::date IS NULL OR dt >= $3::date)
      AND ($4::date IS NULL OR dt <= $4::date)
    ORDER BY dt DESC
    LIMIT 10000
  `, [channels, params.uid || null, start || null, end || null]);
  const output: AllocationQueryResult = { bpoRecords: [], tmkRecords: [], ccRecords: [] };
  for (const row of result.rows) {
    if (row.channel === "bpo") output.bpoRecords.push({ dt: row.dt, userid: row.user_id, rank: row.rank, userType: row.detail || "" });
    else if (row.channel === "tmk") output.tmkRecords.push({ dt: row.dt, user_id: row.user_id, queue_rnk: String(row.rank), lead_channel: row.detail || "" });
    else output.ccRecords.push({ dt: row.dt, user_id: row.user_id, final_rank: String(row.rank), business_line_type: row.detail || "" });
  }
  return output;
}

function toCacheRows(result: AllocationQueryResult): CacheRow[] {
  return [
    ...result.bpoRecords.map((r): CacheRow => ({ channel: "bpo", dt: r.dt, user_id: String(r.userid), rank: Number(r.rank), detail: r.userType || null })),
    ...result.tmkRecords.map((r): CacheRow => ({ channel: "tmk", dt: r.dt, user_id: String(r.user_id), rank: Number(r.queue_rnk), detail: r.lead_channel || null })),
    ...result.ccRecords.map((r): CacheRow => ({ channel: "cc", dt: r.dt, user_id: String(r.user_id), rank: Number(r.final_rank), detail: r.business_line_type || null })),
  ];
}

async function insertRows(client: PoolClient, rows: CacheRow[]): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += 1000) {
    const batch = rows.slice(offset, offset + 1000);
    const values: unknown[] = [];
    const placeholders = batch.map((row, index) => {
      const base = index * 5;
      values.push(row.channel, row.dt, row.user_id, row.rank, row.detail);
      return `($${base + 1},$${base + 2}::date,$${base + 3},$${base + 4},$${base + 5})`;
    });
    await client.query(`INSERT INTO allocation_record_cache(channel,dt,user_id,rank,detail) VALUES ${placeholders.join(",")}`, values);
  }
}

export async function replaceAllocationCacheDate(
  date: string,
  result: AllocationQueryResult,
  channels: CacheChannel[] = ["bpo", "tmk", "cc"],
) {
  const pool = getCachePool();
  const client = await pool.connect();
  const rows = toCacheRows(result);
  const counts = { bpo: result.bpoRecords.length, tmk: result.tmkRecords.length, cc: result.ccRecords.length };
  try {
    await client.query("BEGIN");
    for (const channel of channels) {
      await client.query("DELETE FROM allocation_record_cache WHERE channel=$1 AND dt=$2::date", [channel, date]);
      await insertRows(client, rows.filter((row) => row.channel === channel));
      await client.query(`INSERT INTO allocation_cache_refreshes(channel,dt,status,row_count,refreshed_at,error_message)
        VALUES($1,$2::date,'success',$3,NOW(),NULL)
        ON CONFLICT(channel,dt) DO UPDATE SET status='success',row_count=EXCLUDED.row_count,refreshed_at=NOW(),error_message=NULL`,
      [channel, date, counts[channel]]);
    }
    await client.query("COMMIT");
    return {
      total: channels.reduce((sum, channel) => sum + counts[channel], 0),
      counts: Object.fromEntries(channels.map((channel) => [channel, counts[channel]])),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function cleanupExpiredAllocationCache() {
  const pool = getCachePool();
  const cutoff = cacheCutoffDate();
  const deleted = await pool.query("DELETE FROM allocation_record_cache WHERE dt < $1::date", [cutoff]);
  await pool.query("DELETE FROM allocation_cache_refreshes WHERE dt < $1::date", [cutoff]);
  return { cutoff, deleted: deleted.rowCount };
}
