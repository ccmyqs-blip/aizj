import Link from "next/link";

export function HomeCta() {
  return (
    <section className="panel bg-gradient-to-r from-white to-brand-50 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-brand-900">企业侧可申请内部试用</h2>
          <p className="mt-1 text-sm text-slate-600">支持项目资料专项分析与本地部署咨询，按场景给出试用路径。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/trial" className="btn-primary">
            申请试用
          </Link>
          <Link href="/trial" className="btn-secondary">
            咨询本地部署
          </Link>
        </div>
      </div>
    </section>
  );
}
