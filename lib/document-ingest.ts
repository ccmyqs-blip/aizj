import { promises as fs } from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { normalizeKeywords } from "@/lib/search-utils";

export type GeneratedChunk = {
  chapterTitle: string | null;
  sectionTitle: string | null;
  chunkText: string;
  pageNumber: number | null;
  keywords: string;
  sortOrder: number;
};

const MAX_CHUNK_LENGTH = 850;
const MAX_CHUNK_COUNT = 200;
const PDF_PAGE_MARKER_PREFIX = "[[[PDF_PAGE_";
const PDF_PAGE_MARKER_SUFFIX = "]]]";

function normalizeText(input: string) {
  return input
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function detectChapterTitle(text: string) {
  const lines = text
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const first = lines[0] ?? "";

  if (/^(第[一二三四五六七八九十百千万0-9]+[章节条]|\d+(\.\d+){0,2})/.test(first)) {
    return first.slice(0, 80);
  }

  return null;
}

function splitByLength(text: string, maxLength: number) {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + maxLength);
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

function mergeParagraphs(paragraphs: string[]) {
  const merged: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= MAX_CHUNK_LENGTH) {
      current = next;
      continue;
    }

    if (current) {
      merged.push(current);
    }

    if (paragraph.length > MAX_CHUNK_LENGTH) {
      const splitList = splitByLength(paragraph, MAX_CHUNK_LENGTH);
      merged.push(...splitList.slice(0, splitList.length - 1));
      current = splitList[splitList.length - 1] ?? "";
    } else {
      current = paragraph;
    }
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}

function buildChunksFromText(
  text: string,
  options: {
    pageNumber: number | null;
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

  const merged = mergeParagraphs(paragraphs).slice(0, Math.max(0, options.maxCount));

  return merged.map((chunkText, index) => {
    const tokens = normalizeKeywords(chunkText).slice(0, 12);
    return {
      chapterTitle: detectChapterTitle(chunkText),
      sectionTitle: null,
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

  const pages: Array<{ pageNumber: number; text: string }> = [];
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

async function extractPdfPages(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse = ((mod as unknown as { default?: unknown }).default ?? mod) as (
    input: Buffer,
    options?: Record<string, unknown>
  ) => Promise<{ text?: string }>;

  let pageCounter = 0;

  const result = await pdfParse(buffer, {
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

  return parsePagedPdfText(result.text ?? "");
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

export async function extractTextFromDocument(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    const pages = await extractPdfPages(filePath);
    return pages.map((item) => item.text).join("\n\n");
  }

  if (ext === ".docx") {
    return extractDocxText(filePath);
  }

  if (ext === ".doc") {
    return extractDocText(filePath);
  }

  throw new Error(`不支持的文档类型: ${ext}`);
}

export async function generateChunksFromDocument(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    const pages = await extractPdfPages(filePath);
    const allChunks: GeneratedChunk[] = [];
    let sortOrder = 1;

    for (const page of pages) {
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

    return allChunks;
  }

  const text = await extractTextFromDocument(filePath);
  return buildChunksFromText(text, {
    pageNumber: null,
    startOrder: 1,
    maxCount: MAX_CHUNK_COUNT
  });
}
