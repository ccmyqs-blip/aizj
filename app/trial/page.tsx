import type { Metadata } from "next";
import { LeadForm } from "@/components/leads/lead-form";

export const metadata: Metadata = {
  title: "试用",
  description: "提交试用需求，申请项目资料专项分析或本地部署咨询。"
};

export default function TrialPage() {
  return (
    <div className="space-y-6">
      <section className="panel bg-gradient-to-r from-white to-brand-50 p-6">
        <h1 className="section-title">试用申请</h1>
        <p className="section-subtitle">
          面向造价咨询公司与企业成本管理团队，支持内部试用、项目资料专项分析、本地部署咨询。
        </p>
      </section>
      <LeadForm />
    </div>
  );
}
