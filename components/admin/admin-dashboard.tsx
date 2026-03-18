"use client";

import { useRef, useState } from "react";
import { FEEDBACK_STATUSES, LEAD_STATUSES, type FeedbackStatusValue, type LeadStatusValue } from "@/lib/constants/status";

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

type FeedbackRow = {
  id: string;
  feedbackType: string;
  sourcePage: string | null;
  content: string;
  contact: string | null;
  rating: number | null;
  status: FeedbackStatusValue;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type UploadedDocumentRow = {
  id: string;
  title: string;
  code: string;
  category: string;
  source: string | null;
  status: string;
  createdAt: string;
};

type AdminDashboardProps = {
  leads: LeadRow[];
  qaRecords: QARecordRow[];
  feedbacks: FeedbackRow[];
  uploadedDocuments: UploadedDocumentRow[];
  qaModelStats: Array<{
    modelName: string;
    callCount: number;
    approxTokens: number;
  }>;
};

const leadStatusLabels: Record<LeadStatusValue, string> = {
  NEW: "新线索",
  CONTACTED: "已联系",
  IN_PROGRESS: "跟进中",
  CONVERTED: "已转化",
  INVALID: "无效"
};

const feedbackStatusLabels: Record<FeedbackStatusValue, string> = {
  NEW: "待处理",
  REVIEWED: "已查看",
  RESOLVED: "已解决",
  REJECTED: "不采纳"
};

const feedbackTypeLabels: Record<string, string> = {
  GENERAL: "一般反馈",
  BUG: "问题反馈",
  SUGGESTION: "功能建议",
  DATA_ERROR: "数据纠错",
  OTHER: "其他"
};

export function AdminDashboard({ leads, qaRecords, feedbacks, uploadedDocuments, qaModelStats }: AdminDashboardProps) {
  const [leadRows, setLeadRows] = useState(leads);
  const [feedbackRows, setFeedbackRows] = useState(feedbacks);
  const [uploadedRows, setUploadedRows] = useState(uploadedDocuments);
  const [savingLeadId, setSavingLeadId] = useState<string>("");
  const [savingFeedbackId, setSavingFeedbackId] = useState<string>("");
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<string>("");
  const [detailQa, setDetailQa] = useState<QARecordRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCode, setUploadCode] = useState("");
  const [uploadCategory, setUploadCategory] = useState("UPLOADED");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadMessageType, setUploadMessageType] = useState<"" | "success" | "error">("");
  const [deletingDocumentId, setDeletingDocumentId] = useState<string>("");
  const [confirmDeleteDocument, setConfirmDeleteDocument] = useState<UploadedDocumentRow | null>(null);
  const [message, setMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toSummary = (text: string, max = 90) => {
    if (text.length <= max) {
      return text;
    }
    return `${text.slice(0, max)}...`;
  };

  const updateLeadRow = (id: string, patch: Partial<LeadRow>) => {
    setLeadRows((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const saveLeadRow = async (row: LeadRow) => {
    setSavingLeadId(row.id);
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
        throw new Error(payload.message ?? "留资更新失败");
      }
      setMessage("留资更新成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "留资更新失败");
    } finally {
      setSavingLeadId("");
    }
  };

  const updateFeedbackRow = (id: string, patch: Partial<FeedbackRow>) => {
    setFeedbackRows((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const saveFeedbackRow = async (row: FeedbackRow) => {
    setSavingFeedbackId(row.id);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/feedback/${row.id}`, {
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
        throw new Error(payload.message ?? "反馈更新失败");
      }
      setMessage("反馈更新成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "反馈更新失败");
    } finally {
      setSavingFeedbackId("");
    }
  };

  const deleteFeedbackRow = async (id: string) => {
    const confirmed = window.confirm("确认删除该条反馈？删除后不可恢复。");
    if (!confirmed) {
      return;
    }

    setDeletingFeedbackId(id);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/feedback/${id}`, {
        method: "DELETE"
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "反馈删除失败");
      }

      setFeedbackRows((prev) => prev.filter((item) => item.id !== id));
      setMessage("反馈删除成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "反馈删除失败");
    } finally {
      setDeletingFeedbackId("");
    }
  };

  const submitDocumentUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uploadFile) {
      setUploadMessageType("error");
      setUploadMessage("请先选择 PDF 或 Word 文件");
      return;
    }

    setUploading(true);
    setUploadMessage("");
    setUploadMessageType("");

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("title", uploadTitle.trim());
      formData.append("code", uploadCode.trim());
      formData.append("category", uploadCategory.trim() || "UPLOADED");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);
      const response = await fetch("/api/admin/documents/upload", {
        method: "POST",
        body: formData,
        signal: controller.signal
      }).finally(() => clearTimeout(timer));

      const payload = (await response.json()) as { message?: string; document?: UploadedDocumentRow };
      if (!response.ok || !payload.document) {
        throw new Error(payload.message ?? "上传失败");
      }

      setUploadedRows((prev) => [payload.document!, ...prev].slice(0, 20));
      setUploadTitle("");
      setUploadCode("");
      setUploadCategory("UPLOADED");
      setUploadFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setUploadMessageType("success");
      setUploadMessage("文档上传成功");
    } catch (error) {
      setUploadMessageType("error");
      setUploadMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const deleteUploadedDocument = async (id: string) => {
    setDeletingDocumentId(id);
    setUploadMessage("");
    setUploadMessageType("");

    try {
      const response = await fetch(`/api/admin/documents/${id}`, {
        method: "DELETE"
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "文档删除失败");
      }

      setUploadedRows((prev) => prev.filter((item) => item.id !== id));
      setUploadMessageType("success");
      setUploadMessage("文档删除成功");
      setConfirmDeleteDocument(null);
    } catch (error) {
      setUploadMessageType("error");
      setUploadMessage(error instanceof Error ? error.message : "文档删除失败");
    } finally {
      setDeletingDocumentId("");
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-6">
      <section className="panel p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-brand-900">上传文档</h2>
          <p className="mt-1 text-xs text-slate-500">支持 PDF、DOC、DOCX。上传后将登记到文档库，便于后续处理。</p>
        </div>

        <form onSubmit={submitDocumentUpload} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={uploadTitle}
              onChange={(event) => setUploadTitle(event.target.value)}
              placeholder="文档标题（可选）"
              className="field-input h-10 px-3"
            />
            <input
              value={uploadCode}
              onChange={(event) => setUploadCode(event.target.value)}
              placeholder="文档编号（可选）"
              className="field-input h-10 px-3"
            />
            <input
              value={uploadCategory}
              onChange={(event) => setUploadCategory(event.target.value)}
              placeholder="分类（默认 UPLOADED）"
              className="field-input h-10 px-3"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={openFilePicker}
              disabled={uploading}
              className="rounded border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              选择文件
            </button>
            <p className="max-w-[520px] truncate text-xs text-slate-600">
              {uploadFile ? `已选择：${uploadFile.name}` : "未选择文件（支持 PDF / DOC / DOCX）"}
            </p>
            <button type="submit" disabled={uploading} className="btn-primary">
              {uploading ? "上传中..." : "上传文档"}
            </button>
          </div>
        </form>

        {uploadMessage ? (
          <p className={`mt-3 text-sm ${uploadMessageType === "error" ? "text-rose-700" : "text-brand-700"}`}>{uploadMessage}</p>
        ) : null}

        <div className="mt-4 max-h-52 overflow-y-auto rounded-xl border border-slate-200">
          {uploadedRows.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {uploadedRows.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{item.title}</p>
                    <p className="mt-1 text-slate-500">
                      {item.code} · {item.category} · {new Date(item.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.source ? (
                      <a
                        href={item.source}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700 transition hover:border-brand-600 hover:text-brand-700"
                      >
                        查看文件
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteDocument(item)}
                      disabled={deletingDocumentId === item.id || uploading}
                      className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {deletingDocumentId === item.id ? "删除中..." : "删除"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-slate-500">暂无上传文档</p>
          )}
        </div>
      </section>

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
              {leadRows.map((row) => (
                <tr key={row.id} className="bg-white align-top">
                  <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">{new Date(row.createdAt).toLocaleString("zh-CN")}</td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <p className="font-medium text-slate-800">{row.contactName}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.email || "-"}</p>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <p>{row.phone}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.sourcePage || "-"}</p>
                  </td>
                  <td className="max-w-lg border-b border-slate-100 px-4 py-3 text-xs leading-6 text-slate-700">{row.demand || "-"}</td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <select
                      value={row.status}
                      onChange={(event) => updateLeadRow(row.id, { status: event.target.value as LeadStatusValue })}
                      className="h-9 rounded border border-slate-300 bg-white px-2 text-sm outline-none focus:border-brand-600"
                    >
                      {LEAD_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {leadStatusLabels[value]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <textarea
                      rows={2}
                      value={row.note ?? ""}
                      onChange={(event) => updateLeadRow(row.id, { note: event.target.value })}
                      placeholder="填写跟进备注"
                      className="w-56 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:border-brand-600"
                    />
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <button
                      onClick={() => saveLeadRow(row)}
                      disabled={savingLeadId === row.id}
                      className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {savingLeadId === row.id ? "保存中..." : "保存"}
                    </button>
                  </td>
                </tr>
              ))}
              {leadRows.length === 0 ? (
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

      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-brand-900">用户反馈</h2>
          <p className="mt-1 text-xs text-slate-500">来自右侧反馈弹窗，状态和备注可直接更新</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">时间</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">类型</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">反馈内容</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">联系方式</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">来源</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">状态</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">备注</th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {feedbackRows.map((row) => (
                <tr key={row.id} className="bg-white align-top">
                  <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">{new Date(row.createdAt).toLocaleString("zh-CN")}</td>
                  <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-700">{feedbackTypeLabels[row.feedbackType] ?? row.feedbackType}</td>
                  <td className="max-w-xl border-b border-slate-100 px-4 py-3 text-xs leading-6 text-slate-700">
                    {row.content}
                    <p className="mt-1 text-[11px] text-slate-500">满意度：{row.rating ?? "-"}</p>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-700">{row.contact || "-"}</td>
                  <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">{row.sourcePage || "-"}</td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <select
                      value={row.status}
                      onChange={(event) => updateFeedbackRow(row.id, { status: event.target.value as FeedbackStatusValue })}
                      className="h-9 rounded border border-slate-300 bg-white px-2 text-sm outline-none focus:border-brand-600"
                    >
                      {FEEDBACK_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {feedbackStatusLabels[value]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <textarea
                      rows={2}
                      value={row.note ?? ""}
                      onChange={(event) => updateFeedbackRow(row.id, { note: event.target.value })}
                      placeholder="填写处理备注"
                      className="w-56 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:border-brand-600"
                    />
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveFeedbackRow(row)}
                        disabled={savingFeedbackId === row.id || deletingFeedbackId === row.id}
                        className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {savingFeedbackId === row.id ? "保存中..." : "保存"}
                      </button>
                      <button
                        onClick={() => deleteFeedbackRow(row.id)}
                        disabled={deletingFeedbackId === row.id || savingFeedbackId === row.id}
                        className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {deletingFeedbackId === row.id ? "删除中..." : "删除"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {feedbackRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                    暂无反馈记录
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {message ? <p className="text-sm text-brand-700">{message}</p> : null}

      <section className="panel p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-brand-900">模型调用统计</h2>
          <p className="mt-1 text-xs text-slate-500">按问答日志估算，token 为近似值（问题+回答文本）</p>
        </div>
        {qaModelStats.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-3">
            {qaModelStats.map((item) => (
              <article key={item.modelName} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">模型</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{item.modelName}</p>
                <p className="mt-3 text-xs text-slate-500">总调用次数</p>
                <p className="mt-1 text-xl font-semibold text-brand-900">{item.callCount}</p>
                <p className="mt-3 text-xs text-slate-500">约消耗 token</p>
                <p className="mt-1 text-lg font-semibold text-slate-800">{item.approxTokens.toLocaleString("zh-CN")}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">暂无模型调用数据</p>
        )}
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-brand-900">问答日志</h2>
        </div>
        <div className="max-h-[480px] space-y-3 overflow-y-auto p-4">
          {qaRecords.length > 0 ? (
            qaRecords.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>引用数：{item.sourceChunkCount}</span>
                    <span>模型：{item.modelName || "-"}</span>
                  </div>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-900">{item.question}</p>
                <p className="mt-2 text-xs leading-6 text-slate-600">{toSummary(item.answer)}</p>
                <button
                  type="button"
                  onClick={() => setDetailQa(item)}
                  className="mt-3 rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700 transition hover:border-brand-600 hover:text-brand-700"
                >
                  查看详情
                </button>
              </article>
            ))
          ) : (
            <p className="px-2 py-8 text-center text-sm text-slate-500">暂无问答记录</p>
          )}
        </div>
      </section>

      {confirmDeleteDocument ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/35"
            onClick={() => (deletingDocumentId ? null : setConfirmDeleteDocument(null))}
            aria-hidden="true"
          />
          <section className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">确认删除文档</h3>
            <p className="mt-2 text-sm leading-7 text-slate-700">
              即将删除文档：
              <span className="font-medium text-slate-900">《{confirmDeleteDocument.title}》</span>
              ，并清理其条款切片。此操作不可恢复。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteDocument(null)}
                disabled={Boolean(deletingDocumentId)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:border-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => deleteUploadedDocument(confirmDeleteDocument.id)}
                disabled={Boolean(deletingDocumentId)}
                className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {deletingDocumentId ? "删除中..." : "确认删除"}
              </button>
            </div>
          </section>
        </>
      ) : null}

      {detailQa ? (
        <>
          <div className="fixed inset-0 z-40 bg-slate-950/35" onClick={() => setDetailQa(null)} aria-hidden="true" />
          <section className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-brand-900">问答详情</h3>
                <p className="mt-1 text-xs text-slate-500">{new Date(detailQa.createdAt).toLocaleString("zh-CN")}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailQa(null)}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:border-brand-600 hover:text-brand-700"
              >
                关闭
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-xs font-semibold text-slate-500">问题</p>
                <p className="mt-1 text-slate-800">{detailQa.question}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">完整回答</p>
                <p className="mt-1 whitespace-pre-wrap leading-7 text-slate-700">{detailQa.answer}</p>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                <span>引用数：{detailQa.sourceChunkCount}</span>
                <span>模型：{detailQa.modelName || "-"}</span>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
