import path from "node:path";
import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = {
  params: {
    id: string;
  };
};

function unauthorized() {
  return NextResponse.json({ message: "未登录或会话失效" }, { status: 401 });
}

function isUploadedDocumentSource(source: string | null) {
  return Boolean(source && source.startsWith("/uploads/documents/"));
}

function toAbsolutePublicPath(publicPath: string) {
  const relative = publicPath.replace(/^\/+/, "");
  return path.join(process.cwd(), "public", relative);
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!isAdminAuthenticated()) {
    return unauthorized();
  }

  const target = await prisma.document.findUnique({
    where: {
      id: params.id
    },
    select: {
      id: true,
      source: true
    }
  });

  if (!target) {
    return NextResponse.json({ message: "文档不存在" }, { status: 404 });
  }

  if (!isUploadedDocumentSource(target.source)) {
    return NextResponse.json({ message: "仅支持删除后台上传文档" }, { status: 400 });
  }

  try {
    await prisma.document.delete({
      where: {
        id: params.id
      }
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ message: "文档不存在" }, { status: 404 });
    }
    return NextResponse.json({ message: "文档删除失败，请稍后重试" }, { status: 500 });
  }

  const absoluteFilePath = toAbsolutePublicPath(target.source!);
  await fs.rm(absoluteFilePath, { force: true }).catch(() => undefined);

  return NextResponse.json({ message: "文档删除成功" });
}
