import { NextResponse } from "next/server";
import { cleanupExpiredAllocationCache, markAllocationCacheRefreshFailed, replaceAllocationCacheDate } from "../../cache";
import { queryAllocationRecordsForCache } from "../../data-source";
import type { Channel } from "../../data-source";

type RefreshChannel = Exclude<Channel, "all">;

function channelRecordCount(
  records: Awaited<ReturnType<typeof queryAllocationRecordsForCache>>,
  channel: RefreshChannel,
): number {
  if (channel === "bpo") return records.bpoRecords.length;
  if (channel === "tmk") return records.tmkRecords.length;
  return records.ccRecords.length;
}

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
    const body = await request.json().catch(() => ({})) as {
      date?: string;
      startDate?: string;
      endDate?: string;
      channel?: Channel;
    };
    const start = body.startDate || body.date || yesterdayInShanghai();
    const end = body.endDate || body.date || start;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
      return NextResponse.json({ error: "日期格式不正确" }, { status: 400 });
    }
    const dates = datesBetween(start, end);
    if (dates.length > 31) {
      return NextResponse.json({ error: "单次最多刷新 31 天" }, { status: 400 });
    }
    const channel = body.channel || "all";
    if (!["all", "bpo", "tmk", "cc"].includes(channel)) {
      return NextResponse.json({ error: "channel 只能是 all / bpo / tmk / cc" }, { status: 400 });
    }
    const channels: RefreshChannel[] = channel === "all"
      ? ["bpo", "tmk", "cc"]
      : [channel];

    const refreshed = [];
    const failed: Array<{ date: string; channel: RefreshChannel; error: string }> = [];
    for (const date of dates) {
      for (const currentChannel of channels) {
        try {
          const records = await queryAllocationRecordsForCache({
            channel: currentChannel,
            dateMode: "specific",
            date,
          });
          if (channelRecordCount(records, currentChannel) === 0) {
            throw new Error(`${currentChannel} ${date} 返回0条，已保留原缓存`);
          }
          refreshed.push({
            date,
            channel: currentChannel,
            ...await replaceAllocationCacheDate(date, records, [currentChannel]),
          });
        } catch (error) {
          await markAllocationCacheRefreshFailed(date, currentChannel, error);
          failed.push({
            date,
            channel: currentChannel,
            error: error instanceof Error ? error.message : "刷新缓存失败",
          });
        }
      }
    }
    const cleanup = await cleanupExpiredAllocationCache();
    return NextResponse.json(
      { success: failed.length === 0, refreshed, failed, cleanup },
      { status: failed.length === 0 ? 200 : 500 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "刷新缓存失败" },
      { status: 500 },
    );
  }
}
