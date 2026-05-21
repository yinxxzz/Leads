"use client";

import { useState, useCallback } from "react";
import { Search, Download, RotateCcw } from "lucide-react";

// Types
interface BpoRecord {
  dt: string;
  userid: string;
  phone: string;
  leadType: string;
  userType: string;
  grade: string;
  rank: number;
  extraInfo: string;
}

interface TmkRecord {
  dt: string;
  user_id: string;
  lead_channel: string;
  hunt_lead_type: string;
  grade: string;
  queue_rnk: string;
}

interface QueryResult {
  uid: string;
  hasAllocation: boolean;
  latestDt: string;
  summary: {
    bpoCount: number;
    tmkCount: number;
  };
  bpoRecords: BpoRecord[];
  tmkRecords: TmkRecord[];
}

type Channel = "all" | "bpo" | "tmk";
type Tab = "bpo" | "tmk";

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

export default function Home() {
  // Form state
  const [uid, setUid] = useState("");
  const [channel, setChannel] = useState<Channel>("all");
  const [exportChannel, setExportChannel] = useState<Channel>("all");
  const [exportStartDate, setExportStartDate] = useState(getYesterday());
  const [exportEndDate, setExportEndDate] = useState(getYesterday());
  const today = getToday();

  // UI state
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("bpo");

  const clearError = () => setError("");

  const handleQuery = useCallback(async () => {
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

    // Export validation
    if (!exportStartDate || !exportEndDate) {
      setError("请选择导出开始日期和结束日期");
      return;
    }

    const start = new Date(exportStartDate);
    const end = new Date(exportEndDate);
    const maxDate = new Date(today);
    if (start > maxDate || end > maxDate) {
      setError("导出日期不能晚于今天");
      return;
    }

    if (start > end) {
      setError("开始日期不能晚于结束日期");
      return;
    }

    const oneDayMs = 24 * 60 * 60 * 1000;
    const dayCount = Math.floor((end.getTime() - start.getTime()) / oneDayMs) + 1;
    if (dayCount > 14) {
      setError("导出时间范围最多支持 14 天");
      return;
    }

    setExporting(true);
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

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "导出失败");
        return;
      }

      // Download file
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      // Extract filename from Content-Disposition header
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
    } catch {
      setError("网络请求失败，请检查网络连接");
    } finally {
      setExporting(false);
    }
  }, [exportChannel, exportStartDate, exportEndDate, today]);

  const handleReset = () => {
    setUid("");
    setChannel("all");
    setExportChannel("all");
    setExportStartDate(getYesterday());
    setExportEndDate(getYesterday());
    setError("");
    setResult(null);
    setActiveTab("bpo");
  };

  // Determine which tabs to show
  const visibleTabs: Tab[] =
    channel === "bpo" ? ["bpo"] : channel === "tmk" ? ["tmk"] : ["bpo", "tmk"];

  const currentActiveTab = visibleTabs.includes(activeTab)
    ? activeTab
    : visibleTabs[0];

  // BPO columns
  const bpoColumns: [string, string][] = [
    ["dt", "分配日期"],
    ["userid", "用户 UID"],
    ["phone", "手机号"],
    ["leadType", "线索类型"],
    ["userType", "用户类型"],
    ["grade", "年级"],
    ["rank", "排名"],
    ["extraInfo", "扩展信息"],
  ];

  // TMK columns
  const tmkColumns: [string, string][] = [
    ["dt", "分配日期"],
    ["user_id", "用户 UID"],
    ["lead_channel", "线索渠道"],
    ["hunt_lead_type", "线索类型"],
    ["grade", "年级"],
    ["queue_rnk", "队列排名"],
  ];

  return (
    <main className="max-w-[1180px] mx-auto px-6 py-8 pb-12">
      {/* Header */}
      <section className="mb-6">
        <h1 className="text-[28px] font-bold text-gray-900 mb-2">
          用户分配记录查询工作台
        </h1>
        <p className="text-sm text-gray-500">
          输入用户 UID，查询该用户在 BPO / TMK
          渠道下是否进入分配池，以及对应分配日期、渠道、排名等信息。
        </p>
      </section>

      {/* Query Card */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-5 mb-5">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">查询单个 UID 分配记录</h2>
          <p className="mt-1 text-[13px] text-gray-500">
            UID 查询默认查历史记录，不需要选择时间。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_auto_auto] gap-3.5 items-end">
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
                if (e.key === "Enter") handleQuery();
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
            </select>
          </div>

          {/* Query Button */}
          <button
            onClick={handleQuery}
            disabled={loading}
            className="h-10 px-[18px] bg-blue-600 text-white text-sm font-semibold rounded-[10px] whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed hover:bg-blue-700 transition inline-flex items-center gap-1.5"
          >
            <Search className="w-4 h-4" />
            {loading ? "查询中..." : "查询"}
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
            支持导出某一天或一段时间的全部明细，时间范围最多 14 天，不需要填写 UID。
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
            </select>
          </div>

          <div>
            <label className="block mb-2 text-[13px] font-semibold text-gray-700">
              开始日期
            </label>
            <input
              type="date"
              value={exportStartDate}
              max={today}
              onChange={(e) => setExportStartDate(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-[10px] outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/10 transition"
            />
          </div>

          <div>
            <label className="block mb-2 text-[13px] font-semibold text-gray-700">
              结束日期
            </label>
            <input
              type="date"
              value={exportEndDate}
              max={today}
              onChange={(e) => setExportEndDate(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-[10px] outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/10 transition"
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
      </section>

      {/* Summary Grid */}
      {result && (
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3.5 mb-5">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-[18px]">
            <div className="text-[13px] text-gray-500 mb-2">查询 UID</div>
            <div className="text-[22px] font-bold">{result.uid}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-[18px]">
            <div className="text-[13px] text-gray-500 mb-2">
              是否有分配记录
            </div>
            <div>
              <span
                className={`inline-flex items-center h-7 px-2.5 rounded-full text-[13px] font-semibold ${
                  result.hasAllocation
                    ? "text-green-600 bg-green-50"
                    : "text-gray-500 bg-gray-100"
                }`}
              >
                {result.hasAllocation ? "有" : "无"}
              </span>
            </div>
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
            <div className="text-[13px] text-gray-500 mb-2">最近分配日期</div>
            <div className="text-[22px] font-bold">{result.latestDt}</div>
          </div>
        </section>
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
                {tab === "bpo" ? "BPO 分配记录" : "TMK 分配记录"}（
                {tab === "bpo"
                  ? result.bpoRecords.length
                  : result.tmkRecords.length}
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
                          {String(
                            (record as unknown as Record<string, unknown>)[
                              key
                            ] ?? "-"
                          )}
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
                          {String(
                            (record as unknown as Record<string, unknown>)[
                              key
                            ] ?? "-"
                          )}
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
