import { z } from "zod";
import { buildSnippet } from "@/lib/search-utils";
import {
  HARD_CONSTRAINT_QA_SYSTEM_PROMPT,
  HARD_CONSTRAINT_QA_USER_PROMPT_TEMPLATE,
  INSUFFICIENT_EVIDENCE_TEXT,
  STRICT_JSON_OUTPUT_PROTOCOL
} from "@/lib/prompts/qa-hard-constraint";

const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = process.env.DASHSCOPE_MODEL ?? "qwen-plus";
const REQUEST_TIMEOUT_MS = Number(process.env.DASHSCOPE_TIMEOUT_MS ?? 12000);

export type LLMContextChunk = {
  chunkId: string;
  documentTitle: string;
  documentCode: string;
  chapterTitle: string | null;
  sectionTitle: string | null;
  pageNumber: number | null;
  chunkText: string;
};

export type LLMAnswerCitation = {
  chunkId: string;
  documentTitle: string;
  documentCode: string;
  chapterTitle: string | null;
  sectionTitle: string | null;
  pageNumber: number | null;
  excerpt: string;
};

export type GenerateAnswerResult = {
  answer: string;
  citations: LLMAnswerCitation[];
  modelName: string;
};

type DashscopeMessage = {
  role: "system" | "user";
  content: string;
};

const structuredOutputSchema = z.object({
  canAnswer: z.boolean(),
  conclusion: z.string().trim().max(2000).optional().default(""),
  evidence: z
    .array(
      z.object({
        chunkId: z.string().trim().min(1),
        reason: z.string().trim().max(1000).optional().default("")
      })
    )
    .optional()
    .default([]),
  risk: z.string().trim().max(2000).optional().default("")
});

function normalizeLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function buildEvidence(contextChunks: LLMContextChunk[]) {
  return contextChunks
    .map((chunk, index) => {
      const chapter = [chunk.chapterTitle, chunk.sectionTitle].filter(Boolean).join(" / ") || "未标注章节";
      const page = chunk.pageNumber ?? "未标注";
      const excerpt = buildSnippet(chunk.chunkText, [], 240);

      return [
        `【片段${index + 1}】`,
        `chunkId: ${chunk.chunkId}`,
        `来源: ${chunk.documentTitle}（${chunk.documentCode}）`,
        `章节: ${chapter}`,
        `页码: ${page}`,
        `片段内容: ${excerpt}`
      ].join("\n");
    })
    .join("\n\n");
}

function buildMessages(question: string, contextChunks: LLMContextChunk[]): DashscopeMessage[] {
  const userPrompt = HARD_CONSTRAINT_QA_USER_PROMPT_TEMPLATE.replace("{{question}}", question).replace(
    "{{contextChunks}}",
    buildEvidence(contextChunks)
  );

  return [
    {
      role: "system",
      content: `${HARD_CONSTRAINT_QA_SYSTEM_PROMPT}\n\n${STRICT_JSON_OUTPUT_PROTOCOL}`
    },
    {
      role: "user",
      content: userPrompt
    }
  ];
}

function mapTopCitations(contextChunks: LLMContextChunk[], limit = 3): LLMAnswerCitation[] {
  return contextChunks.slice(0, limit).map((chunk) => ({
    chunkId: chunk.chunkId,
    documentTitle: chunk.documentTitle,
    documentCode: chunk.documentCode,
    chapterTitle: chunk.chapterTitle,
    sectionTitle: chunk.sectionTitle,
    pageNumber: chunk.pageNumber,
    excerpt: chunk.chunkText.slice(0, 180)
  }));
}

function buildInsufficientAnswer() {
  return [
    "一、结论",
    `- ${INSUFFICIENT_EVIDENCE_TEXT}`,
    "",
    "二、依据",
    "- 现有可用依据片段不足，无法形成可复核的明确结论。",
    "",
    "三、风险提示",
    "- 具体仍需结合合同、补充协议、招标文件、答疑纪要、签证单、联系单、往来函件及项目资料综合判断。"
  ].join("\n");
}

function fallbackResult(modelName = DEFAULT_MODEL, citations: LLMAnswerCitation[] = []): GenerateAnswerResult {
  return {
    answer: buildInsufficientAnswer(),
    citations,
    modelName
  };
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return null;
  }

  const objectText = candidate.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(objectText) as unknown;
  } catch {
    return null;
  }
}

function dedupeByChunkId(items: Array<{ chunkId: string; reason: string }>) {
  const seen = new Set<string>();
  const list: Array<{ chunkId: string; reason: string }> = [];

  for (const item of items) {
    if (seen.has(item.chunkId)) {
      continue;
    }
    seen.add(item.chunkId);
    list.push(item);
  }

  return list;
}

function buildAnswerWithStrictCitations(
  parsed: z.infer<typeof structuredOutputSchema>,
  contextChunks: LLMContextChunk[]
): { answer: string; citations: LLMAnswerCitation[] } | null {
  const chunkMap = new Map(contextChunks.map((chunk) => [chunk.chunkId, chunk]));

  const validEvidence = dedupeByChunkId(
    parsed.evidence
      .map((item) => ({
        chunkId: normalizeLine(item.chunkId),
        reason: normalizeLine(item.reason)
      }))
      .filter((item) => chunkMap.has(item.chunkId))
  ).slice(0, 6);

  if (!parsed.canAnswer || validEvidence.length === 0) {
    return null;
  }

  const citations = validEvidence
    .map((item) => chunkMap.get(item.chunkId))
    .filter(Boolean)
    .map((chunk) => ({
      chunkId: chunk!.chunkId,
      documentTitle: chunk!.documentTitle,
      documentCode: chunk!.documentCode,
      chapterTitle: chunk!.chapterTitle,
      sectionTitle: chunk!.sectionTitle,
      pageNumber: chunk!.pageNumber,
      excerpt: chunk!.chunkText.slice(0, 180)
    }));

  if (citations.length === 0) {
    return null;
  }

  const evidenceLines = validEvidence.map((item) => {
    const chunk = chunkMap.get(item.chunkId)!;
    const chapter = [chunk.chapterTitle, chunk.sectionTitle].filter(Boolean).join(" / ") || "未标注章节";
    const page = chunk.pageNumber ?? "未标注";
    const reason = item.reason || "与问题直接相关。";

    return `- ${chunk.documentTitle}（${chunk.documentCode}）｜${chapter}｜页码：${page}｜说明：${reason}`;
  });

  const conclusion = normalizeLine(parsed.conclusion) || INSUFFICIENT_EVIDENCE_TEXT;
  const risk =
    normalizeLine(parsed.risk) ||
    "具体仍需结合合同、补充协议、招标文件、答疑纪要、签证单、联系单、往来函件及项目资料综合判断。";

  const answer = [
    "一、结论",
    `- ${conclusion}`,
    "",
    "二、依据",
    ...evidenceLines,
    "",
    "三、风险提示",
    `- ${risk}`
  ].join("\n");

  return {
    answer,
    citations
  };
}

export async function generateAnswer(
  question: string,
  contextChunks: LLMContextChunk[]
): Promise<GenerateAnswerResult> {
  const startTime = Date.now();
  const modelName = process.env.DASHSCOPE_MODEL ?? DEFAULT_MODEL;
  const apiKey = process.env.DASHSCOPE_API_KEY;

  if (!apiKey) {
    console.error("[llm] DASHSCOPE_API_KEY 未配置");
    return fallbackResult(modelName, mapTopCitations(contextChunks));
  }

  if (contextChunks.length === 0) {
    console.warn("[llm] 无可用依据片段，直接拒答");
    return fallbackResult(modelName);
  }

  const messages = buildMessages(question, contextChunks);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelName,
        messages,
        temperature: 0,
        top_p: 0.1,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[llm] 百炼请求失败 status=${response.status}`, errorText);
      return fallbackResult(modelName, mapTopCitations(contextChunks));
    }

    const payload = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };

    const effectiveModel = payload.model ?? modelName;
    const rawContent = payload.choices?.[0]?.message?.content?.trim();
    if (!rawContent) {
      console.error("[llm] 模型响应为空");
      return fallbackResult(effectiveModel, mapTopCitations(contextChunks));
    }

    const jsonObject = extractJsonObject(rawContent);
    if (!jsonObject) {
      console.warn("[llm] 非 JSON 响应，触发硬约束拒答");
      return fallbackResult(effectiveModel, mapTopCitations(contextChunks));
    }

    const parsed = structuredOutputSchema.safeParse(jsonObject);
    if (!parsed.success) {
      console.warn("[llm] JSON 结构不合法，触发硬约束拒答");
      return fallbackResult(effectiveModel, mapTopCitations(contextChunks));
    }

    const strictResult = buildAnswerWithStrictCitations(parsed.data, contextChunks);
    if (!strictResult) {
      return fallbackResult(effectiveModel, mapTopCitations(contextChunks));
    }

    return {
      answer: strictResult.answer,
      citations: strictResult.citations,
      modelName: effectiveModel
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      console.error("[llm] 百炼请求超时");
    } else {
      console.error("[llm] 百炼请求异常", error);
    }
    return fallbackResult(modelName, mapTopCitations(contextChunks));
  } finally {
    clearTimeout(timer);
    console.info(`[llm] generateAnswer finished, cost=${Date.now() - startTime}ms`);
  }
}
