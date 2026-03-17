"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function UserRegisterForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setIsError(false);

    if (password !== confirmPassword) {
      setLoading(false);
      setIsError(true);
      setMessage("两次输入的密码不一致");
      return;
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          password,
          displayName
        })
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "注册失败");
      }

      setMessage("注册成功，正在进入首页...");
      setUsername("");
      setDisplayName("");
      setPassword("");
      setConfirmPassword("");
      router.replace("/");
      router.refresh();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "注册失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="panel mx-auto w-full max-w-md space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">用户注册</h1>
        <p className="mt-1 text-sm text-slate-500">仅需用户名与密码，不需要邮箱或手机号。</p>
      </div>

      <label className="block text-sm text-slate-700">
        用户名
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="3-24位，字母数字下划线"
          className="field-input mt-2 h-10 px-3"
          required
        />
      </label>

      <label className="block text-sm text-slate-700">
        昵称（选填）
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="显示名称"
          className="field-input mt-2 h-10 px-3"
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

      <label className="block text-sm text-slate-700">
        确认密码
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="field-input mt-2 h-10 px-3"
          required
        />
      </label>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "注册中..." : "注册"}
      </button>

      {message ? <p className={isError ? "status-error" : "status-success"}>{message}</p> : null}

      <p className="text-sm text-slate-600">
        已有账号？
        <Link href="/login" className="ml-1 text-brand-700 hover:underline">
          去登录
        </Link>
      </p>
    </form>
  );
}
