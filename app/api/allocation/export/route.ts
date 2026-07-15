import { NextResponse } from "next/server";
import {
  queryAllocationRecords,
  getExportDownloadUrl,
  buildBpoSql,
  buildCcSql,
  buildTmkSql,
} from "../data-source";
import type { Channel, DateMode, AllocationQueryParams } from "../data-source";

interface ExportRequest {
  uid?: string;
  channel: Channel;
  dateMode: DateMode;
  date?: string;
  startDate?: string;
  endDate?: string;
}

interface CsvRow {
  channel: string;
  dt: string;
  uid: string;
  rank: string;
  detail: string;
}

function escapeCsvValue(value: string): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(rows: CsvRow[]): string {
  const headers = [
    "渠道",
    "分配日期",
    "用户UID",
    "排名",
    "用户类型/线索渠道/业务线类型",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        escapeCsvValue(row.channel),
        escapeCsvValue(row.dt),
        escapeCsvValue(row.uid),
        escapeCsvValue(row.rank),
        escapeCsvValue(row.detail),
      ].join(",")
    ),
  ];

  return "\ufeff" + lines.join("\n");
}

export async function POST(request: Request) {
  try {
    const body: ExportRequest = await request.json();
    const { uid, channel, dateMode, date, startDate, endDate } = body;

    // Validation
    if (uid && !/^\d+$/.test(uid.trim())) {
      return NextResponse.json(
        { error: "uid 格式不正确，请输入纯数字" },
        { status: 400 }
      );
    }

    if (!["all", "bpo", "tmk", "cc"].includes(channel)) {
      return NextResponse.json(
        { error: "channel 只能是 all / bpo / tmk / cc" },
        { status: 400 }
      );
    }

    if (!["specific", "range", "all_time"].includes(dateMode)) {
      return NextResponse.json(
        { error: "dateMode 只能是 specific / range / all_time" },
        { status: 400 }
      );
    }

    if (dateMode === "specific" && !date) {
      return NextResponse.json(
        { error: "指定日期模式下 date 不能为空" },
        { status: 400 }
      );
    }

    if (dateMode === "specific" && date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "date 格式必须为 YYYY-MM-DD" },
        { status: 400 }
      );
    }

    if (dateMode === "range") {
      if (!startDate || !endDate) {
        return NextResponse.json(
          { error: "时间段导出时 startDate 和 endDate 不能为空" },
          { status: 400 }
        );
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return NextResponse.json(
          { error: "startDate 和 endDate 格式必须为 YYYY-MM-DD" },
          { status: 400 }
        );
      }
    }

    if (dateMode === "all_time") {
      return NextResponse.json(
        { error: "导出必须选择某一天或最长 14 天时间段" },
        { status: 400 }
      );
    }

    const rangeStart = dateMode === "specific" ? date : startDate;
    const rangeEnd = dateMode === "specific" ? date : endDate;
    if (!rangeStart || !rangeEnd) {
      return NextResponse.json(
        { error: "导出日期不能为空" },
        { status: 400 }
      );
    }

    const start = new Date(rangeStart);
    const end = new Date(rangeEnd);
    const oneDayMs = 24 * 60 * 60 * 1000;
    const dayCount = Math.floor((end.getTime() - start.getTime()) / oneDayMs) + 1;

    if (start > end) {
      return NextResponse.json(
        { error: "开始日期不能晚于结束日期" },
        { status: 400 }
      );
    }

    if (dayCount > 14) {
      return NextResponse.json(
        { error: "导出时间范围最多支持 14 天" },
        { status: 400 }
      );
    }

    const trimmedUid = uid?.trim() || "";
    const params: AllocationQueryParams = {
      uid: trimmedUid || undefined,
      channel,
      dateMode,
      date,
      startDate,
      endDate,
    };

    const channelLabel = channel === "all" ? "all" : channel;
    const uidLabel = trimmedUid || "all";
    const dateLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart}_${rangeEnd}`;
    const filename = `分配明细_${channelLabel}_${uidLabel}_${dateLabel}.csv`;

    // bigdata-mcp 模式：返回下载 URL，前端直接触发下载（完整数据，无100条限制）
    if (process.env.ALLOCATION_QUERY_PROVIDER === "bigdata-mcp" || process.env.ALLOCATION_BIGDATA_MCP_URL) {
      if (channel === "bpo") {
        const downloadUrl = await getExportDownloadUrl(buildBpoSql(params), {
          catalog: "hive_f04", database: "dw_conan_ads", name: "export_bpo",
        });
        return NextResponse.json({ downloadUrl });
      }

      if (channel === "tmk") {
        const downloadUrl = await getExportDownloadUrl(buildTmkSql(params), {
          catalog: "hive_f04", database: "dw_ads", name: "export_tmk",
        });
        return NextResponse.json({ downloadUrl });
      }

      if (channel === "cc") {
        const downloadUrl = await getExportDownloadUrl(buildCcSql(params), {
          catalog: "hive_f04", database: "dw_ads", name: "export_cc",
        });
        return NextResponse.json({ downloadUrl });
      }

      // channel === "all"：并发获取三个链接，都返给前端
      const [bpoDownloadUrl, tmkDownloadUrl, ccDownloadUrl] = await Promise.all([
        getExportDownloadUrl(buildBpoSql(params), { catalog: "hive_f04", database: "dw_conan_ads", name: "export_bpo" }),
        getExportDownloadUrl(buildTmkSql(params), { catalog: "hive_f04", database: "dw_ads", name: "export_tmk" }),
        getExportDownloadUrl(buildCcSql(params), { catalog: "hive_f04", database: "dw_ads", name: "export_cc" }),
      ]);
      return NextResponse.json({
        downloadUrl: bpoDownloadUrl,
        tmkDownloadUrl,
        ccDownloadUrl,
        downloadUrls: [
          { channel: "BPO", url: bpoDownloadUrl },
          { channel: "TMK", url: tmkDownloadUrl },
          { channel: "CC", url: ccDownloadUrl },
        ],
      });
    }

    // 非 bigdata-mcp 模式（mock / sql-api）走原有逻辑
    const csvRows: CsvRow[] = [];
    const { bpoRecords, tmkRecords, ccRecords } = await queryAllocationRecords(params);

    if (channel === "all" || channel === "bpo") {
      bpoRecords.forEach((r) => {
        csvRows.push({
          channel: "BPO",
          dt: r.dt,
          uid: r.userid,
          rank: String(r.rank),
          detail: r.userType,
        });
      });
    }

    if (channel === "all" || channel === "tmk") {
      tmkRecords.forEach((r) => {
        csvRows.push({
          channel: "TMK",
          dt: r.dt,
          uid: r.user_id,
          rank: r.queue_rnk,
          detail: r.lead_channel,
        });
      });
    }

    if (channel === "all" || channel === "cc") {
      ccRecords.forEach((r) => {
        csvRows.push({
          channel: "CC",
          dt: r.dt,
          uid: r.user_id,
          rank: r.final_rank,
          detail: r.business_line_type,
        });
      });
    }

    if (csvRows.length === 0) {
      return NextResponse.json(
        { error: "当前条件下暂无可导出的明细" },
        { status: 404 }
      );
    }

    const csv = buildCsv(csvRows);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "请求参数解析失败" },
      { status: 400 }
    );
  }
}
