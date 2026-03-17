"use client";

import { FormEvent, useState } from "react";

type HistoryItem = {
  id: string;
  question: string;
  answer: string;
  answerSnippet: string;
  modelName: string | null;
  score: number;
  createdAt: string;
};

export function HistoryQACard() {
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [expandedId, setExpandedId] = useState<string>("");

  const onSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = keyword.trim();

    if (q.length < 2) {
      setError("请输入至少 2 个字进行模糊搜索。");
      return;
    }

    setLoading(true);
    setError("");
    setExpandedId("");

    try {
      const response = await fetch(`/api/qa/history?q=${encodeURIComponent(q)}&take=8`, {
        method: "GET"
      });
      const payload = (await response.json()) as {
        message?: string;
        items?: HistoryItem[];
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "历史检索失败");
      }

      setItems(payload.items ?? []);
    } catch (requestError) {
      setItems([]);
      setError(requestError instanceof Error ? requestError.message : "历史检索失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel p-5 md:p-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-brand-900">历史问答复用</h2>
        <p className="text-sm leading-7 text-slate-600">
          支持模糊搜索全部历史提问与回答。优先复用已有答案，再发起新问答，可降低模型 token 消耗。
        </p>
      </div>

      <form onSubmit={onSearch} className="mt-4 flex flex-col gap-3 md:flex-row">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="输入关键词，例如：工程变更、签证、结算审核"
          className="field-input h-11"
        />
        <button type="submit" disabled={loading} className="btn-secondary h-11 px-5">
          {loading ? "检索中..." : "搜索历史问答"}
        </button>
      </form>

      {error ? <div className="status-error mt-4">{error}</div> : null}

      <div className="mt-4 max-h-[380px] space-y-3 overflow-y-auto pr-1">
        {items.length > 0 ? (
          items.map((item) => {
            const expanded = expandedId === item.id;
            return (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                  <p className="text-xs text-slate-500">模型：{item.modelName || "-"}</p>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-900">问：{item.question}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {expanded ? item.answer : item.answerSnippet}
                </p>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? "" : item.id)}
                  className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:border-brand-600 hover:text-brand-700"
                >
                  {expanded ? "收起" : "查看完整回答"}
                </button>
              </article>
            );
          })
        ) : (
          <p className="py-8 text-center text-sm text-slate-500">输入关键词后可查看历史问答结果。</p>
        )}
      </div>
    </section>
  );
}
