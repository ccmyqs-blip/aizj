import { buildSnippet } from "@/lib/search-utils";
import type { RetrievedChunk } from "./types";

type PromptMessage = {
  role: "system" | "user";
  content: string;
};

export function buildQAMessages(question: string, chunks: RetrievedChunk[]): PromptMessage[] {
  const evidenceText = chunks
    .map((chunk, index) => {
      const location = [chunk.chapterTitle, chunk.sectionTitle].filter(Boolean).join(" / ") || "未标注章节";
      return [
        `【证据${index + 1}】`,
        `规范名：${chunk.documentTitle}`,
        `规范编号：${chunk.documentCode}`,
        `章节：${location}`,
        `页码：${chunk.pageNumber ?? "未标注"}`,
        `条款片段：${buildSnippet(chunk.chunkText, [], 220)}`
      ].join("\n");
    })
    .join("\n\n");

  return [
    {
      role: "system",
      content: [
        "你是工程造价规范问答助手，只能根据提供的证据回答。",
        "禁止编造规范名、章节、页码或结论。",
        "若证据不足或证据无法直接支持结论，answer 必须输出“未找到足够依据”，且 citations 为空数组。",
        "回答要简洁、专业、面向造价人员。",
        "输出严格 JSON，不要输出额外文本。",
        "JSON 结构如下：",
        '{',
        '  "answer": "string",',
        '  "citations": [{"index": 1, "reason": "引用该证据支持结论的简短说明"}]',
        '}'
      ].join("\n")
    },
    {
      role: "user",
      content: [`用户问题：${question}`, "", "可用证据：", evidenceText].join("\n")
    }
  ];
}
