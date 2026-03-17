"use client";

import { useState } from "react";

export const requirementTypeOptions = ["规范检索", "项目资料问答", "签证处理", "结算审核", "本地部署咨询"] as const;

type RequirementType = (typeof requirementTypeOptions)[number];

type LeadFormPayload = {
  contactName: string;
  contactMethod: string;
  email: string;
  demand: string;
  requirementType: RequirementType;
  captchaToken: string;
  website: string;
};

type LeadFormProps = {
  captchaEnabled: boolean;
};

const initialState: LeadFormPayload = {
  contactName: "",
  contactMethod: "",
  email: "",
  demand: "",
  requirementType: "规范检索",
  captchaToken: "",
  website: ""
};

export function LeadForm({ captchaEnabled }: LeadFormProps) {
  const [form, setForm] = useState(initialState);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = <K extends keyof LeadFormPayload>(field: K, value: LeadFormPayload[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setIsError(false);

    try {
      const response = await fetch("/api/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setIsError(true);
      }

      setMessage(data.message ?? (response.ok ? "提交成功，我们会尽快联系。" : "提交失败，请稍后重试。"));
      if (response.ok) {
        setForm(initialState);
      }
    } catch {
      setIsError(true);
      setMessage("提交失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="panel space-y-5 p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-700">
          联系人
          <input
            required
            value={form.contactName}
            onChange={(event) => handleChange("contactName", event.target.value)}
            className="field-input mt-2 h-10 px-3"
          />
        </label>

        <label className="text-sm text-slate-700">
          联系方式
          <input
            required
            value={form.contactMethod}
            onChange={(event) => handleChange("contactMethod", event.target.value)}
            placeholder="手机号 / 微信 / 座机"
            className="field-input mt-2 h-10 px-3"
          />
        </label>

        <label className="text-sm text-slate-700">
          邮箱
          <input
            type="email"
            required
            value={form.email}
            onChange={(event) => handleChange("email", event.target.value)}
            className="field-input mt-2 h-10 px-3"
          />
        </label>

        <label className="text-sm text-slate-700">
          需求类型
          <select
            value={form.requirementType}
            onChange={(event) => handleChange("requirementType", event.target.value as RequirementType)}
            className="field-input mt-2 h-10 bg-white px-3 py-0"
          >
            {requirementTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm text-slate-700">
        当前反馈 / 需求
        <textarea
          rows={5}
          required
          value={form.demand}
          onChange={(event) => handleChange("demand", event.target.value)}
          placeholder="请描述当前项目痛点、资料情况和预期目标。"
          className="field-input mt-2 min-h-[132px] resize-y px-3 py-2"
        />
      </label>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-800">验证码校验（预留）</p>
        <p className="mt-1 text-xs text-slate-500">
          {captchaEnabled
            ? "当前环境已启用验证码校验。请填写验证码 token。"
            : "当前环境未启用验证码校验。该区域为后续接入阿里云等服务预留。"}
        </p>
        <input
          value={form.captchaToken}
          onChange={(event) => handleChange("captchaToken", event.target.value)}
          placeholder="请输入 captcha token（MVP mock）"
          className="field-input mt-3 h-10 px-3"
        />
      </section>

      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={form.website}
        onChange={(event) => handleChange("website", event.target.value)}
        className="hidden"
        aria-hidden="true"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">用于试用评估与本地部署咨询沟通。</p>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "提交中..." : "提交试用申请"}
        </button>
      </div>

      {message ? <p className={isError ? "status-error" : "status-success"}>{message}</p> : null}
    </form>
  );
}
