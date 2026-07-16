"use client";

import { useState, useCallback, useEffect } from "react";
import { Search, Download, RotateCcw } from "lucide-react";

// Types
interface BpoRecord {
  dt: string;
  userid: string;
  userType: string;
  rank: number;
  has_actual_assignment?: boolean | string | number;
  sales_ldap?: string;
  assigned_at?: string;
  has_called?: boolean | string | number;
  has_connected?: boolean | string | number;
  call_count?: number | string;
  latest_touch_at?: string;
}

interface TmkRecord {
  dt: string;
  user_id: string;
  lead_channel: string;
  queue_rnk: string;
  has_actual_assignment?: boolean | string | number;
  sales_ldap?: string;
  assigned_at?: string;
  has_called?: boolean | string | number;
  has_connected?: boolean | string | number;
  call_count?: number | string;
  latest_touch_at?: string;
}

interface CcRecord {
  dt: string;
  user_id: string;
  final_rank: string;
  business_line_type: string;
  has_actual_assignment?: boolean | string | number;
  sales_ldap?: string;
  assigned_at?: string;
  has_called?: boolean | string | number;
  has_connected?: boolean | string | number;
  call_count?: number | string;
  latest_touch_at?: string;
}

interface QueryResult {
  uid: string;
  hasAllocation: boolean;
  hasPoolEntry: boolean;
  hasActualAssignment: boolean;
  hasCalled: boolean;
  hasConnected: boolean;
  latestDt: string;
  summary: {
    bpoCount: number;
    tmkCount: number;
    ccCount: number;
  };
  bpoRecords: BpoRecord[];
  tmkRecords: TmkRecord[];
  ccRecords: CcRecord[];
  dataSource: "cache" | "warehouse";
  rangeLabel: string;
}

type Channel = "all" | "bpo" | "tmk" | "cc";
type Tab = "bpo" | "tmk" | "cc";

function displayCell(key: string, value: unknown): string {
  if (["has_actual_assignment", "has_called", "has_connected"].includes(key)) {
    return value === true || value === 1 || value === "1" || value === "true" ? "是" : "否";
  }
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getToday(): string {
  return formatLocalDate(new Date());
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatLocalDate(d);
}

function getEarliestExportDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return formatLocalDate(d);
}

export default function Home() {
  // Form state
  const [uid, setUid] = useState("");
  const [channel, setChannel] = useState<Channel>("all");
  const [exportChannel, setExportChannel] = useState<Channel>("all");
  const [dateReady, setDateReady] = useState(false);
  const [today, setToday] = useState("");
  const [earliestExportDate, setEarliestExportDate] = useState("");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");

  useEffect(() => {
    const yesterday = getYesterday();
    setToday(getToday());
    setEarliestExportDate(getEarliestExportDate());
    setExportStartDate(yesterday);
    setExportEndDate(yesterday);
    setDateReady(true);
  }, []);

  // UI state
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState(""); // 导出进度提示
  const [exportError, setExportError] = useState(""); // 导出错误
  const [error, setError] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("bpo");

  const clearError = () => setError("");
  const clearExportStatus = () => { setExportStatus(""); setExportError(""); };

  const handleQuery = useCallback(async (includeHistory = false) => {
    clearError();

    // Client-side validation
    if (!uid.trim()) {
      setError("请输入用户 UID");
      return;
    }
    if (!/^\d+$/.test(uid.trim())) {
      setError("UID 格式不正确，请输入纯数字");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/allocation/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: uid.trim(),
          channel,
          dateMode: "all_time",
          includeHistory,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "查询失败");
        return;
      }

      setResult(data);
      // Set active tab based on channel
      if (channel === "tmk") {
        setActiveTab("tmk");
      } else if (channel === "cc") {
        setActiveTab("cc");
      } else {
        setActiveTab("bpo");
      }
    } catch {
      setError("网络请求失败，请检查网络连接");
    } finally {
      setLoading(false);
    }
  }, [uid, channel]);

  const handleExport = useCallback(async () => {
    clearError();
    clearExportStatus();

    // Export validation
    if (!exportStartDate || !exportEndDate) {
      setExportError("请选择导出开始日期和结束日期");
      return;
    }

    const start = new Date(exportStartDate);
    const end = new Date(exportEndDate);
    const maxDate = new Date(today);
    if (start > maxDate || end > maxDate) {
      setExportError("导出日期不能晚于今天");
      return;
    }

    if (start > end) {
      setExportError("开始日期不能晚于结束日期");
      return;
    }

    const oneDayMs = 24 * 60 * 60 * 1000;
    const dayCount = Math.floor((end.getTime() - start.getTime()) / oneDayMs) + 1;
    if (dayCount > 14) {
      setExportError("导出时间范围最多支持 14 天");
      return;
    }

    setExporting(true);
    setExportStatus("⏳ 正在提交查询，请稍候...");

    // 倒计时提示
    const totalSecs = 45;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += 3;
      if (elapsed < totalSecs) {
        setExportStatus(`⏳ 查询运行中，预计还需 ${totalSecs - elapsed} 秒...`);
      } else {
        setExportStatus("⏳ 查询耗时较长，继续等待中...");
      }
    }, 3000);

    try {
      const res = await fetch("/api/allocation/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: exportChannel,
          dateMode: exportStartDate === exportEndDate ? "specific" : "range",
          date: exportStartDate === exportEndDate ? exportStartDate : undefined,
          startDate: exportStartDate,
          endDate: exportEndDate,
        }),
      });

      clearInterval(timer);

      if (!res.ok) {
        const data = await res.json();
        setExportError(data.error || "导出失败");
        setExportStatus("");
        return;
      }

      const data = await res.json();

      // bigdata-mcp 模式：后端返回下载链接，前端直接触发下载
      if (data.downloadUrl || Array.isArray(data.downloadUrls)) {
        const triggerDownload = (url: string) => {
          const link = document.createElement("a");
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        };

        const downloadItems: Array<{ channel: string; url: string }> = Array.isArray(data.downloadUrls)
          ? data.downloadUrls
          : [
            { channel: "BPO", url: data.downloadUrl },
            ...(data.tmkDownloadUrl ? [{ channel: "TMK", url: data.tmkDownloadUrl }] : []),
            ...(data.ccDownloadUrl ? [{ channel: "CC", url: data.ccDownloadUrl }] : []),
          ];

        downloadItems.forEach((item, index) => {
          setTimeout(() => triggerDownload(item.url), index * 500);
        });

        if (downloadItems.length > 1) {
          const channelText = downloadItems.map((item) => item.channel).join(" + ");
          setExportStatus(`✅ 查询完成！已触发 ${downloadItems.length} 个文件下载（${channelText}），如未弹出请检查浏览器是否拦截了弹窗。链接 10 分钟内有效。`);
        } else {
          setExportStatus("✅ 查询完成！文件正在下载，如未弹出请检查浏览器是否拦截了弹窗。链接 10 分钟内有效。");
        }
        return;
      }

      // 非 mcp 模式：后端直接返回 CSV blob
      const blob = await new Response(JSON.stringify(data)).blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      const disposition = res.headers.get("Content-Disposition");
      let filename = "export.csv";
      if (disposition) {
        const match = disposition.match(/filename\*=UTF-8''(.+)/);
        if (match) {
          filename = decodeURIComponent(match[1]);
        }
      }

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportStatus("✅ 文件已下载");
    } catch {
      clearInterval(timer);
      setExportError("网络请求失败，请检查网络连接");
      setExportStatus("");
    } finally {
      setExporting(false);
    }
  }, [exportChannel, exportStartDate, exportEndDate, today]);

  const handleExportStartDateChange = (value: string) => {
    setExportStartDate(value);
    if (exportEndDate && value > exportEndDate) {
      setExportEndDate(value);
    }
  };

  const handleExportEndDateChange = (value: string) => {
    setExportEndDate(value);
    if (exportStartDate && value < exportStartDate) {
      setExportStartDate(value);
    }
  };

  const handleReset = () => {
    const yesterday = getYesterday();
    setUid("");
    setChannel("all");
    setExportChannel("all");
    setExportStartDate(yesterday);
    setExportEndDate(yesterday);
    setError("");
    setResult(null);
    setActiveTab("bpo");
  };

  // Determine which tabs to show
  const visibleTabs: Tab[] =
    channel === "bpo" ? ["bpo"] : channel === "tmk" ? ["tmk"] : channel === "cc" ? ["cc"] : ["bpo", "tmk", "cc"];

  const currentActiveTab = visibleTabs.includes(activeTab)
    ? activeTab
    : visibleTabs[0];

  // BPO columns
  const bpoColumns: [string, string][] = [
    ["dt", "商分入池日期"],
    ["userid", "用户 UID"],
    ["userType", "用户类型"],
    ["rank", "排名"],
    ["has_actual_assignment", "实际分配"],
    ["sales_ldap", "分配销售"],
    ["assigned_at", "实际分配时间"],
    ["has_called", "是否拨打"],
    ["has_connected", "是否接通"],
    ["call_count", "拨打次数"],
    ["latest_touch_at", "最近触达时间"],
  ];

  // TMK columns
  const tmkColumns: [string, string][] = [
    ["dt", "商分入池日期"],
    ["user_id", "用户 UID"],
    ["lead_channel", "线索渠道"],
    ["queue_rnk", "队列排名"],
    ["has_actual_assignment", "实际分配"],
    ["sales_ldap", "分配销售"],
    ["assigned_at", "实际分配时间"],
    ["has_called", "是否拨打"],
    ["has_connected", "是否接通"],
    ["call_count", "拨打次数"],
    ["latest_touch_at", "最近触达时间"],
  ];

  // CC columns
  const ccColumns: [string, string][] = [
    ["dt", "商分入池日期"],
    ["user_id", "用户 UID"],
    ["final_rank", "最终排名"],
    ["business_line_type", "业务线类型"],
    ["has_actual_assignment", "实际分配"],
    ["sales_ldap", "分配销售"],
    ["assigned_at", "实际分配时间"],
    ["has_called", "是否拨打"],
    ["has_connected", "是否接通"],
    ["call_count", "拨打次数"],
    ["latest_touch_at", "最近触达时间"],
  ];

  return (
    <main className="max-w-[1180px] mx-auto px-6 py-8 pb-12">
      {/* Header */}
      <section className="mb-6">
        <h1 className="text-[28px] font-bold text-gray-900 mb-2">
          用户分配记录查询工作台
        </h1>
        <p className="text-sm text-gray-500">
          输入用户 UID，查询该用户在 BPO / TMK / CC
          渠道下是否进入商分池、是否实际分给销售，以及是否拨打和接通。
        </p>
      </section>

      {/* Query Card */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-5 mb-5">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">查询单个 UID 分配记录</h2>
          <p className="mt-1 text-[13px] text-gray-500">
            默认秒查最近90天缓存；需要更早记录时可单独查询数仓历史。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_auto_auto_auto] gap-3.5 items-end">
          {/* UID Input */}
          <div>
            <label className="block mb-2 text-[13px] font-semibold text-gray-700">
              用户 UID
            </label>
            <input
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder="请输入单个 UID，例如 123456789"
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-[10px] outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/10 transition"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleQuery(false);
              }}
            />
          </div>

          {/* Channel Select */}
          <div>
            <label className="block mb-2 text-[13px] font-semibold text-gray-700">
              查询渠道
            </label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-[10px] outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/10 bg-white transition"
            >
              <option value="all">全部</option>
              <option value="bpo">BPO</option>
              <option value="tmk">TMK</option>
              <option value="cc">CC</option>
            </select>
          </div>

          {/* Query Button */}
          <button
            onClick={() => handleQuery(false)}
            disabled={loading}
            className="h-10 px-[18px] bg-blue-600 text-white text-sm font-semibold rounded-[10px] whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed hover:bg-blue-700 transition inline-flex items-center gap-1.5"
          >
            <Search className="w-4 h-4" />
            {loading ? "查询中..." : "查询"}
          </button>

          <button
            onClick={() => handleQuery(true)}
            disabled={loading}
            className="h-10 px-[18px] bg-amber-50 text-amber-700 text-sm font-semibold rounded-[10px] whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed hover:bg-amber-100 transition"
          >
            查询90天前历史
          </button>

          {/* Reset Button */}
          <button
            onClick={handleReset}
            className="h-10 px-[18px] bg-gray-100 text-gray-700 text-sm font-semibold rounded-[10px] whitespace-nowrap cursor-pointer hover:bg-gray-200 transition inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            重置
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <p className="mt-3 text-[13px] text-red-600">{error}</p>
        )}

        {/* Loading */}
        {loading && (
          <div className="mt-4 px-4 py-3.5 rounded-xl bg-blue-50 text-blue-600 text-sm">
            查询中，请稍候...
          </div>
        )}
      </section>

      {/* Export Card */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-5 mb-5">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">导出分配明细</h2>
          <p className="mt-1 text-[13px] text-gray-500">
            支持导出某一天或一段时间的全部明细，时间范围最多 14 天，不需要填写 UID。默认可选昨天及更早日期，最晚到今天。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3.5 items-end">
          <div>
            <label className="block mb-2 text-[13px] font-semibold text-gray-700">
              导出渠道
            </label>
            <select
              value={exportChannel}
              onChange={(e) => setExportChannel(e.target.value as Channel)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-[10px] outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/10 bg-white transition"
            >
              <option value="all">全部</option>
              <option value="bpo">BPO</option>
              <option value="tmk">TMK</option>
              <option value="cc">CC</option>
            </select>
          </div>

          <div>
            <label className="block mb-2 text-[13px] font-semibold text-gray-700">
              开始日期
            </label>
            <input
              type="date"
              value={exportStartDate}
              min={dateReady ? earliestExportDate : undefined}
              max={dateReady ? today : undefined}
              disabled={!dateReady}
              onChange={(e) => handleExportStartDateChange(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-[10px] outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/10 transition disabled:bg-gray-50"
            />
          </div>

          <div>
            <label className="block mb-2 text-[13px] font-semibold text-gray-700">
              结束日期
            </label>
            <input
              type="date"
              value={exportEndDate}
              min={dateReady ? earliestExportDate : undefined}
              max={dateReady ? today : undefined}
              disabled={!dateReady}
              onChange={(e) => handleExportEndDateChange(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-[10px] outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/10 transition disabled:bg-gray-50"
            />
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="h-10 px-[18px] bg-gray-100 text-gray-700 text-sm font-semibold rounded-[10px] whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed hover:bg-gray-200 transition inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            {exporting ? "导出中..." : "导出明细"}
          </button>
        </div>

        {/* Export Status */}
        {exportStatus && !exportError && (
          <div className={`mt-3 px-4 py-3 rounded-xl text-sm ${exportStatus.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-600"}`}>
            {exportStatus}
          </div>
        )}
        {exportError && (
          <div className="mt-3 px-4 py-3 rounded-xl text-sm bg-red-50 text-red-600">
            {exportError}
          </div>
        )}
      </section>

      {/* Summary Grid */}
      {result && (
        <>
        <div className="mb-3 px-4 py-3 rounded-xl bg-blue-50 text-blue-700 text-sm">
          数据来源：{result.dataSource === "cache" ? "云端缓存" : "数仓实时查询"} · {result.rangeLabel}
        </div>
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-5">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-[18px]">
            <div className="text-[13px] text-gray-500 mb-2">查询 UID</div>
            <div className="text-[22px] font-bold">{result.uid}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-[18px]">
            <div className="text-[13px] text-gray-500 mb-2">
              是否进入商分池
            </div>
            <div>
              <span
                className={`inline-flex items-center h-7 px-2.5 rounded-full text-[13px] font-semibold ${
                  result.hasPoolEntry
                    ? "text-green-600 bg-green-50"
                    : "text-gray-500 bg-gray-100"
                }`}
              >
                {result.hasPoolEntry ? "是" : "否"}
              </span>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-[18px]">
            <div className="text-[13px] text-gray-500 mb-2">是否实际分配销售</div>
            <div className="text-[22px] font-bold">{result.hasActualAssignment ? "是" : "否"}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-[18px]">
            <div className="text-[13px] text-gray-500 mb-2">是否拨打 / 接通</div>
            <div className="text-[22px] font-bold">{result.hasCalled ? "已拨打" : "未拨打"} / {result.hasConnected ? "已接通" : "未接通"}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-[18px]">
            <div className="text-[13px] text-gray-500 mb-2">BPO 记录数</div>
            <div className="text-[22px] font-bold">
              {result.summary.bpoCount} 条
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-[18px]">
            <div className="text-[13px] text-gray-500 mb-2">TMK 记录数</div>
            <div className="text-[22px] font-bold">
              {result.summary.tmkCount} 条
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-[18px]">
            <div className="text-[13px] text-gray-500 mb-2">CC 记录数</div>
            <div className="text-[22px] font-bold">
              {result.summary.ccCount} 条
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-[18px]">
            <div className="text-[13px] text-gray-500 mb-2">最近商分入池日期</div>
            <div className="text-[22px] font-bold">{result.latestDt}</div>
          </div>
        </section>
        </>
      )}

      {/* Result Table */}
      {result && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.04)] overflow-hidden">
          {/* Tabs */}
          <div className="flex gap-2 px-4 pt-4 border-b border-gray-200">
            {visibleTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`h-[38px] px-[18px] text-sm font-semibold rounded-t-[10px] border-0 cursor-pointer transition ${
                  currentActiveTab === tab
                    ? "bg-blue-50 text-blue-600"
                    : "bg-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab === "bpo" ? "BPO 分配记录" : tab === "tmk" ? "TMK 分配记录" : "CC 分配记录"}（
                {tab === "bpo"
                  ? result.bpoRecords.length
                  : tab === "tmk"
                    ? result.tmkRecords.length
                    : result.ccRecords.length}
                ）
              </button>
            ))}
          </div>

          {/* Table Content */}
          <div className="p-4 overflow-x-auto">
            {currentActiveTab === "bpo" && result.bpoRecords.length === 0 && (
              <div className="py-10 text-center text-gray-500">
                该用户暂无 BPO 分配记录
              </div>
            )}
            {currentActiveTab === "tmk" && result.tmkRecords.length === 0 && (
              <div className="py-10 text-center text-gray-500">
                该用户暂无 TMK 分配记录
              </div>
            )}
            {currentActiveTab === "cc" && result.ccRecords.length === 0 && (
              <div className="py-10 text-center text-gray-500">
                该用户暂无 CC 分配记录
              </div>
            )}

            {currentActiveTab === "bpo" && result.bpoRecords.length > 0 && (
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr>
                    {bpoColumns.map(([, label]) => (
                      <th
                        key={label}
                        className="border-b border-gray-200 px-2.5 py-3 text-left text-gray-700 font-bold bg-gray-50 whitespace-nowrap"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.bpoRecords.map((record, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      {bpoColumns.map(([key]) => (
                        <td
                          key={key}
                          className="border-b border-gray-200 px-2.5 py-3 text-gray-900 whitespace-nowrap"
                        >
                          {displayCell(key, (record as unknown as Record<string, unknown>)[key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {currentActiveTab === "tmk" && result.tmkRecords.length > 0 && (
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr>
                    {tmkColumns.map(([, label]) => (
                      <th
                        key={label}
                        className="border-b border-gray-200 px-2.5 py-3 text-left text-gray-700 font-bold bg-gray-50 whitespace-nowrap"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.tmkRecords.map((record, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      {tmkColumns.map(([key]) => (
                        <td
                          key={key}
                          className="border-b border-gray-200 px-2.5 py-3 text-gray-900 whitespace-nowrap"
                        >
                          {displayCell(key, (record as unknown as Record<string, unknown>)[key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {currentActiveTab === "cc" && result.ccRecords.length > 0 && (
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr>
                    {ccColumns.map(([, label]) => (
                      <th
                        key={label}
                        className="border-b border-gray-200 px-2.5 py-3 text-left text-gray-700 font-bold bg-gray-50 whitespace-nowrap"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.ccRecords.map((record, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      {ccColumns.map(([key]) => (
                        <td
                          key={key}
                          className="border-b border-gray-200 px-2.5 py-3 text-gray-900 whitespace-nowrap"
                        >
                          {displayCell(key, (record as unknown as Record<string, unknown>)[key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
