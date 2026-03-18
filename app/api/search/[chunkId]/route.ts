import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: {
    chunkId: string;
  };
};

export async function GET(_request: Request, { params }: Params) {
  const chunk = await prisma.documentChunk.findUnique({
    where: { id: params.chunkId },
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

  if (!chunk) {
    return NextResponse.json({ message: "未找到条款内容" }, { status: 404 });
  }

  if (!chunk.document.source?.startsWith("/uploads/documents/")) {
    return NextResponse.json({ message: "条款内容不存在或已下线" }, { status: 404 });
  }

  return NextResponse.json(chunk);
}
