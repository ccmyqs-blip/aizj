"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { normalizeKeywords } from "@/lib/search-utils";
import { ResultCard, SearchApiResult } from "./result-card";
import { SearchBox } from "./search-box";

type SearchResponse = {
  keyword: string;
  category: string;
  page: number;
  pageSize: number;
  total: number;
  categories: string[];
  results: SearchApiResult[];
};

const initialData: SearchResponse = {
  keyword: "",
  category: "all",
  page: 1,
  pageSize: 20,
  total: 0,
  categories: [],
  results: []
};

export function SearchPageClient() {
  const searchParams = useSearchParams();
  const keywordFromQuery = useMemo(() => searchParams.get("q")?.trim() ?? "", [searchParams]);
  const [keyword, setKeyword] = useState(keywordFromQuery);
  const [category, setCategory] = useState("all");
  const [data, setData] = useState<SearchResponse>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setKeyword(keywordFromQuery);
  }, [keywordFromQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      q: keyword,
      category,
      page: "1",
      pageSize: "20"
    });

    async function runSearch() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/search?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error("检索请求失败，请稍后重试");
        }
        const payload = (await response.json()) as SearchResponse;
        setData(payload);
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        setError("检索失败，请检查网络或稍后重试。");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    runSearch();

    return () => {
      controller.abort();
    };
  }, [keyword, category]);

  const keywords = useMemo(() => normalizeKeywords(keyword), [keyword]);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h1 className="section-title">查规范 / 查依据</h1>
        <p className="section-subtitle">支持按规范名称、编号、条文内容检索，并展示章节与页码定位。</p>
      </section>

      <section className="panel flex flex-col gap-3 bg-gradient-to-r from-white to-brand-50 p-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-slate-700">企业需要项目资料专项分析或本地部署评估，可直接提交试用申请。</p>
        <Link href="/trial" className="btn-primary">
          申请试用
        </Link>
      </section>

      <SearchBox
        defaultValue={keyword}
        onSearch={setKeyword}
        placeholder="输入规范名称、编号或关键词，例如：GB 50500、工程变更、结算审核"
      />

      <section className="panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-700" htmlFor="category-filter">
            分类筛选
          </label>
          <select
            id="category-filter"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="field-input h-10 min-w-44 px-3 py-0"
          >
            <option value="all">全部分类</option>
            {data.categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">当前关键词：{keyword || "全部"}</span>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>{loading ? "正在检索..." : `共 ${data.total} 条结果`}</span>
          <span>数据源：SQLite</span>
        </div>

        {loading ? <div className="panel p-4 text-sm text-slate-500">正在加载检索结果，请稍候...</div> : null}

        {error ? <div className="status-error">{error}</div> : null}

        {!loading && !error && data.results.length === 0 ? (
          <div className="panel p-8 text-center text-sm text-slate-500">
            未检索到匹配结果。建议尝试：
            <br />
            1) 缩短关键词；2) 使用规范编号；3) 切换分类。
          </div>
        ) : null}

        {!loading && !error
          ? data.results.map((result) => <ResultCard key={result.chunkId} result={result} keywords={keywords} />)
          : null}
      </section>
    </div>
  );
}
