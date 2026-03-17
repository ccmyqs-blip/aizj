import Link from "next/link";
import type { Route } from "next";

const capabilities: Array<{ title: string; desc: string; href: Route }> = [
  {
    title: "造价AI小助手",
    desc: "先检索依据再回答，回答附引用，依据不足时明确提示。",
    href: "/"
  },
  {
    title: "查规范",
    desc: "按名称、编号、关键词检索规范与条文，快速定位原文位置。",
    href: "/search"
  },
  {
    title: "查依据",
    desc: "围绕计价依据、费用组成、结算口径进行可追溯查询。",
    href: "/search"
  }
];

export function CoreCapabilities() {
  return (
    <section className="space-y-4">
      <h2 className="section-title">核心能力</h2>
      <p className="section-subtitle">以规范检索和依据可追溯为核心，优先保证业务链路完整与可复核。</p>

      <div className="grid gap-4 md:grid-cols-3">
        {capabilities.map((item) => (
          <article
            key={item.title}
            className="panel group p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[0_16px_42px_rgba(17,53,90,0.12)]"
          >
            <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
            <p className="mt-2 text-sm leading-7 text-slate-600">{item.desc}</p>
            <Link
              href={item.href}
              className="mt-4 inline-flex items-center text-sm font-semibold text-brand-700 transition group-hover:text-brand-900"
            >
              进入模块 →
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
