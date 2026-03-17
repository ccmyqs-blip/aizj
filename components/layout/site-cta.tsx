import Link from "next/link";

export function SiteCta() {
  return (
    <section className="border-y border-slate-200/80 bg-white/85 py-6">
      <div className="container-layout rounded-2xl border border-slate-200 bg-gradient-to-r from-brand-50 to-white p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wide text-brand-700">规范检索与问答</p>
            <p className="mt-1 text-sm leading-7 text-slate-700">聚焦查规范、查依据、问规则，保持页面入口简洁。</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/search" className="btn-secondary">
              进入规范检索
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
