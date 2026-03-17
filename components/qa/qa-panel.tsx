"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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
  recordId?: string | null;
};

type AuthUser = {
  id: string;
  username: string;
  displayName: string | null;
};

type HistoryListItem = {
  id: string;
  question: string;
  answerPreview: string;
  modelName: string | null;
  createdAt: string;
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

  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryListItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState("");

  const canSubmit = useMemo(() => question.trim().length >= 4 && !loading, [question, loading]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/user/qa-history?take=80", { method: "GET" });
      const payload = (await response.json()) as { items?: HistoryListItem[]; message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "历史加载失败");
      }
      setHistoryList(payload.items ?? []);
    } catch {
      setHistoryList([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchAuthAndHistory = useCallback(async () => {
    setAuthLoading(true);
    try {
      const authRes = await fetch("/api/auth/me", { method: "GET" });
      const authData = (await authRes.json()) as { authenticated?: boolean; user?: AuthUser | null };
      if (authRes.ok && authData.authenticated && authData.user) {
        setUser(authData.user);
        await fetchHistory();
      } else {
        setUser(null);
        setHistoryList([]);
      }
    } catch {
      setUser(null);
      setHistoryList([]);
    } finally {
      setAuthLoading(false);
    }
  }, [fetchHistory]);

  useEffect(() => {
    fetchAuthAndHistory();
  }, [fetchAuthAndHistory]);

  const loadHistoryDetail = async (id: string) => {
    setActiveHistoryId(id);
    setError("");

    try {
      const response = await fetch(`/api/user/qa-history/${id}`, { method: "GET" });
      const payload = (await response.json()) as {
        message?: string;
        item?: {
          question: string;
          answer: string;
          modelName: string | null;
          citations: Citation[];
        };
      };
      if (!response.ok || !payload.item) {
        throw new Error(payload.message ?? "历史详情加载失败");
      }

      setQuestion(payload.item.question);
      setResult({
        answer: payload.item.answer,
        citations: payload.item.citations,
        modelName: payload.item.modelName || "-"
      });
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "历史详情加载失败");
    }
  };

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
    setActiveHistoryId("");

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

      if (user) {
        await fetchHistory();
        if (payload.recordId) {
          setActiveHistoryId(payload.recordId);
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "问答失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h1 className="section-title">造价AI小助手</h1>
        <p className="section-subtitle">先检索依据，再生成回答。左侧可查看当前账号历史提问。</p>
      </section>

      <section className="status-warning">
        <p className="font-semibold">风险提示</p>
        <p className="mt-1">回答仅供参考，具体以合同、补充协议、项目资料为准。</p>
      </section>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <aside className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-brand-900">历史提问</p>
            <button
              type="button"
              onClick={() => {
                setActiveHistoryId("");
                setQuestion("");
                setResult(null);
              }}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:border-brand-600 hover:text-brand-700"
            >
              新提问
            </button>
          </div>

          {authLoading ? <p className="text-xs text-slate-500">正在加载用户信息...</p> : null}

          {!authLoading && !user ? (
            <div className="space-y-2 text-sm text-slate-600">
              <p>登录后可按账号查看个人历史提问与回答。</p>
              <div className="flex gap-2">
                <Link href="/login" className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:border-brand-600 hover:text-brand-700">
                  登录
                </Link>
                <Link href="/register" className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:border-brand-600 hover:text-brand-700">
                  注册
                </Link>
              </div>
            </div>
          ) : null}

          {!authLoading && user ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">当前用户：{user.displayName || user.username}</p>
              <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {historyLoading ? <p className="text-xs text-slate-500">历史加载中...</p> : null}
                {!historyLoading && historyList.length === 0 ? (
                  <p className="text-xs text-slate-500">暂无历史提问</p>
                ) : null}
                {historyList.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => loadHistoryDetail(item.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                      activeHistoryId === item.id
                        ? "border-brand-600 bg-brand-50"
                        : "border-slate-200 bg-white hover:border-brand-400"
                    }`}
                  >
                    <p className="line-clamp-2 text-xs font-medium text-slate-800">{item.question}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <div className="space-y-5">
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
      </div>
    </div>
  );
}
