"use client";

import { FormEvent, useEffect, useState } from "react";

type SearchBoxProps = {
  defaultValue?: string;
  onSearch: (keyword: string) => void;
  placeholder?: string;
};

export function SearchBox({
  defaultValue = "",
  onSearch,
  placeholder = "请输入规范名称、编号或条文关键词"
}: SearchBoxProps) {
  const [keyword, setKeyword] = useState(defaultValue);

  useEffect(() => {
    setKeyword(defaultValue);
  }, [defaultValue]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(keyword.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="panel flex flex-col gap-3 p-4 md:flex-row md:items-center">
      <input
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder={placeholder}
        className="field-input flex-1"
      />
      <button type="submit" className="btn-primary h-11 md:px-6">
        检索
      </button>
    </form>
  );
}
