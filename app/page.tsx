import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QAPanel } from "@/components/qa/qa-panel";
import { HomeHero } from "@/components/home/home-hero";
import { CoreCapabilities } from "@/components/home/core-capabilities";
import { ApplicableScenarios } from "@/components/home/applicable-scenarios";
import { RiskNotice } from "@/components/home/risk-notice";
import { getAuthenticatedUser } from "@/lib/user-auth";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "查规范、查依据、问规则",
  description: "工程造价规范检索与问答工具：查规范、查依据、问规则、申请试用。",
  keywords: ["工程造价", "规范检索", "计价依据", "造价问答", "试用"],
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "查规范、查依据、问规则 | 工程造价规范检索助手",
    description: "面向造价师和造价咨询团队的轻量检索与问答工具。",
    type: "website",
    url: `${siteUrl}/`
  }
};

export default async function HomePage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-7 md:space-y-10">
      <QAPanel />
      <HomeHero />
      <CoreCapabilities />
      <ApplicableScenarios />
      <RiskNotice />
    </div>
  );
}
