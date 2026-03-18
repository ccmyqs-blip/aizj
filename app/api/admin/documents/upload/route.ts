import { promises as fs } from "node:fs";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueDocumentIngest } from "@/lib/document-upload-queue";
import {
  buildDocumentPublicPath,
  getUploadStorageDir
} from "@/lib/document-storage";

export const runtime = "nodejs";

const MAX_FILES_PER_UPLOAD = Number(process.env.ADMIN_UPLOAD_MAX_FILES ?? 10);
const allowedExtSet = new Set([".pdf", ".doc", ".docx"]);
const DOCUMENT_VERSION = "v1";

type UploadAcceptedResult = {
  document: {
    id: string;
    title: string;
    code: string;
    category: string;
    source: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  meta: {
    fileName: string;
    fileSize: number;
  };
};

function sanitizeBaseName(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\u4e00-\u9fff-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function normalizeUploadFiles(formData: FormData) {
  const fromFiles = formData.getAll("files").filter((item): item is File => item instanceof File);
  if (fromFiles.length > 0) {
    return fromFiles;
  }

  const single = formData.get("file");
  if (single instanceof File) {
    return [single];
  }
  return [];
}

function buildTitle(titleInput: string, fileName: string, index: number, total: number) {
  const fallback = sanitizeBaseName(fileName) || "上传文档";
  if (!titleInput) {
    return fallback;
  }
  if (total === 1) {
    return titleInput;
  }
  return `${titleInput}-${index + 1}`.slice(0, 120);
}

function buildCode(codeInput: string, fileName: string, index: number, total: number) {
  if (!codeInput) {
    return `UP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }
  if (total === 1) {
    return codeInput;
  }
  const suffix = sanitizeBaseName(fileName).slice(0, 20) || String(index + 1);
  return `${codeInput}-${suffix}-${index + 1}`.slice(0, 80);
}

async function saveIncomingFile(file: File, uploadDir: string) {
  const originalName = file.name || "uploaded-file";
  const ext = path.extname(originalName).toLowerCase();
  const safeBaseName = sanitizeBaseName(originalName) || "document";
  const fileName = `${Date.now()}-${randomUUID()}-${safeBaseName}${ext}`;
  const filePath = path.join(uploadDir, fileName);
  const publicPath = buildDocumentPublicPath(fileName);

  const webStream = file.stream();
  const nodeStream = Readable.fromWeb(webStream as NodeReadableStream<Uint8Array>);
  await pipeline(nodeStream, createWriteStream(filePath));

  return {
    filePath,
    publicPath,
    originalName
  };
}

async function acceptOneFile(input: {
  file: File;
  title: string;
  code: string;
  category: string;
  uploadDir: string;
}): Promise<UploadAcceptedResult> {
  const { file, title, code, category, uploadDir } = input;
  const saved = await saveIncomingFile(file, uploadDir);

  try {
    const document = await prisma.document.upsert({
      where: {
        code_version: {
          code,
          version: DOCUMENT_VERSION
        }
      },
      create: {
        title,
        code,
        category,
        source: saved.publicPath,
        version: DOCUMENT_VERSION,
        publishDate: new Date(),
        status: "PROCESSING",
        ingestStage: "EXTRACTING",
        ingestError: null,
        textCoverage: 0,
        pageCount: 0,
        parsedPageCount: 0,
        ocrUsed: false,
        lastIngestAt: new Date()
      },
      update: {
        title,
        category,
        source: saved.publicPath,
        status: "PROCESSING",
        ingestStage: "EXTRACTING",
        ingestError: null,
        textCoverage: 0,
        pageCount: 0,
        parsedPageCount: 0,
        ocrUsed: false,
        lastIngestAt: new Date()
      },
      select: {
        id: true,
        title: true,
        code: true,
        category: true,
        source: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    await enqueueDocumentIngest({
      documentId: document.id,
      filePath: saved.filePath,
      fileName: saved.originalName
    });

    return {
      document: {
        ...document,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString()
      },
      meta: {
        fileName: saved.originalName,
        fileSize: file.size
      }
    };
  } catch (error) {
    await fs.rm(saved.filePath, { force: true }).catch(() => undefined);
    if ((error as { code?: string }).code === "P2002") {
      throw new Error(`文件 ${saved.originalName} 编号重复，请修改 code 后重试`);
    }
    throw error;
  }
}

export async function POST(request: Request) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ message: "未登录或会话失效" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ message: "请求格式错误" }, { status: 400 });
  }

  const files = normalizeUploadFiles(formData);
  if (files.length === 0) {
    return NextResponse.json({ message: "请上传文件" }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return NextResponse.json({ message: `单次最多上传 ${MAX_FILES_PER_UPLOAD} 个文件` }, { status: 400 });
  }

  for (const file of files) {
    if (file.size <= 0) {
      return NextResponse.json({ message: `文件 ${file.name || "unknown"} 不能为空` }, { status: 400 });
    }
    const ext = path.extname(file.name || "").toLowerCase();
    if (!allowedExtSet.has(ext)) {
      return NextResponse.json({ message: `文件 ${file.name || "unknown"} 格式不支持，仅支持 PDF、DOC、DOCX` }, { status: 400 });
    }
  }

  const titleInput = String(formData.get("title") ?? "").trim();
  const categoryInput = String(formData.get("category") ?? "").trim();
  const codeInput = String(formData.get("code") ?? "").trim();
  const category = categoryInput || "UPLOADED";

  const uploadDir = getUploadStorageDir();
  await fs.mkdir(uploadDir, { recursive: true });

  const success: UploadAcceptedResult[] = [];
  const failed: Array<{ fileName: string; message: string }> = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const title = buildTitle(titleInput, file.name, index, files.length);
    const code = buildCode(codeInput, file.name, index, files.length);

    try {
      const result = await acceptOneFile({
        file,
        title,
        code,
        category,
        uploadDir
      });
      success.push(result);
    } catch (error) {
      failed.push({
        fileName: file.name || `file-${index + 1}`,
        message: error instanceof Error ? error.message : "上传失败"
      });
    }
  }

  if (success.length === 0) {
    return NextResponse.json(
      {
        message: failed[0]?.message ?? "上传失败，请稍后重试",
        errors: failed
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      message:
        failed.length === 0
          ? `上传已接收，共 ${success.length} 个文件，后台处理中`
          : `部分接收成功：成功 ${success.length} 个，失败 ${failed.length} 个`,
      document: success[0].document,
      documents: success.map((item) => item.document),
      meta: {
        uploaderIp: getClientIp(request),
        totalFiles: files.length,
        successFiles: success.length,
        failedFiles: failed.length
      },
      errors: failed
    },
    { status: 202 }
  );
}
