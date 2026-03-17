"use client";

import Link from "next/link";
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

const suggestions = [
  "GB 50500 工程变更如何调整合同价款？",
  "签证事项在结算审核时一般看哪些依据？",
  "暂列金额与暂估价的适用区别是什么？"
];

export function QAPanel() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);

  const canSubmit = useMemo(() => question.trim().length >= 4 && !loading, [question, loading]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const currentQuestion = question.trim();
    if (currentQuestion.length < 4) {
      setError("问题至少输入 4 个字，请补充具体场景。");
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
        body: JSON.stringify({ question: currentQuestion })
      });

      const payload = (await response.json()) as AskResponse & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "问答请求失败");
      }

      setResult({
        answer: payload.answer,
        citations: payload.citations ?? [],
        modelName: payload.modelName
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "问答失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h1 className="section-title">问规则</h1>
        <p className="section-subtitle">先检索依据，再生成回答。回答附引用，便于复核。</p>
      </section>

      <section className="panel flex flex-col gap-3 bg-gradient-to-r from-white to-brand-50 p-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-slate-700">企业可申请内部试用，支持项目资料专项分析与本地部署咨询。</p>
        <Link href="/trial" className="btn-primary">
          申请试用
        </Link>
      </section>

      <section className="status-warning">
        <p className="font-semibold">风险提示</p>
        <p className="mt-1">回答仅供参考，具体以合同、补充协议、项目资料为准。</p>
      </section>

      <form onSubmit={handleSubmit} className="panel space-y-4 p-5">
        <textarea
          rows={5}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="请输入工程造价相关问题，例如：工程变更引起的价款调整如何处理？"
          className="field-input min-h-[140px] resize-y py-3"
        />

        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          {suggestions.map((item) => (
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

        <div className="flex items-center justify-end">
          <button type="submit" disabled={!canSubmit} className="btn-primary">
            {loading ? "正在生成..." : "提交问题"}
          </button>
        </div>
      </form>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold text-slate-900">回答</h2>

        {loading ? <p className="mt-3 text-sm text-slate-500">正在检索依据并生成回答，请稍候...</p> : null}
        {error ? <div className="status-error mt-3">{error}</div> : null}
        {!loading && !error && !result ? <p className="mt-3 text-sm text-slate-500">提交问题后将在此处展示回答。</p> : null}
        {result ? <p className="mt-3 whitespace-pre-wrap text-sm leading-8 text-slate-700">{result.answer}</p> : null}
        {result ? <p className="mt-3 text-xs text-slate-500">模型：{result.modelName}</p> : null}
      </section>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold text-slate-900">依据引用</h2>

        {result && result.citations.length > 0 ? (
          <div className="mt-3 space-y-3">
            {result.citations.map((citation) => {
              const clausePath = [citation.chapterTitle, citation.sectionTitle].filter(Boolean).join(" / ");
              return (
                <article key={citation.chunkId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    {citation.documentTitle}（{citation.documentCode}）
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    章节：{clausePath || "未标注章节"} · 页码：{citation.pageNumber ?? "未标注"}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-700">{citation.excerpt}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">当前无可用引用依据。</p>
        )}
      </section>
    </div>
  );
}
