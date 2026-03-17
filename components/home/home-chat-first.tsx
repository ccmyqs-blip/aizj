"use client";

import { FormEvent, useMemo, useState } from "react";

type Citation = {
  chunkId: string;
  documentTitle: string;
  documentCode: string;
  chapterTitle: string | null;
  sectionTitle: string | null;
  pageNumber: number | null;
  excerpt: string;
};

type AskResponse = {
  answer: string;
  citations: Citation[];
  modelName: string;
};

const presets = [
  "工程变更引起的价款调整依据是什么？",
  "签证在结算审核阶段通常如何取价？"
];

export function HomeChatFirst() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);

  const canSubmit = useMemo(() => question.trim().length >= 4 && !loading, [question, loading]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const q = question.trim();
    if (q.length < 4) {
      setError("请至少输入 4 个字的问题。");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/qa/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ question: q })
      });

      const payload = (await response.json()) as AskResponse & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "问答请求失败");
      }

      setResult(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "问答请求失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel p-5 md:p-6">
      <div className="space-y-2">
        <h1 className="section-title">造价AI小助手</h1>
        <p className="section-subtitle">打开网站后可直接提问，系统会检索规范依据后返回回答与引用。</p>
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <textarea
          rows={4}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="请输入工程造价问题，例如：工程变更引起的价款如何调整？"
          className="field-input min-h-[120px] resize-y py-3"
        />

        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          {presets.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setQuestion(item)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 transition hover:border-brand-300 hover:text-brand-700"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">仅供参考，具体以合同、补充协议、项目资料为准。</p>
          <button type="submit" disabled={!canSubmit} className="btn-primary">
            {loading ? "正在生成..." : "提交问题"}
          </button>
        </div>
      </form>

      {error ? <div className="status-error mt-4">{error}</div> : null}

      {result ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">回答</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{result.answer}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">引用依据（前 2 条）</p>
            <div className="mt-2 space-y-2">
              {result.citations.slice(0, 2).map((item) => (
                <div key={item.chunkId} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <p>
                    {item.documentTitle}（{item.documentCode}）
                  </p>
                  <p className="mt-1">
                    章节：{[item.chapterTitle, item.sectionTitle].filter(Boolean).join(" / ") || "未标注章节"} · 页码：
                    {item.pageNumber ?? "未标注"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
