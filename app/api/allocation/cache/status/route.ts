import { NextResponse } from "next/server";
import { getAllocationCacheStatus } from "../../cache";

export async function GET() {
  try {
    return NextResponse.json({ channels: await getAllocationCacheStatus() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取缓存状态失败" },
      { status: 500 },
    );
  }
}
