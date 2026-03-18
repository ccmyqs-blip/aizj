import { promises as fs } from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { normalizeKeywords } from "@/lib/search-utils";
import { collectDomainKeywordsFromText } from "@/lib/qa/domain-synonyms";
import { DocumentIngestError, type DocumentIngestErrorCode } from "@/lib/document-ingest-types";
import { isCloudOcrEnabled, runCloudOcr, validateCloudOcrConfig } from "@/lib/ocr";

export type GeneratedChunk = {
  chapterTitle: string | null;
  sectionTitle: string | null;
  chunkText: string;
  pageNumber: number | null;
  keywords: string;
  sortOrder: number;
};

export type ExtractAndChunkResult = {
  chunks: GeneratedChunk[];
  textCoverage: number;
  pageCount: number;
  parsedPageCount: number;
  ocrUsed: boolean;
  extractedTextLength: number;
};

const CHUNK_TARGET_MIN = Number(process.env.INGEST_CHUNK_MIN_LENGTH ?? 300);
const CHUNK_TARGET_MAX = Number(process.env.INGEST_CHUNK_MAX_LENGTH ?? 600);
const CHUNK_OVERLAP = Number(process.env.INGEST_CHUNK_OVERLAP ?? 50);
const MAX_CHUNK_COUNT = Number(process.env.INGEST_MAX_CHUNK_COUNT ?? 500);
const TEXT_COVERAGE_THRESHOLD = Number(process.env.INGEST_TEXT_COVERAGE_THRESHOLD ?? 0.2);
const MIN_MEANINGFUL_PAGE_TEXT = Number(process.env.INGEST_MIN_MEANINGFUL_PAGE_TEXT ?? 20);
const PDF_PAGE_MARKER_PREFIX = "[[[PDF_PAGE_";
const PDF_PAGE_MARKER_SUFFIX = "]]]";

const ERROR_MESSAGES: Record<DocumentIngestErrorCode, string> = {
  NO_TEXT: "未提取到有效文本",
  LOW_TEXT_COVERAGE: "文本覆盖率不足",
  NO_CHUNK: "未生成有效条款切片",
  MISSING_FIELDS: "文档关键字段不完整",
  NO_PAGE_NUMBER: "切片缺少页码信息",
  OCR_NOT_CONFIGURED: "OCR 未配置或不可用",
  OCR_TIMEOUT: "OCR 处理超时",
  PARSE_ERROR: "文档解析失败",
  EMBEDDING_ERROR: "向量化失败",
  UNKNOWN: "未知错误"
};

type TextPage = {
  pageNumber: number;
  text: string;
};

function normalizeText(input: string) {
  return input
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function unique(input: string[]) {
  return Array.from(new Set(input.filter(Boolean)));
}

function normalizeCoverage(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Number(value.toFixed(4));
}

function isMeaningfulPageText(text: string) {
  return normalizeText(text).length >= MIN_MEANINGFUL_PAGE_TEXT;
}

function detectChapterTitle(text: string) {
  const firstLine = text
    .split("\n")
    .map((item) => item.trim())
    .find(Boolean);

  if (!firstLine) {
    return null;
  }

  if (/^第[一二三四五六七八九十百千万0-9]+[章节条]/.test(firstLine)) {
    return firstLine.slice(0, 80);
  }

  if (/^\d+(\.\d+){0,2}\s*/.test(firstLine)) {
    return firstLine.slice(0, 80);
  }

  return null;
}

function detectSectionTitle(text: string) {
  const firstLine = text
    .split("\n")
    .map((item) => item.trim())
    .find(Boolean);

  if (!firstLine) {
    return null;
  }

  if (/^\d+\.\d+(\.\d+)?\s*/.test(firstLine)) {
    return firstLine.slice(0, 80);
  }

  return null;
}

function splitLongTextByWindow(text: string, maxLength: number, overlap: number) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [] as string[];
  }

  const results: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const end = Math.min(normalized.length, cursor + maxLength);
    const piece = normalized.slice(cursor, end).trim();
    if (piece) {
      results.push(piece);
    }

    if (end >= normalized.length) {
      break;
    }

    cursor = Math.max(0, end - Math.max(0, overlap));
  }

  return results;
}

function chunkParagraphsByWindow(paragraphs: string[]) {
  const chunks: string[] = [];
  let buffer = "";

  for (const paragraph of paragraphs) {
    const normalized = normalizeText(paragraph);
    if (!normalized) {
      continue;
    }

    if (normalized.length > CHUNK_TARGET_MAX * 1.4) {
      if (buffer) {
        chunks.push(buffer);
        buffer = "";
      }
      chunks.push(...splitLongTextByWindow(normalized, CHUNK_TARGET_MAX, CHUNK_OVERLAP));
      continue;
    }

    const next = buffer ? `${buffer}\n\n${normalized}` : normalized;
    if (next.length <= CHUNK_TARGET_MAX) {
      buffer = next;
      continue;
    }

    if (buffer.length >= CHUNK_TARGET_MIN) {
      chunks.push(buffer);
      const overlapPrefix = buffer.slice(-Math.max(0, CHUNK_OVERLAP));
      buffer = overlapPrefix ? `${overlapPrefix}\n${normalized}` : normalized;
      continue;
    }

    chunks.push(next);
    buffer = "";
  }

  if (buffer) {
    chunks.push(buffer);
  }

  return chunks.map((item) => normalizeText(item)).filter(Boolean);
}

function buildChunksFromText(
  text: string,
  options: {
    pageNumber: number;
    startOrder: number;
    maxCount: number;
  }
) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [] as GeneratedChunk[];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const merged = chunkParagraphsByWindow(paragraphs).slice(0, Math.max(0, options.maxCount));

  return merged.map((chunkText, index) => {
    const domainTerms = collectDomainKeywordsFromText(chunkText, 18);
    const tokens = unique([...domainTerms, ...normalizeKeywords(chunkText)]).slice(0, 24);

    return {
      chapterTitle: detectChapterTitle(chunkText),
      sectionTitle: detectSectionTitle(chunkText),
      chunkText,
      pageNumber: options.pageNumber,
      keywords: tokens.join(","),
      sortOrder: options.startOrder + index
    } satisfies GeneratedChunk;
  });
}

function parsePagedPdfText(rawText: string) {
  const regex = new RegExp(`\\[\\[\\[PDF_PAGE_(\\d+)\\]\\]\\]`, "g");
  const matches = Array.from(rawText.matchAll(regex));

  if (matches.length === 0) {
    const fallbackPages = rawText
      .split(/\f+/)
      .map((item) => normalizeText(item))
      .filter(Boolean);

    return fallbackPages.map((text, index) => ({
      pageNumber: index + 1,
      text
    }));
  }

  const pages: TextPage[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const pageNumber = Number(current[1]);
    const start = (current.index ?? 0) + current[0].length;
    const end = next?.index ?? rawText.length;
    const text = normalizeText(rawText.slice(start, end));
    if (!Number.isFinite(pageNumber) || pageNumber <= 0 || !text) {
      continue;
    }

    pages.push({
      pageNumber,
      text
    });
  }

  return pages;
}

async function extractPdfPagesNative(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse = ((mod as unknown as { default?: unknown }).default ?? mod) as (
    input: Buffer,
    options?: Record<string, unknown>
  ) => Promise<{ text?: string; numpages?: number }>;

  let renderedText = "";
  let renderedPageCount = 0;

  try {
    let pageCounter = 0;
    const rendered = await pdfParse(buffer, {
      pagerender: async (pageData: {
        getTextContent: (options: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }) => Promise<{
          items: Array<{ str?: string; transform?: number[] }>;
        }>;
      }) => {
        pageCounter += 1;
        const textContent = await pageData.getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false
        });

        let text = "";
        let lastY: number | null = null;

        for (const item of textContent.items) {
          const str = (item.str ?? "").trim();
          if (!str) {
            continue;
          }

          const y = item.transform?.[5];
          if (typeof y === "number" && lastY !== null && Math.abs(y - lastY) > 2) {
            text += "\n";
          }

          text += `${str} `;

          if (typeof y === "number") {
            lastY = y;
          }
        }

        return `${PDF_PAGE_MARKER_PREFIX}${pageCounter}${PDF_PAGE_MARKER_SUFFIX}\n${text}\n`;
      }
    });

    renderedText = rendered.text ?? "";
    renderedPageCount = Number(rendered.numpages ?? pageCounter) || pageCounter;
  } catch {
    renderedText = "";
    renderedPageCount = 0;
  }

  let pages = parsePagedPdfText(renderedText);

  if (pages.length === 0) {
    const fallback = await pdfParse(buffer).catch(() => ({ text: "", numpages: 0 }));
    const fallbackText = normalizeText(fallback.text ?? "");

    if (fallbackText) {
      const splitPages = fallbackText
        .split(/\f+/)
        .map((item) => normalizeText(item))
        .filter(Boolean);

      pages = (splitPages.length > 0 ? splitPages : [fallbackText]).map((text, index) => ({
        pageNumber: index + 1,
        text
      }));
    }

    if (!renderedPageCount) {
      renderedPageCount = Number(fallback.numpages ?? pages.length) || pages.length;
    }
  }

  const pageCount = Math.max(renderedPageCount, pages.length);

  return {
    pages,
    pageCount
  };
}

async function extractDocxText(filePath: string) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value ?? "";
}

async function extractDocText(filePath: string) {
  const mod = await import("word-extractor");
  const WordExtractor = ((mod as unknown as { default?: unknown }).default ?? mod) as new () => {
    extract(inputPath: string): Promise<{ getBody?: () => string; getText?: () => string }>;
  };

  const extractor = new WordExtractor();
  const document = await extractor.extract(filePath);
  return document.getBody?.() ?? document.getText?.() ?? "";
}

function calculateCoverage(pageCount: number, parsedPageCount: number) {
  if (!pageCount || pageCount <= 0) {
    return parsedPageCount > 0 ? 1 : 0;
  }
  return normalizeCoverage(parsedPageCount / pageCount);
}

async function extractPagesForIngest(filePath: string): Promise<{
  pages: TextPage[];
  pageCount: number;
  parsedPageCount: number;
  textCoverage: number;
  ocrUsed: boolean;
}> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    const native = await extractPdfPagesNative(filePath).catch((error) => {
      throw new DocumentIngestError("PARSE_ERROR", `PDF 解析失败: ${(error as Error).message}`);
    });

    const nativeParsedPageCount = native.pages.filter((item) => isMeaningfulPageText(item.text)).length;
    const nativeCoverage = calculateCoverage(native.pageCount, nativeParsedPageCount);

    if (nativeCoverage >= TEXT_COVERAGE_THRESHOLD) {
      return {
        pages: native.pages,
        pageCount: native.pageCount,
        parsedPageCount: nativeParsedPageCount,
        textCoverage: nativeCoverage,
        ocrUsed: false
      };
    }

    if (!isCloudOcrEnabled()) {
      return {
        pages: native.pages,
        pageCount: native.pageCount,
        parsedPageCount: nativeParsedPageCount,
        textCoverage: nativeCoverage,
        ocrUsed: false
      };
    }

    if (!validateCloudOcrConfig()) {
      throw new DocumentIngestError("OCR_NOT_CONFIGURED", "OCR 已启用但配置不完整");
    }

    const ocr = await runCloudOcr(filePath);
    const ocrParsedPageCount = ocr.pages.filter((item) => isMeaningfulPageText(item.text)).length;
    const ocrCoverage = calculateCoverage(Math.max(native.pageCount, ocr.pageCount), ocrParsedPageCount);

    return {
      pages: ocr.pages,
      pageCount: Math.max(native.pageCount, ocr.pageCount),
      parsedPageCount: ocrParsedPageCount,
      textCoverage: ocrCoverage,
      ocrUsed: true
    };
  }

  const text = ext === ".docx" ? await extractDocxText(filePath) : ext === ".doc" ? await extractDocText(filePath) : "";

  if (ext !== ".docx" && ext !== ".doc") {
    throw new DocumentIngestError("PARSE_ERROR", `不支持的文档类型: ${ext}`);
  }

  const normalized = normalizeText(text);
  const hasText = normalized.length >= MIN_MEANINGFUL_PAGE_TEXT;

  return {
    pages: hasText
      ? [
          {
            pageNumber: 1,
            text: normalized
          }
        ]
      : [],
    pageCount: 1,
    parsedPageCount: hasText ? 1 : 0,
    textCoverage: hasText ? 1 : 0,
    ocrUsed: false
  };
}

export async function extractTextFromDocument(filePath: string) {
  const extracted = await extractPagesForIngest(filePath);
  return extracted.pages.map((item) => item.text).join("\n\n");
}

export async function extractAndChunkDocument(filePath: string): Promise<ExtractAndChunkResult> {
  const extracted = await extractPagesForIngest(filePath);

  const meaningfulPages = extracted.pages.filter((item) => isMeaningfulPageText(item.text));
  const allChunks: GeneratedChunk[] = [];
  let sortOrder = 1;

  for (const page of meaningfulPages) {
    if (allChunks.length >= MAX_CHUNK_COUNT) {
      break;
    }

    const pageChunks = buildChunksFromText(page.text, {
      pageNumber: page.pageNumber,
      startOrder: sortOrder,
      maxCount: MAX_CHUNK_COUNT - allChunks.length
    });

    allChunks.push(...pageChunks);
    sortOrder += pageChunks.length;
  }

  const extractedTextLength = meaningfulPages.reduce((sum, item) => sum + normalizeText(item.text).length, 0);

  return {
    chunks: allChunks,
    textCoverage: extracted.textCoverage,
    pageCount: extracted.pageCount,
    parsedPageCount: extracted.parsedPageCount,
    ocrUsed: extracted.ocrUsed,
    extractedTextLength
  };
}

export async function generateChunksFromDocument(filePath: string) {
  const result = await extractAndChunkDocument(filePath);
  return result.chunks;
}

export function validateIngestQuality(input: {
  title: string;
  code: string;
  source: string | null;
  chunks: GeneratedChunk[];
  textCoverage: number;
  textCoverageThreshold?: number;
}) {
  const threshold =
    input.textCoverageThreshold && Number.isFinite(input.textCoverageThreshold)
      ? input.textCoverageThreshold
      : TEXT_COVERAGE_THRESHOLD;

  if (!input.title.trim() || !input.code.trim() || !input.source?.trim()) {
    return {
      ok: false,
      code: "MISSING_FIELDS" as const,
      message: ERROR_MESSAGES.MISSING_FIELDS
    };
  }

  if (input.chunks.length < 1) {
    return {
      ok: false,
      code: "NO_CHUNK" as const,
      message: ERROR_MESSAGES.NO_CHUNK
    };
  }

  if (input.textCoverage < threshold) {
    return {
      ok: false,
      code: "LOW_TEXT_COVERAGE" as const,
      message: `${ERROR_MESSAGES.LOW_TEXT_COVERAGE}: ${input.textCoverage.toFixed(3)} < ${threshold.toFixed(3)}`
    };
  }

  const hasPage = input.chunks.some((item) => Number.isFinite(item.pageNumber) && (item.pageNumber ?? 0) > 0);
  if (!hasPage) {
    return {
      ok: false,
      code: "NO_PAGE_NUMBER" as const,
      message: ERROR_MESSAGES.NO_PAGE_NUMBER
    };
  }

  return {
    ok: true as const
  };
}

export function toDocumentIngestError(error: unknown) {
  if (error instanceof DocumentIngestError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "未知错误";
  return new DocumentIngestError("UNKNOWN", message);
}
