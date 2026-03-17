"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { FEEDBACK_TYPES, type FeedbackTypeValue } from "@/lib/constants/status";

type FeedbackFormState = {
  feedbackType: FeedbackTypeValue;
  content: string;
  contact: string;
  rating: string;
  website: string;
};

const feedbackTypeLabelMap: Record<FeedbackTypeValue, string> = {
  GENERAL: "一般反馈",
  BUG: "问题反馈",
  SUGGESTION: "功能建议",
  DATA_ERROR: "数据纠错",
  OTHER: "其他"
};

const initialFormState: FeedbackFormState = {
  feedbackType: "GENERAL",
  content: "",
  contact: "",
  rating: "",
  website: ""
};

export function FeedbackFloat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FeedbackFormState>(initialFormState);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const hiddenOnPage = useMemo(() => {
    return pathname.startsWith("/admin");
  }, [pathname]);

  if (hiddenOnPage) {
    return null;
  }

  const onChange = <K extends keyof FeedbackFormState>(key: K, value: FeedbackFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setIsError(false);

    const trimmedContent = form.content.trim();
    if (trimmedContent.length < 4) {
      setIsError(true);
      setMessage("反馈内容至少 4 个字");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          feedbackType: form.feedbackType,
          sourcePage: pathname,
          content: trimmedContent,
          contact: form.contact.trim(),
          rating: form.rating ? Number(form.rating) : undefined,
          website: form.website
        })
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "提交失败，请稍后重试");
      }

      setMessage(payload.message ?? "提交成功，感谢反馈");
      setForm(initialFormState);
      setIsError(false);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "提交失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-0 top-[55%] z-40 -translate-y-1/2 rounded-l-xl border border-r-0 border-brand-700 bg-brand-700 px-3 py-3 text-xs font-semibold text-white shadow-lg transition hover:bg-brand-900 md:px-4 md:text-sm"
        aria-label="打开反馈弹窗"
      >
        反馈
      </button>

      <div
        className={`fixed inset-0 z-40 bg-slate-950/30 transition ${open ? "visible opacity-100" : "invisible opacity-0"}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />

      <aside
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-sm border-l border-slate-200 bg-white p-5 shadow-2xl transition-transform ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!open}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-brand-900">用户反馈</p>
            <p className="mt-1 text-xs text-slate-500">用于问题上报和改进建议</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300"
          >
            关闭
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <label className="block text-xs text-slate-700">
            反馈类型
            <select
              value={form.feedbackType}
              onChange={(event) => onChange("feedbackType", event.target.value as FeedbackTypeValue)}
              className="field-input mt-1 h-10 bg-white px-3 py-0"
            >
              {FEEDBACK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {feedbackTypeLabelMap[type]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-700">
            反馈内容
            <textarea
              rows={6}
              value={form.content}
              onChange={(event) => onChange("content", event.target.value)}
              placeholder="请描述你遇到的问题、建议或需求"
              className="field-input mt-1 min-h-[140px] resize-y px-3 py-2"
              required
            />
          </label>

          <label className="block text-xs text-slate-700">
            联系方式（选填）
            <input
              value={form.contact}
              onChange={(event) => onChange("contact", event.target.value)}
              placeholder="手机号 / 微信 / 邮箱"
              className="field-input mt-1 h-10 px-3"
            />
          </label>

          <label className="block text-xs text-slate-700">
            满意度（选填）
            <select
              value={form.rating}
              onChange={(event) => onChange("rating", event.target.value)}
              className="field-input mt-1 h-10 bg-white px-3 py-0"
            >
              <option value="">不选择</option>
              <option value="5">5 分</option>
              <option value="4">4 分</option>
              <option value="3">3 分</option>
              <option value="2">2 分</option>
              <option value="1">1 分</option>
            </select>
          </label>

          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(event) => onChange("website", event.target.value)}
            className="hidden"
            aria-hidden="true"
          />

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "提交中..." : "提交反馈"}
          </button>

          {message ? <p className={isError ? "status-error text-xs" : "status-success text-xs"}>{message}</p> : null}
        </form>
      </aside>
    </>
  );
}
