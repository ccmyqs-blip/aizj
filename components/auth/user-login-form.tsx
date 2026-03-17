"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function UserLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setIsError(false);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          password
        })
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "登录失败");
      }

      setMessage("登录成功，正在跳转...");
      setUsername("");
      setPassword("");
      router.replace("/");
      router.refresh();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="panel mx-auto w-full max-w-md space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">用户登录</h1>
        <p className="mt-1 text-sm text-slate-500">使用用户名和密码登录，不需要邮箱或手机号。</p>
      </div>

      <label className="block text-sm text-slate-700">
        用户名
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="例如：cost_user01"
          className="field-input mt-2 h-10 px-3"
          required
        />
      </label>

      <label className="block text-sm text-slate-700">
        密码
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="field-input mt-2 h-10 px-3"
          required
        />
      </label>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "登录中..." : "登录"}
      </button>

      {message ? <p className={isError ? "status-error" : "status-success"}>{message}</p> : null}

      <p className="text-sm text-slate-600">
        还没有账号？
        <Link href="/register" className="ml-1 text-brand-700 hover:underline">
          立即注册
        </Link>
      </p>
    </form>
  );
}
