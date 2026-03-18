import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCandidateAbsolutePathsByFileName } from "@/lib/document-storage";

type Params = {
  params: {
    slug: string[];
  };
};

function toContentType(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".pdf") {
    return "application/pdf";
  }
  if (ext === ".doc") {
    return "application/msword";
  }
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (ext === ".txt") {
    return "text/plain; charset=utf-8";
  }
  return "application/octet-stream";
}

function resolveRequestedFileName(slug: string[] | undefined) {
  if (!Array.isArray(slug) || slug.length === 0) {
    return null;
  }
  const joined = slug.join("/");
  if (joined.includes("..") || joined.includes("\\") || joined.includes("\0")) {
    return null;
  }
  return joined;
}

async function locateExistingFile(fileName: string) {
  const candidates = getCandidateAbsolutePathsByFileName(fileName);
  for (const filePath of candidates) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.isFile()) {
        return {
          filePath,
          stats
        };
      }
    } catch {
      // ignore and try next path
    }
  }
  return null;
}

async function buildFileResponse(fileName: string, method: "GET" | "HEAD") {
  const found = await locateExistingFile(fileName);
  if (!found) {
    return NextResponse.json({ message: "文件不存在" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", toContentType(fileName));
  headers.set("Content-Length", String(found.stats.size));
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);

  if (method === "HEAD") {
    return new NextResponse(null, {
      status: 200,
      headers
    });
  }

  const nodeStream = createReadStream(found.filePath);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    status: 200,
    headers
  });
}

export async function GET(_request: Request, { params }: Params) {
  const fileName = resolveRequestedFileName(params.slug);
  if (!fileName) {
    return NextResponse.json({ message: "无效文件路径" }, { status: 400 });
  }
  return buildFileResponse(fileName, "GET");
}

export async function HEAD(_request: Request, { params }: Params) {
  const fileName = resolveRequestedFileName(params.slug);
  if (!fileName) {
    return new NextResponse(null, { status: 400 });
  }
  return buildFileResponse(fileName, "HEAD");
}

