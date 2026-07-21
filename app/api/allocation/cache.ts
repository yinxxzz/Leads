import type { Pool, PoolClient } from "pg";
import type { AllocationQueryParams, AllocationQueryResult, Channel } from "./data-source";

type CacheChannel = Exclude<Channel, "all">;
interface CacheRow {
  channel: CacheChannel;
  dt: string;
  user_id: string;
  rank: number;
  detail: string | null;
  has_actual_assignment: boolean;
  sales_ldap: string | null;
  assigned_at: string | null;
  has_called: boolean;
  has_connected: boolean;
  call_count: number;
  latest_touch_at: string | null;
}

function asBoolean(value: boolean | string | number | undefined): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function nullableString(value: string | undefined): string | null {
  if (!value || value === "@pipe_null@" || value.toLowerCase() === "null") return null;
  return value;
}

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
function cacheCutoffDate(): string { return shanghaiDate(-(cacheRetentionDays() - 1)); }
function selectedChannels(channel: Channel): CacheChannel[] { return channel === "all" ? ["bpo", "tmk", "cc"] : [channel]; }
function getDateBounds(params: AllocationQueryParams): { start?: string; end?: string } {
  if (params.dateMode === "specific") return { start: params.date, end: params.date };
  if (params.dateMode === "range") return { start: params.startDate, end: params.endDate };
  return { start: cacheCutoffDate(), end: shanghaiDate() };
}

export interface AllocationCacheStatus {
  channel: CacheChannel;
  latestDataDate: string | null;
  savedAt: string | null;
  rowCount: number;
}

export async function markAllocationCacheRefreshFailed(
  date: string,
  channel: CacheChannel,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error || "刷新缓存失败");
  await getCachePool().query(`INSERT INTO allocation_cache_refreshes(channel,dt,status,row_count,refreshed_at,error_message)
    VALUES($1,$2::date,'failed',0,NOW(),$3)
    ON CONFLICT(channel,dt) DO UPDATE
      SET status='failed',refreshed_at=NOW(),error_message=EXCLUDED.error_message`,
  [channel, date, message.slice(0, 2000)]);
}

export async function getAllocationCacheDateCount(
  date: string,
  channel: CacheChannel,
): Promise<number> {
  const result = await getCachePool().query<{ row_count: number | string }>(
    "SELECT COUNT(*) AS row_count FROM allocation_record_cache WHERE channel=$1 AND dt=$2::date",
    [channel, date],
  );
  return Number(result.rows[0]?.row_count || 0);
}

export async function withAllocationCacheRefreshLock<T>(
  date: string,
  channel: CacheChannel,
  task: () => Promise<T>,
): Promise<T> {
  const client = await getCachePool().connect();
  const lockKey = `allocation-cache:${channel}:${date}`;
  try {
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [lockKey],
    );
    if (!lock.rows[0]?.acquired) {
      throw new Error(`${channel} ${date} 已有刷新任务正在运行`);
    }
    return await task();
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => undefined);
    client.release();
  }
}

export async function getAllocationCacheStatus(): Promise<AllocationCacheStatus[]> {
  if (!isAllocationCacheEnabled()) return [];
  const result = await getCachePool().query<{
    channel: CacheChannel;
    latest_data_date: string | null;
    saved_at: string | null;
    row_count: number | string;
  }>(`
    SELECT DISTINCT ON (channel)
      channel,
      dt AS latest_data_date,
      refreshed_at AS saved_at,
      row_count
    FROM allocation_cache_refreshes
    WHERE status='success' AND row_count > 0
    ORDER BY channel, dt DESC, refreshed_at DESC
  `);
  return result.rows.map((row) => ({
    channel: row.channel,
    latestDataDate: row.latest_data_date,
    savedAt: row.saved_at,
    rowCount: Number(row.row_count || 0),
  }));
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
    SELECT channel,dt,user_id,rank,detail,has_actual_assignment,sales_ldap,
      assigned_at,has_called,has_connected,call_count,latest_touch_at
    FROM allocation_record_cache
    WHERE channel = ANY($1)
      AND ($2::text IS NULL OR user_id=$2)
      AND ($3::date IS NULL OR dt >= $3::date)
      AND ($4::date IS NULL OR dt <= $4::date)
    ORDER BY dt DESC
    LIMIT 10000
  `, [channels, params.uid || null, start || null, end || null]);
  const output: AllocationQueryResult = { bpoRecords: [], tmkRecords: [], ccRecords: [] };
  for (const row of result.rows) {
    const assignment = {
      has_actual_assignment: row.has_actual_assignment,
      sales_ldap: row.sales_ldap || "",
      assigned_at: row.assigned_at || "",
      has_called: row.has_called,
      has_connected: row.has_connected,
      call_count: row.call_count,
      latest_touch_at: row.latest_touch_at || "",
    };
    if (row.channel === "bpo") output.bpoRecords.push({ dt: row.dt, userid: row.user_id, rank: row.rank, userType: row.detail || "", ...assignment });
    else if (row.channel === "tmk") output.tmkRecords.push({ dt: row.dt, user_id: row.user_id, queue_rnk: String(row.rank), lead_channel: row.detail || "", ...assignment });
    else output.ccRecords.push({ dt: row.dt, user_id: row.user_id, final_rank: String(row.rank), business_line_type: row.detail || "", ...assignment });
  }
  return output;
}

function toCacheRows(result: AllocationQueryResult): CacheRow[] {
  return [
    ...result.bpoRecords.map((r): CacheRow => ({ channel: "bpo", dt: r.dt, user_id: String(r.userid), rank: Number(r.rank), detail: r.userType || null, has_actual_assignment: asBoolean(r.has_actual_assignment), sales_ldap: nullableString(r.sales_ldap), assigned_at: nullableString(r.assigned_at), has_called: asBoolean(r.has_called), has_connected: asBoolean(r.has_connected), call_count: Number(r.call_count || 0), latest_touch_at: nullableString(r.latest_touch_at) })),
    ...result.tmkRecords.map((r): CacheRow => ({ channel: "tmk", dt: r.dt, user_id: String(r.user_id), rank: Number(r.queue_rnk), detail: r.lead_channel || null, has_actual_assignment: asBoolean(r.has_actual_assignment), sales_ldap: nullableString(r.sales_ldap), assigned_at: nullableString(r.assigned_at), has_called: asBoolean(r.has_called), has_connected: asBoolean(r.has_connected), call_count: Number(r.call_count || 0), latest_touch_at: nullableString(r.latest_touch_at) })),
    ...result.ccRecords.map((r): CacheRow => ({ channel: "cc", dt: r.dt, user_id: String(r.user_id), rank: Number(r.final_rank), detail: r.business_line_type || null, has_actual_assignment: asBoolean(r.has_actual_assignment), sales_ldap: nullableString(r.sales_ldap), assigned_at: nullableString(r.assigned_at), has_called: asBoolean(r.has_called), has_connected: asBoolean(r.has_connected), call_count: Number(r.call_count || 0), latest_touch_at: nullableString(r.latest_touch_at) })),
  ].filter((row) => row.has_actual_assignment);
}

async function insertRows(client: PoolClient, rows: CacheRow[]): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += 1000) {
    const batch = rows.slice(offset, offset + 1000);
    const values: unknown[] = [];
    const placeholders = batch.map((row, index) => {
      const base = index * 12;
      values.push(row.channel, row.dt, row.user_id, row.rank, row.detail,
        row.has_actual_assignment, row.sales_ldap, row.assigned_at, row.has_called,
        row.has_connected, row.call_count, row.latest_touch_at);
      return `($${base + 1},$${base + 2}::date,$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8}::timestamptz,$${base + 9},$${base + 10},$${base + 11},$${base + 12}::timestamptz)`;
    });
    await client.query(`INSERT INTO allocation_record_cache(
      channel,dt,user_id,rank,detail,has_actual_assignment,sales_ldap,assigned_at,
      has_called,has_connected,call_count,latest_touch_at
    ) VALUES ${placeholders.join(",")}`, values);
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
  const counts = {
    bpo: rows.filter((row) => row.channel === "bpo").length,
    tmk: rows.filter((row) => row.channel === "tmk").length,
    cc: rows.filter((row) => row.channel === "cc").length,
  };
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
