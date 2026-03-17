import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: {
    chunkId: string;
  };
};

async function getChunkDetail(chunkId: string) {
  return prisma.documentChunk.findUnique({
    where: { id: chunkId },
    select: {
      id: true,
      chapterTitle: true,
      sectionTitle: true,
      chunkText: true,
      pageNumber: true,
      sortOrder: true,
      createdAt: true,
      document: {
        select: {
          id: true,
          title: true,
          code: true,
          category: true,
          source: true,
          version: true,
          publishDate: true
        }
      }
    }
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const chunk = await getChunkDetail(params.chunkId);
  if (!chunk) {
    return {
      title: "条款详情不存在"
    };
  }

  return {
    title: `${chunk.document.title} - 条款详情`,
    description: `查看 ${chunk.document.code} 的条款原文定位信息与章节内容。`
  };
}

export default async function ChunkDetailPage({ params }: PageProps) {
  const chunk = await getChunkDetail(params.chunkId);
  if (!chunk) {
    notFound();
  }

  const clausePath = [chunk.chapterTitle, chunk.sectionTitle].filter(Boolean).join(" / ");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="section-title">条款详情</h1>
        <Link href="/search" className="text-sm font-medium text-brand-700 transition hover:text-brand-900">
          返回检索页
        </Link>
      </div>

      <section className="panel p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-brand-700">{chunk.document.code}</span>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600">{chunk.document.category}</span>
          {chunk.document.publishDate ? <span>发布日期：{chunk.document.publishDate.toISOString().slice(0, 10)}</span> : null}
        </div>
        <h2 className="mt-3 text-xl font-semibold text-brand-900">{chunk.document.title}</h2>
        <p className="mt-2 text-sm text-slate-600">条款章节：{clausePath || "未标注章节"}</p>
        <p className="mt-1 text-sm text-slate-600">
          页码：{chunk.pageNumber ?? "未标注"} · 排序：{chunk.sortOrder}
        </p>
        <p className="mt-1 text-sm text-slate-600">版本：{chunk.document.version}</p>
      </section>

      <section className="panel p-6">
        <h3 className="text-sm font-semibold text-brand-900">原文内容</h3>
        <article className="mt-3 whitespace-pre-wrap text-sm leading-8 text-slate-700">{chunk.chunkText}</article>
      </section>

      {chunk.document.source ? (
        <section className="panel p-5 text-sm text-slate-600">来源标识：{chunk.document.source}</section>
      ) : null}
    </div>
  );
}
