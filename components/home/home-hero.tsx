"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const highlights = ["条款定位", "依据引用", "规则问答"];

export function HomeHero() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = keyword.trim();
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/search");
  };

  return (
    <section className="hero-panel p-6 md:p-8">
      <div className="grid gap-6 md:grid-cols-[1.5fr_1fr] md:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-brand-700">ENGINEERING COST INTELLIGENCE</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-brand-900 md:text-4xl">查规范 · 查依据 · 问规则</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
            面向造价师、预算员、造价咨询团队。优先保证“可查、可引、可用”，快速定位规范条款并输出可复核依据。
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 md:flex-row">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="输入规范名称、编号或关键词，例如：GB 50500、工程变更、结算审核"
              className="field-input flex-1"
            />
            <button type="submit" className="btn-secondary h-11 md:px-6">
              搜索规范
            </button>
          </form>
        </div>

        <aside className="rounded-2xl border border-brand-100 bg-white/95 p-5">
          <p className="text-xs font-semibold tracking-wide text-brand-700">核心特性</p>
          <ul className="mt-3 space-y-3">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-slate-700">
                <span className="inline-block h-2 w-2 rounded-full bg-teal-600" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-6 text-slate-500">先检索依据，再给答案。答案必须可追溯到条款来源。</p>
        </aside>
      </div>
    </section>
  );
}
