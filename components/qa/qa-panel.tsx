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
  conversationId?: string | null;
  turnIndex?: number | null;
  message?: string;
};

type AuthUser = {
  id: string;
  username: string;
  displayName: string | null;
};

type ConversationListItem = {
  id: string;
  title: string;
  lastQuestion: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

type ConversationMessage = {
  id: string;
  question: string;
  answer: string;
  modelName: string | null;
  createdAt: string;
  turnIndex: number | null;
  citations: Citation[];
};

type ConversationDetail = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
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

  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [activeConversationTitle, setActiveConversationTitle] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  const canSubmit = useMemo(() => question.trim().length >= 4 && !loading, [question, loading]);

  const fetchConversations = useCallback(
    async (preferredId?: string) => {
      setHistoryLoading(true);
      try {
        const response = await fetch("/api/user/qa-history?take=80", { method: "GET" });
        const payload = (await response.json()) as { items?: ConversationListItem[]; message?: string };
        if (!response.ok) {
          throw new Error(payload.message ?? "会话列表加载失败");
        }

        const items = payload.items ?? [];
        setConversations(items);

        const nextId =
          preferredId && items.some((item) => item.id === preferredId)
            ? preferredId
            : activeConversationId && items.some((item) => item.id === activeConversationId)
              ? activeConversationId
              : items[0]?.id ?? "";

        if (nextId && nextId !== activeConversationId) {
          setActiveConversationId(nextId);
        }

        if (!nextId) {
          setActiveConversationId("");
          setActiveConversationTitle("");
          setMessages([]);
        }
      } catch {
        setConversations([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [activeConversationId]
  );

  const loadConversationDetail = useCallback(async (conversationId: string) => {
    if (!conversationId) {
      setActiveConversationTitle("");
      setMessages([]);
      return;
    }

    setConversationLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/user/qa-history/${conversationId}?take=120`, { method: "GET" });
      const payload = (await response.json()) as { message?: string; item?: ConversationDetail };
      if (!response.ok || !payload.item) {
        throw new Error(payload.message ?? "会话详情加载失败");
      }

      setActiveConversationTitle(payload.item.title);
      setMessages(payload.item.messages ?? []);
    } catch (detailError) {
      setMessages([]);
      setError(detailError instanceof Error ? detailError.message : "会话详情加载失败");
    } finally {
      setConversationLoading(false);
    }
  }, []);

  const fetchAuthAndHistory = useCallback(async () => {
    setAuthLoading(true);
    try {
      const authRes = await fetch("/api/auth/me", { method: "GET" });
      const authData = (await authRes.json()) as { authenticated?: boolean; user?: AuthUser | null };
      if (authRes.ok && authData.authenticated && authData.user) {
        setUser(authData.user);
        await fetchConversations();
      } else {
        setUser(null);
        setConversations([]);
        setActiveConversationId("");
        setActiveConversationTitle("");
        setMessages([]);
      }
    } catch {
      setUser(null);
      setConversations([]);
      setActiveConversationId("");
      setActiveConversationTitle("");
      setMessages([]);
    } finally {
      setAuthLoading(false);
    }
  }, [fetchConversations]);

  useEffect(() => {
    fetchAuthAndHistory();
  }, [fetchAuthAndHistory]);

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }
    loadConversationDetail(activeConversationId);
  }, [activeConversationId, loadConversationDetail]);

  const handleNewConversation = () => {
    setActiveConversationId("");
    setActiveConversationTitle("");
    setMessages([]);
    setQuestion("");
    setError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const currentQuestion = question.trim();

    if (currentQuestion.length < 4) {
      setError("问题至少输入 4 个字，请补充具体场景。");
      return;
    }

    if (!user) {
      setError("请先登录后再提问。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/qa/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: currentQuestion,
          conversationId: activeConversationId || undefined
        })
      });

      const payload = (await response.json()) as AskResponse;
      if (!response.ok) {
        throw new Error(payload.message ?? "问答请求失败");
      }

      setQuestion("");
      const nextConversationId = payload.conversationId || activeConversationId;
      if (nextConversationId) {
        setActiveConversationId(nextConversationId);
        await Promise.all([loadConversationDetail(nextConversationId), fetchConversations(nextConversationId)]);
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
        <p className="section-subtitle">支持多轮连续对话，可按会话管理问题上下文并随时新开会话。</p>
      </section>

      <section className="status-warning">
        <p className="font-semibold">风险提示</p>
        <p className="mt-1">回答仅供参考，具体以合同、补充协议、项目资料为准。</p>
      </section>

      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        <aside className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-brand-900">会话</p>
            <button
              type="button"
              onClick={handleNewConversation}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:border-brand-600 hover:text-brand-700"
            >
              新开会话
            </button>
          </div>

          {authLoading ? <p className="text-xs text-slate-500">正在加载用户信息...</p> : null}

          {!authLoading && !user ? (
            <div className="space-y-2 text-sm text-slate-600">
              <p>登录后可使用持续对话与会话管理。</p>
              <div className="flex gap-2">
                <Link
                  href="/login"
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:border-brand-600 hover:text-brand-700"
                >
                  登录
                </Link>
                <Link
                  href="/register"
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:border-brand-600 hover:text-brand-700"
                >
                  注册
                </Link>
              </div>
            </div>
          ) : null}

          {!authLoading && user ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">当前用户：{user.displayName || user.username}</p>
              <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {historyLoading ? <p className="text-xs text-slate-500">会话加载中...</p> : null}
                {!historyLoading && conversations.length === 0 ? (
                  <p className="text-xs text-slate-500">暂无会话，先提一个问题开始。</p>
                ) : null}
                {conversations.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveConversationId(item.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                      activeConversationId === item.id
                        ? "border-brand-600 bg-brand-50"
                        : "border-slate-200 bg-white hover:border-brand-400"
                    }`}
                  >
                    <p className="line-clamp-1 text-xs font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] text-slate-600">{item.lastQuestion || "无提问内容"}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {new Date(item.updatedAt).toLocaleString("zh-CN")} · {item.messageCount} 轮
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <div className="space-y-4">
          <section className="panel p-4">
            <p className="text-sm font-semibold text-slate-900">{activeConversationTitle || "新会话"}</p>
            <p className="mt-1 text-xs text-slate-500">
              {activeConversationId
                ? `会话ID：${activeConversationId}`
                : "当前未选择历史会话，发送问题后自动创建新会话。"}
            </p>
          </section>

          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-slate-900">对话内容</h2>

            {conversationLoading ? <p className="mt-3 text-sm text-slate-500">会话加载中...</p> : null}
            {!conversationLoading && messages.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">暂无消息，输入问题开始对话。</p>
            ) : null}

            <div className="mt-3 max-h-[560px] space-y-4 overflow-y-auto pr-1">
              {messages.map((message) => (
                <article key={message.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="rounded-lg bg-slate-100 p-3">
                    <p className="text-xs text-slate-500">你 · {new Date(message.createdAt).toLocaleString("zh-CN")}</p>
                    <p className="mt-1 text-sm text-slate-900">{message.question}</p>
                  </div>

                  <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-3">
                    <p className="text-xs text-slate-500">助手 · 模型：{message.modelName || "-"}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-8 text-slate-800">{message.answer}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-600">依据引用</p>
                    {message.citations.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {message.citations.map((citation) => {
                          const clausePath = [citation.chapterTitle, citation.sectionTitle].filter(Boolean).join(" / ");
                          return (
                            <div
                              key={`${message.id}-${citation.chunkId}`}
                              className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                            >
                              <p className="text-xs font-medium text-slate-700">
                                {citation.documentTitle}（{citation.documentCode}）
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                章节：{clausePath || "未标注章节"} · 页码：{citation.pageNumber ?? "未标注"}
                              </p>
                              <p className="mt-1 text-xs text-slate-700">{citation.excerpt}</p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">该轮暂无可用引用依据。</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <form onSubmit={handleSubmit} className="panel space-y-4 p-5">
            <textarea
              rows={4}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="请输入工程造价相关问题，例如：工程变更引起的价款调整如何处理？"
              className="field-input min-h-[130px] resize-y py-3"
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

            {error ? <div className="status-error">{error}</div> : null}

            <div className="flex items-center justify-end">
              <button type="submit" disabled={!canSubmit} className="btn-primary">
                {loading ? "正在生成..." : "发送"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
