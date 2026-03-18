import Link from "next/link";
import { ReactNode } from "react";
import { escapeRegex } from "@/lib/search-utils";

export type SearchApiResult = {
  documentId: string;
  title: string;
  code: string;
  category: string;
  source: string | null;
  bestChunkId: string;
  bestChapterTitle: string;
  bestSectionTitle: string;
  bestPageNumber: number | null;
  bestSortOrder: number;
  matchChunkCount: number;
  publishDate: string | null;
  snippet: string;
};

type ResultCardProps = {
  result: SearchApiResult;
  keywords: string[];
};

function highlightText(text: string, keywords: string[]) {
  if (!text || keywords.length === 0) {
    return text;
  }

  const escaped = keywords.map((keyword) => escapeRegex(keyword)).filter(Boolean);
  if (escaped.length === 0) {
    return text;
  }

  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const pieces = text.split(regex);

  return pieces.map((part, index): ReactNode => {
    const matched = keywords.some((keyword) => part.toLowerCase() === keyword.toLowerCase());
    if (matched) {
      return (
        <mark key={`${part}-${index}`} className="rounded bg-yellow-100 px-0.5 text-inherit">
          {part}
        </mark>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

export function ResultCard({ result, keywords }: ResultCardProps) {
  const clause = [result.bestChapterTitle, result.bestSectionTitle].filter(Boolean).join(" / ");

  return (
    <article className="panel p-5 transition hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(17,53,90,0.12)]">
      <h3 className="text-lg font-semibold text-slate-900">{highlightText(result.title, keywords)}</h3>

      <p className="mt-2 text-sm text-slate-600">命中章节：{clause ? highlightText(clause, keywords) : "未标注章节"}</p>

      <p className="mt-3 text-sm leading-7 text-slate-700">{highlightText(result.snippet, keywords)}</p>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>
          页码：{result.bestPageNumber ?? "未标注"} · 命中条款：{result.matchChunkCount} · 排序：{result.bestSortOrder}
        </span>
        <div className="flex items-center gap-2">
          {result.source ? (
            <a
              href={result.source}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary px-3 py-1.5 text-xs font-semibold"
            >
              查看原文件
            </a>
          ) : null}
          <Link href={`/search/${result.bestChunkId}`} className="btn-secondary px-3 py-1.5 text-xs font-semibold">
            查看定位
          </Link>
        </div>
      </div>
    </article>
  );
}
