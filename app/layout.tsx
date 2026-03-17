import type { Metadata } from "next";
import { Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/layout/top-nav";
import { Footer } from "@/components/layout/footer";
import { FeedbackFloat } from "@/components/feedback/feedback-float";

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"]
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "工程造价规范检索助手",
    template: "%s | 工程造价规范检索助手"
  },
  description: "查规范、查依据、问规则。面向中国工程造价人员的轻量检索与问答工具。",
  openGraph: {
    title: "工程造价规范检索助手",
    description: "查规范、查依据、问规则，支持试用申请与项目资料专项分析咨询。",
    type: "website",
    url: siteUrl
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${notoSansSC.className} min-h-screen`}>
        <TopNav />
        <main className="container-layout py-8 md:py-10">{children}</main>
        <Footer />
        <FeedbackFloat />
      </body>
    </html>
  );
}
