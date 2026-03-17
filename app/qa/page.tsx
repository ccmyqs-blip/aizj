import type { Metadata } from "next";
import { QAPanel } from "@/components/qa/qa-panel";

export const metadata: Metadata = {
  title: "知识问答",
  description: "问规则：基于规范切片检索生成回答，并附引用依据。回答仅供参考。",
  openGraph: {
    title: "知识问答 | 工程造价规范检索助手",
    description: "先检索依据再回答，返回 answer + citations，适用于造价规则核对。",
    type: "website"
  }
};

export default function QAPage() {
  return <QAPanel />;
}
