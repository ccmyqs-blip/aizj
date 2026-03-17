import Link from "next/link";

const scenarios = [
  {
    title: "签证事项核对",
    description: "针对现场签证争议，快速检索对应计价依据和条款口径。"
  },
  {
    title: "变更计价判断",
    description: "围绕设计变更与工程量调整，核对适用条款，降低口径偏差。"
  },
  {
    title: "结算审核支撑",
    description: "在结算复核阶段定位章节、页码与原文片段，便于复核留痕。"
  },
  {
    title: "计价依据查询",
    description: "按规范名称、编号或关键词查询常见计价依据。"
  }
];

export function ApplicableScenarios() {
  return (
    <section className="space-y-4">
      <h2 className="section-title">适用场景</h2>
      <p className="section-subtitle">适合造价咨询和企业成本管理团队的高频核对任务。</p>

      <div className="grid gap-4 md:grid-cols-2">
        {scenarios.map((item, index) => (
          <article key={item.title} className="panel p-5">
            <p className="text-xs font-semibold tracking-wide text-brand-600">SCENARIO {String(index + 1).padStart(2, "0")}</p>
            <h3 className="mt-2 text-base font-semibold text-slate-900">{item.title}</h3>
            <p className="mt-2 text-sm leading-7 text-slate-600">{item.description}</p>
          </article>
        ))}
      </div>

      <p className="text-sm text-slate-600">
        需要结合在手项目做专项分析，可前往
        <Link href="/trial" className="mx-1 font-semibold text-brand-700 hover:text-brand-900">
          试用入口
        </Link>
        提交需求。
      </p>
    </section>
  );
}
