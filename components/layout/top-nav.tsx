import Link from "next/link";
import type { Route } from "next";
import { getAuthenticatedUser } from "@/lib/user-auth";

const navItems: Array<{ href: Route; label: string }> = [
  { href: "/", label: "首页" },
  { href: "/search", label: "规范检索" },
  { href: "/admin", label: "后台" }
];

export async function TopNav() {
  const user = await getAuthenticatedUser();

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

          {user ? (
            <>
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
                {user.displayName || user.username}
              </span>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:border-brand-600 hover:text-brand-700"
                >
                  退出
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-2 py-1 transition hover:bg-brand-50 hover:text-brand-700">
                登录
              </Link>
              <Link href="/register" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs transition hover:border-brand-600 hover:text-brand-700">
                注册
              </Link>
            </>
          )}

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

        {user ? (
          <form action="/api/auth/logout" method="post" className="inline-flex">
            <button
              type="submit"
              className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs"
            >
              退出
            </button>
          </form>
        ) : (
          <>
            <Link
              href="/login"
              className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs"
            >
              登录
            </Link>
            <Link
              href="/register"
              className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs"
            >
              注册
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
