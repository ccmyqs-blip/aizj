"use client";

import { useMemo, useState } from "react";
import type { LeadStatusValue } from "@/lib/constants/status";

type LeadRow = {
  id: string;
  contactName: string;
  phone: string;
  email: string | null;
  demand: string | null;
  sourcePage: string | null;
  status: LeadStatusValue;
  note: string | null;
  createdAt: string;
};

type QARecordRow = {
  id: string;
  question: string;
  answer: string;
  modelName: string | null;
  createdAt: string;
  sourceChunkCount: number;
};

type AdminDashboardProps = {
  leads: LeadRow[];
  qaRecords: QARecordRow[];
};

const statusOptions: Array<{ value: LeadStatusValue; label: string }> = [
  { value: "NEW", label: "新线索" },
  { value: "CONTACTED", label: "已联系" },
  { value: "IN_PROGRESS", label: "跟进中" },
  { value: "CONVERTED", label: "已转化" },
  { value: "INVALID", label: "无效" }
];

const statusLabelMap = statusOptions.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

export function AdminDashboard({ leads, qaRecords }: AdminDashboardProps) {
  const [rows, setRows] = useState(leads);
  const [savingId, setSavingId] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  const qaList = useMemo(() => qaRecords, [qaRecords]);

  const updateRow = (id: string, patch: Partial<LeadRow>) => {
    setRows((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const saveRow = async (row: LeadRow) => {
    setSavingId(row.id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/leads/${row.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status: row.status,
          note: row.note ?? ""
        })
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "更新失败");
      }
      setMessage("线索更新成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新失败");
    } finally {
      setSavingId("");
    }
  };

  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-brand-900">留资线索</h2>
          <p className="mt-1 text-xs text-slate-500">可直接更新状态与备注</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">时间</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">联系人</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">联系方式</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">需求摘要</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">状态</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">备注</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="bg-white align-top">
                  <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
                    {new Date(row.createdAt).toLocaleString("zh-CN")}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <p className="font-medium text-slate-800">{row.contactName}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.email || "-"}</p>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <p>{row.phone}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.sourcePage || "-"}</p>
                  </td>
                  <td className="max-w-lg border-b border-slate-100 px-4 py-3 text-xs leading-6 text-slate-700">
                    {row.demand || "-"}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <select
                      value={row.status}
                      onChange={(event) =>
                        updateRow(row.id, {
                          status: event.target.value as LeadStatusValue
                        })
                      }
                      className="h-9 rounded border border-slate-300 bg-white px-2 text-sm outline-none focus:border-brand-600"
                    >
                      {statusOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <textarea
                      rows={2}
                      value={row.note ?? ""}
                      onChange={(event) => updateRow(row.id, { note: event.target.value })}
                      placeholder="填写跟进备注"
                      className="w-56 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:border-brand-600"
                    />
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <button
                      onClick={() => saveRow(row)}
                      disabled={savingId === row.id}
                      className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {savingId === row.id ? "保存中..." : "保存"}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    暂无留资线索
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {message ? <p className="text-sm text-brand-700">{message}</p> : null}

      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-brand-900">问答日志</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">时间</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">问题</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">回答摘要</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">引用数</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">模型</th>
              </tr>
            </thead>
            <tbody>
              {qaList.map((item) => (
                <tr key={item.id} className="bg-white">
                  <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </td>
                  <td className="max-w-sm border-b border-slate-100 px-4 py-3 text-slate-800">{item.question}</td>
                  <td className="max-w-lg border-b border-slate-100 px-4 py-3 text-xs leading-6 text-slate-600">
                    {item.answer}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{item.sourceChunkCount}</td>
                  <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
                    {item.modelName || "-"}
                  </td>
                </tr>
              ))}
              {qaList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                    暂无问答记录
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function getLeadStatusLabel(status: LeadStatusValue) {
  return statusLabelMap[status] ?? status;
}
