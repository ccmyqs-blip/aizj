import Link from "next/link";
import type { Route } from "next";

const navItems: Array<{ href: Route; label: string }> = [
  { href: "/", label: "首页" },
  { href: "/search", label: "规范检索" },
  { href: "/qa", label: "问规则" },
  { href: "/trial", label: "试用申请" },
  { href: "/admin", label: "后台" }
];

export function TopNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur">
      <div className="container-layout flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-xs font-bold text-brand-700">
            造价
          </span>
          <span className="text-sm font-semibold tracking-wide text-brand-900">工程造价规范检索助手</span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-slate-700 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-2 py-1 transition hover:bg-brand-50 hover:text-brand-700"
            >
              {item.label}
            </Link>
          ))}
          <Link href="/trial" className="btn-primary h-10 px-4 py-0">
            申请试用
          </Link>
        </nav>
      </div>

      <nav className="container-layout flex gap-2 overflow-x-auto pb-3 text-sm text-slate-700 md:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
