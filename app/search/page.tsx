import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchPageClient } from "@/components/search/search-page-client";

export const metadata: Metadata = {
  title: "规范检索",
  description: "查规范、查依据：按名称、编号、条文关键词检索工程造价相关规范并定位原文。",
  openGraph: {
    title: "规范检索 | 工程造价规范检索助手",
    description: "支持规范名称、编号、条文内容检索，可定位章节与页码。",
    type: "website"
  }
};

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="panel p-5 text-sm text-slate-500">正在加载检索页面...</div>}>
      <SearchPageClient />
    </Suspense>
  );
}
