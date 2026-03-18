import { readFile } from "node:fs/promises";
import path from "node:path";
import { DocumentIngestError } from "@/lib/document-ingest-types";

export type OcrPage = {
  pageNumber: number;
  text: string;
};

export type OcrResult = {
  pages: OcrPage[];
  pageCount: number;
};

const OCR_ENABLED = process.env.CLOUD_OCR_ENABLED === "true";
const OCR_SUBMIT_URL = process.env.CLOUD_OCR_SUBMIT_URL ?? "";
const OCR_RESULT_URL_TEMPLATE = process.env.CLOUD_OCR_RESULT_URL_TEMPLATE ?? "";
const OCR_API_KEY = process.env.CLOUD_OCR_API_KEY ?? "";
const OCR_TIMEOUT_MS = Number(process.env.CLOUD_OCR_TIMEOUT_MS ?? 180000);
const OCR_POLL_INTERVAL_MS = Number(process.env.CLOUD_OCR_POLL_INTERVAL_MS ?? 3000);

function getAuthHeaders() {
  const headers: Record<string, string> = {};
  if (!OCR_API_KEY) {
    return headers;
  }

  headers.Authorization = `Bearer ${OCR_API_KEY}`;
  return headers;
}

function normalizePageList(raw: unknown): OcrPage[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item, index) => {
      const object = (item ?? {}) as { pageNumber?: unknown; text?: unknown; content?: unknown };
      const text = String(object.text ?? object.content ?? "").trim();
      const pageNumber = Number(object.pageNumber ?? index + 1);
      if (!text || !Number.isFinite(pageNumber) || pageNumber <= 0) {
        return null;
      }
      return {
        pageNumber,
        text
      } satisfies OcrPage;
    })
    .filter((item): item is OcrPage => Boolean(item));
}

function parseOcrPayload(payload: unknown): OcrResult | null {
  const obj = (payload ?? {}) as {
    pages?: unknown;
    text?: unknown;
    output?: {
      pages?: unknown;
      text?: unknown;
    };
    data?: {
      pages?: unknown;
      text?: unknown;
    };
    pageCount?: unknown;
  };

  const candidates = [obj.pages, obj.output?.pages, obj.data?.pages];
  let pages: OcrPage[] = [];
  for (const candidate of candidates) {
    const normalized = normalizePageList(candidate);
    if (normalized.length > 0) {
      pages = normalized;
      break;
    }
  }

  if (pages.length > 0) {
    return {
      pages,
      pageCount: Number(obj.pageCount ?? pages.length) || pages.length
    };
  }

  const text = String(obj.text ?? obj.output?.text ?? obj.data?.text ?? "").trim();
  if (!text) {
    return null;
  }

  return {
    pages: [
      {
        pageNumber: 1,
        text
      }
    ],
    pageCount: 1
  };
}

function resolveResultUrl(taskId: string) {
  if (!OCR_RESULT_URL_TEMPLATE) {
    return "";
  }

  return OCR_RESULT_URL_TEMPLATE.replace("{taskId}", encodeURIComponent(taskId));
}

async function pollOcrResult(taskId: string) {
  const resultUrl = resolveResultUrl(taskId);
  if (!resultUrl) {
    throw new DocumentIngestError("OCR_NOT_CONFIGURED", "OCR 返回 taskId 但未配置 CLOUD_OCR_RESULT_URL_TEMPLATE");
  }

  const start = Date.now();
  while (Date.now() - start < OCR_TIMEOUT_MS) {
    const response = await fetch(resultUrl, {
      headers: {
        ...getAuthHeaders()
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new DocumentIngestError("OCR_TIMEOUT", `OCR 结果轮询失败(${response.status}): ${body.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      status?: string;
      taskStatus?: string;
      task_id?: string;
      taskId?: string;
    };

    const status = String(payload.status ?? payload.taskStatus ?? "").toLowerCase();
    const parsed = parseOcrPayload(payload);
    if (parsed && (status === "done" || status === "success" || status === "completed" || status === "")) {
      return parsed;
    }

    if (status === "failed" || status === "error") {
      throw new DocumentIngestError("OCR_TIMEOUT", "OCR 任务执行失败");
    }

    await new Promise((resolve) => setTimeout(resolve, OCR_POLL_INTERVAL_MS));
  }

  throw new DocumentIngestError("OCR_TIMEOUT", `OCR 轮询超时(${OCR_TIMEOUT_MS}ms)`);
}

export function isCloudOcrEnabled() {
  return OCR_ENABLED;
}

export function validateCloudOcrConfig() {
  return OCR_ENABLED && Boolean(OCR_SUBMIT_URL);
}

export async function runCloudOcr(filePath: string): Promise<OcrResult> {
  if (!OCR_ENABLED) {
    throw new DocumentIngestError("OCR_NOT_CONFIGURED", "OCR 未启用");
  }
  if (!OCR_SUBMIT_URL) {
    throw new DocumentIngestError("OCR_NOT_CONFIGURED", "缺少 CLOUD_OCR_SUBMIT_URL");
  }

  const fileName = path.basename(filePath);
  const buffer = await readFile(filePath);
  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: "application/pdf" }), fileName);

  const response = await fetch(OCR_SUBMIT_URL, {
    method: "POST",
    headers: {
      ...getAuthHeaders()
    },
    body: formData
  });

  if (!response.ok) {
    const body = await response.text();
    throw new DocumentIngestError("OCR_TIMEOUT", `OCR 提交失败(${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    taskId?: string;
    task_id?: string;
    id?: string;
  };

  const direct = parseOcrPayload(payload);
  if (direct) {
    return direct;
  }

  const taskId = String(payload.taskId ?? payload.task_id ?? payload.id ?? "").trim();
  if (!taskId) {
    throw new DocumentIngestError("OCR_TIMEOUT", "OCR 返回结果缺少 taskId");
  }

  return pollOcrResult(taskId);
}
