import { NextResponse } from "next/server";
import {
  queryAllocationRecords,
} from "../data-source";
import type { Channel, DateMode } from "../data-source";

interface QueryRequest {
  uid: string;
  channel: Channel;
  dateMode: DateMode;
  date?: string;
}

export async function POST(request: Request) {
  try {
    const body: QueryRequest = await request.json();
    const { uid, channel, dateMode, date } = body;

    // Parameter validation
    if (!uid || !uid.trim()) {
      return NextResponse.json(
        { error: "uid 不能为空" },
        { status: 400 }
      );
    }

    if (!/^\d+$/.test(uid.trim())) {
      return NextResponse.json(
        { error: "uid 格式不正确，请输入纯数字" },
        { status: 400 }
      );
    }

    if (!["all", "bpo", "tmk"].includes(channel)) {
      return NextResponse.json(
        { error: "channel 只能是 all / bpo / tmk" },
        { status: 400 }
      );
    }

    if (!["specific", "range", "all_time"].includes(dateMode)) {
      return NextResponse.json(
        { error: "dateMode 只能是 specific / range / all_time" },
        { status: 400 }
      );
    }

    if (dateMode === "specific") {
      if (!date) {
        return NextResponse.json(
          { error: "指定日期模式下 date 不能为空" },
          { status: 400 }
        );
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json(
          { error: "date 格式必须为 YYYY-MM-DD" },
          { status: 400 }
        );
      }
    }

    const { bpoRecords, tmkRecords } = await queryAllocationRecords({
      uid: uid.trim(),
      channel,
      dateMode,
      date,
    });

    // Calculate summary
    const allDates = [
      ...bpoRecords.map((r) => r.dt),
      ...tmkRecords.map((r) => r.dt),
    ]
      .filter(Boolean)
      .sort()
      .reverse();

    const hasAllocation = bpoRecords.length > 0 || tmkRecords.length > 0;
    const latestDt = allDates[0] || "-";

    return NextResponse.json({
      uid: uid.trim(),
      hasAllocation,
      latestDt,
      summary: {
        bpoCount: bpoRecords.length,
        tmkCount: tmkRecords.length,
      },
      bpoRecords,
      tmkRecords,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "请求参数解析失败" },
      { status: 400 }
    );
  }
}
