import { NextResponse } from "next/server";
import { cleanupExpiredAllocationCache, replaceAllocationCacheDate } from "../../cache";
import { queryAllocationRecordsForCache } from "../../data-source";

function yesterdayInShanghai(): string {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  now.setUTCDate(now.getUTCDate() - 1);
  return now.toISOString().slice(0, 10);
}

function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export async function POST(request: Request) {
  const configuredToken = process.env.ALLOCATION_CACHE_REFRESH_TOKEN;
  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configuredToken || suppliedToken !== configuredToken) {
    return NextResponse.json({ error: "无权刷新缓存" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({})) as { date?: string; startDate?: string; endDate?: string };
    const start = body.startDate || body.date || yesterdayInShanghai();
    const end = body.endDate || body.date || start;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
      return NextResponse.json({ error: "日期格式不正确" }, { status: 400 });
    }
    const dates = datesBetween(start, end);
    if (dates.length > 31) {
      return NextResponse.json({ error: "单次最多刷新 31 天" }, { status: 400 });
    }

    const refreshed = [];
    for (const date of dates) {
      const records = await queryAllocationRecordsForCache({
        channel: "all",
        dateMode: "specific",
        date,
      });
      refreshed.push({ date, ...await replaceAllocationCacheDate(date, records) });
    }
    const cleanup = await cleanupExpiredAllocationCache();
    return NextResponse.json({ success: true, refreshed, cleanup });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "刷新缓存失败" },
      { status: 500 },
    );
  }
}
