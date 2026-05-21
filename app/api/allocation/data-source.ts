import {
  mockBpoRecords,
  mockTmkRecords,
} from "./mock-data";
import type { BpoRecord, TmkRecord } from "./mock-data";

export type Channel = "all" | "bpo" | "tmk";
export type DateMode = "specific" | "range" | "all_time";

export interface AllocationQueryParams {
  uid?: string;
  channel: Channel;
  dateMode: DateMode;
  date?: string;
  startDate?: string;
  endDate?: string;
}

export interface AllocationQueryResult {
  bpoRecords: BpoRecord[];
  tmkRecords: TmkRecord[];
}

type QueryProvider = "mock" | "sql-api" | "bigdata-mcp";

interface QueryContext {
  catalog: string;
  database: string;
  name: string;
}

function getQueryProvider(): QueryProvider {
  const provider = process.env.ALLOCATION_QUERY_PROVIDER;

  if (provider === "bigdata-mcp" || provider === "sql-api" || provider === "mock") {
    return provider;
  }

  if (process.env.ALLOCATION_BIGDATA_MCP_URL) {
    return "bigdata-mcp";
  }

  if (process.env.ALLOCATION_SQL_API_URL) {
    return "sql-api";
  }

  return "mock";
}

function getSqlApiTimeoutMs(): number {
  const timeout = Number(process.env.ALLOCATION_SQL_API_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 30000;
}

function getUseMockFallback(): boolean {
  return process.env.ALLOCATION_USE_MOCK !== "false";
}

function assertSafeUid(uid?: string): void {
  if (uid && !/^\d+$/.test(uid)) {
    throw new Error("uid 格式不正确，请输入纯数字");
  }
}

function assertSafeDate(date?: string): void {
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("date 格式必须为 YYYY-MM-DD");
  }
}

function assertSafeDateRange(startDate?: string, endDate?: string): void {
  assertSafeDate(startDate);
  assertSafeDate(endDate);

  if (!startDate || !endDate) {
    throw new Error("时间段导出时 startDate 和 endDate 不能为空");
  }
}

function buildDateCondition(params: AllocationQueryParams, dateExpression = "dt"): string {
  if (params.dateMode === "all_time") {
    return "";
  }

  if (params.dateMode === "specific") {
    if (!params.date) {
      throw new Error("指定日期模式下 date 不能为空");
    }

    return `  and ${dateExpression} = '${params.date}'`;
  }

  if (!params.startDate || !params.endDate) {
    throw new Error("时间段导出时 startDate 和 endDate 不能为空");
  }

  return `  and ${dateExpression} >= '${params.startDate}' and ${dateExpression} <= '${params.endDate}'`;
}

export function buildBpoSql(params: AllocationQueryParams): string {
  const uidCondition = params.uid ? `  and user_id = '${params.uid}'` : "";
  const bpoAssignDateExpression = "date_add(to_date(dt), 1)";
  const dateCondition = buildDateCondition(params, bpoAssignDateExpression);

  return `
select
    coalesce(default.encrypt_with_passid(call_user_type,'00stuvwx7a'), '0') as phone
    ,user_id as userid
    ,'externalLead' as leadType
    ,${bpoAssignDateExpression} as dt
    ,'unset' as grade
    ,case when channel='百科存量' then 'pediaStock' else channel end as userType
    ,row_number() over(order by rand(2026)) as rank
    ,'unset' as extraInfo
from dw_conan_ads.ads_eng_tmk_hunt_side_user_detail_di_no_sensitive_view
where call_user_type != '0'
${uidCondition}
${dateCondition}
order by ${bpoAssignDateExpression} desc
`.trim();
}

export function buildTmkSql(params: AllocationQueryParams): string {
  const uidCondition = params.uid ? `  and user_id = '${params.uid}'` : "";
  const dateCondition = buildDateCondition(params);

  return `
SELECT
    dt
    ,user_id
    ,lead_channel
    ,hunt_lead_type
    ,grade
    ,queue_rnk
FROM dw_ads.ads_eng_tmk_hunt_all_user_detail_with_grade_di_no_sensitive_view
WHERE 1 = 1
${uidCondition}
${dateCondition}
ORDER BY
    dt DESC
    ,CAST(queue_rnk AS BIGINT)
LIMIT 100000
`.trim();
}

function normalizeRows<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const data = payload as {
    columnNames?: string[];
    rows?: T[];
    data?: T[];
    results?: unknown[][];
    result?: { columnNames?: string[]; rows?: T[]; data?: T[]; results?: unknown[][] };
    raw_response?: { data?: { columnNames?: string[]; rows?: T[]; results?: unknown[][] } };
  };

  if (data.columnNames && data.results) {
    return rowsToObjects<T>(data.columnNames, data.results);
  }

  if (data.result?.columnNames && data.result.results) {
    return rowsToObjects<T>(data.result.columnNames, data.result.results);
  }

  if (data.raw_response?.data?.columnNames && data.raw_response.data.results) {
    return rowsToObjects<T>(data.raw_response.data.columnNames, data.raw_response.data.results);
  }

  return data.rows
    || data.data
    || data.result?.rows
    || data.result?.data
    || data.raw_response?.data?.rows
    || (data.raw_response?.data?.results
      ? rowsToObjects<T>(data.raw_response.data.columnNames || [], data.raw_response.data.results)
      : [])
    || [];
}

function rowsToObjects<T>(columnNames: string[], rows: unknown[][]): T[] {
  return rows.map((row) => {
    return columnNames.reduce<Record<string, unknown>>((record, columnName, index) => {
      record[columnName] = row[index];
      return record;
    }, {});
  }) as T[];
}

async function executeSqlApi<T>(sql: string, context: QueryContext): Promise<T[]> {
  const apiUrl = process.env.ALLOCATION_SQL_API_URL;
  if (!apiUrl) {
    throw new Error("未配置 ALLOCATION_SQL_API_URL");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getSqlApiTimeoutMs());

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.ALLOCATION_SQL_API_TOKEN
          ? { Authorization: `Bearer ${process.env.ALLOCATION_SQL_API_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        sql,
        name: context.name,
        catalog: context.catalog,
        database: context.database,
        engine_type: "Spark",
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      const errorPayload = payload as { error?: string; message?: string };
      throw new Error(errorPayload.error || errorPayload.message || "SQL 查询失败");
    }

    return normalizeRows<T>(payload);
  } finally {
    clearTimeout(timeout);
  }
}

async function executeBigDataMcp<T>(sql: string, context: QueryContext): Promise<T[]> {
  const apiUrl = process.env.ALLOCATION_BIGDATA_MCP_URL;
  if (!apiUrl) {
    throw new Error("未配置 ALLOCATION_BIGDATA_MCP_URL");
  }

  const timeoutSeconds = Number(process.env.ALLOCATION_BIGDATA_MCP_TIMEOUT_SECONDS || 60);
  // 外层 AbortController 比 MCP 内部超时多 30s 作为兜底
  const controller = new AbortController();
  const abortTimeout = setTimeout(() => controller.abort(), (timeoutSeconds + 30) * 1000);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        ...(process.env.ALLOCATION_BIGDATA_MCP_TOKEN
          ? { Authorization: `Bearer ${process.env.ALLOCATION_BIGDATA_MCP_TOKEN}` }
          : {}),
        // 启用 adhoc 能力组
        "X-Tool-Groups": "adhoc",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "adhoc_submitQuery",
          arguments: {
            sql,
            engine: "Spark",
            catalog: context.catalog,
            database: context.database,
            timeoutSeconds,
          },
        },
      }),
      signal: controller.signal,
    });

    const payload = await response.json() as {
      jsonrpc: string;
      id: number;
      result?: {
        content?: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      error?: { message?: string };
    };

    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message || "大数据 MCP 请求失败");
    }

    if (payload.result?.isError) {
      const textContent = payload.result.content?.[0]?.text || "大数据 MCP 查询失败";
      throw new Error(textContent);
    }

    const textContent = payload.result?.content?.[0]?.text;
    if (!textContent) {
      throw new Error("大数据 MCP 返回内容为空");
    }

    const inner = JSON.parse(textContent) as {
      status: string;
      message?: string;
      data?: {
        status: string;
        message?: string;
        columnNames?: string[];
        columnTypes?: string[];
        rows?: unknown[][];
        rowCount?: number;
      };
    };

    if (inner.status !== "SUCCESS" || inner.data?.status === "失败") {
      throw new Error(inner.message || inner.data?.message || "大数据 MCP 查询失败");
    }

    const { columnNames, rows } = inner.data || {};
    if (columnNames && rows) {
      return rowsToObjects<T>(columnNames, rows);
    }

    return [];
  } finally {
    clearTimeout(abortTimeout);
  }
}

async function executeBigDataMcpDownloadUrl(sql: string, context: QueryContext): Promise<string> {
  const apiUrl = process.env.ALLOCATION_BIGDATA_MCP_URL;
  if (!apiUrl) {
    throw new Error("未配置 ALLOCATION_BIGDATA_MCP_URL");
  }

  const timeoutSeconds = Number(process.env.ALLOCATION_BIGDATA_MCP_TIMEOUT_SECONDS || 60);

  const mcpHeaders = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "X-Tool-Groups": "adhoc",
    ...(process.env.ALLOCATION_BIGDATA_MCP_TOKEN
      ? { Authorization: `Bearer ${process.env.ALLOCATION_BIGDATA_MCP_TOKEN}` }
      : {}),
  };

  // Step 1: 提交查询，立即返回 queryId（timeoutSeconds=0）
  const submitRes = await fetch(apiUrl, {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "adhoc_submitQuery",
        arguments: {
          sql,
          engine: "Spark",
          catalog: context.catalog,
          database: context.database,
          timeoutSeconds: 0,
        },
      },
    }),
  });

  const submitPayload = await submitRes.json() as {
    result?: { content?: Array<{ type: string; text: string }>; isError?: boolean };
    error?: { message?: string };
  };

  if (!submitRes.ok || submitPayload.error) {
    throw new Error(submitPayload.error?.message || "提交查询失败");
  }

  const submitText = submitPayload.result?.content?.[0]?.text;
  if (!submitText) throw new Error("提交查询返回内容为空");

  const submitInner = JSON.parse(submitText) as {
    status: string;
    message?: string;
    data?: number | { queryId?: number; status?: string; message?: string };
  };

  // timeoutSeconds=0 时 data 直接是 queryId 数字；否则是对象
  const queryId: number | undefined =
    typeof submitInner.data === "number"
      ? submitInner.data
      : (submitInner.data as { queryId?: number })?.queryId;

  if (!queryId) {
    throw new Error(submitInner.message || "未获取到 queryId");
  }

  // Step 2: 轮询等待查询完成
  const pollStart = Date.now();
  const pollDeadline = pollStart + timeoutSeconds * 1000;
  let queryDone = false;

  while (Date.now() < pollDeadline) {
    await new Promise((r) => setTimeout(r, 3000));

    const pollRes = await fetch(apiUrl, {
      method: "POST",
      headers: mcpHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "adhoc_getQueryResult",
          arguments: { queryId, timeoutSeconds: 5 },
        },
      }),
    });

    const pollPayload = await pollRes.json() as {
      result?: { content?: Array<{ type: string; text: string }>; isError?: boolean };
      error?: { message?: string };
    };

    const pollText = pollPayload.result?.content?.[0]?.text;
    if (!pollText) continue;

    const pollInner = JSON.parse(pollText) as {
      status: string;
      message?: string;
      data?: { status?: string; message?: string; stackTrace?: string };
    };

    if (pollInner.data?.status === "失败") {
      throw new Error(pollInner.data.message || pollInner.message || "查询失败");
    }

    if (pollInner.status === "SUCCESS" && pollInner.data?.status !== "运行中") {
      queryDone = true;
      break;
    }
  }

  if (!queryDone) {
    throw new Error("查询超时，请缩短时间范围后重试");
  }

  // Step 3: 获取下载 URL
  const dlRes = await fetch(apiUrl, {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "adhoc_getQueryDownloadUrl",
        arguments: { queryId, convertToExcel: false },
      },
    }),
  });

  const dlPayload = await dlRes.json() as {
    result?: { content?: Array<{ type: string; text: string }>; isError?: boolean };
    error?: { message?: string };
  };

  const dlText = dlPayload.result?.content?.[0]?.text;
  if (!dlText) throw new Error("获取下载链接失败");

  const dlInner = JSON.parse(dlText) as {
    status: string;
    message?: string;
    data?: string | { downloadUrl?: string; url?: string };
  };

  // data 直接是字符串 URL，或者是对象
  const downloadUrl = typeof dlInner.data === "string"
    ? dlInner.data
    : (dlInner.data?.downloadUrl || dlInner.data?.url);

  if (!downloadUrl) {
    throw new Error(dlInner.message || "未获取到下载链接");
  }

  return downloadUrl;
}

export async function getExportDownloadUrl(sql: string, context: QueryContext): Promise<string> {
  const provider = getQueryProvider();
  if (provider !== "bigdata-mcp") {
    throw new Error("导出完整数据仅支持 bigdata-mcp 模式");
  }
  return executeBigDataMcpDownloadUrl(sql, context);
}

async function executeSql<T>(sql: string, context: QueryContext): Promise<T[]> {
  const provider = getQueryProvider();

  if (provider === "bigdata-mcp") {
    return executeBigDataMcp<T>(sql, context);
  }

  if (provider === "sql-api") {
    return executeSqlApi<T>(sql, context);
  }

  throw new Error("当前查询提供方为 mock，未配置真实查询服务");
}

function queryMockRecords(params: AllocationQueryParams): AllocationQueryResult {
  const dateMatched = (dt: string) => {
    if (params.dateMode === "specific" && params.date) {
      return dt === params.date;
    }

    if (params.dateMode === "range" && params.startDate && params.endDate) {
      return dt >= params.startDate && dt <= params.endDate;
    }

    return true;
  };

  const bpoRecords = params.channel === "tmk"
    ? []
    : mockBpoRecords.filter((record) => {
      const uidMatched = params.uid ? record.userid === params.uid : true;
      return uidMatched && dateMatched(record.dt);
    });

  const tmkRecords = params.channel === "bpo"
    ? []
    : mockTmkRecords.filter((record) => {
      const uidMatched = params.uid ? record.user_id === params.uid : true;
      return uidMatched && dateMatched(record.dt);
    });

  return {
    bpoRecords,
    tmkRecords,
  };
}

export async function queryAllocationRecords(
  params: AllocationQueryParams,
): Promise<AllocationQueryResult> {
  assertSafeUid(params.uid);
  assertSafeDate(params.date);
  if (params.dateMode === "range") {
    assertSafeDateRange(params.startDate, params.endDate);
  }

  if (getQueryProvider() === "mock") {
    return queryMockRecords(params);
  }

  try {
    const [bpoRecords, tmkRecords] = await Promise.all([
      params.channel === "tmk"
        ? Promise.resolve([])
        : executeSql<BpoRecord>(buildBpoSql(params), {
          catalog: "hive_f04",
          database: "dw_conan_ads",
          name: "allocation_bpo_query",
        }),
      params.channel === "bpo"
        ? Promise.resolve([])
        : executeSql<TmkRecord>(buildTmkSql(params), {
          catalog: "hive_f04",
          database: "dw_ads",
          name: "allocation_tmk_query",
        }),
    ]);

    return {
      bpoRecords,
      tmkRecords,
    };
  } catch (error) {
    if (getUseMockFallback()) {
      console.warn("[allocation] SQL 查询失败，已回退 mock 数据", error);
      return queryMockRecords(params);
    }

    throw error;
  }
}
