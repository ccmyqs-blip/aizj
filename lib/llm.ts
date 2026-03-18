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
const REQUEST_TIMEOUT_MS = Number(process.env.DASHSCOPE_TIMEOUT_MS ?? 25000);

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

export type ConversationTurn = {
  question: string;
  answer: string;
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

function buildConversationHistoryBlock(conversationTurns: ConversationTurn[]) {
  if (conversationTurns.length === 0) {
    return "";
  }

  const lines = conversationTurns.slice(-6).map((turn, index) => {
    const q = normalizeLine(turn.question).slice(0, 200);
    const a = normalizeLine(turn.answer).slice(0, 300);
    return `第${index + 1}轮\n用户: ${q}\n助手: ${a}`;
  });

  return `\n\n对话历史（仅用于理解用户上下文，不可作为依据）：\n${lines.join("\n\n")}`;
}

function buildMessages(
  question: string,
  contextChunks: LLMContextChunk[],
  conversationTurns: ConversationTurn[] = []
): DashscopeMessage[] {
  const userPrompt =
    HARD_CONSTRAINT_QA_USER_PROMPT_TEMPLATE.replace("{{question}}", question).replace(
      "{{contextChunks}}",
      buildEvidence(contextChunks)
    ) + buildConversationHistoryBlock(conversationTurns);

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

function buildRescueMessages(
  question: string,
  contextChunks: LLMContextChunk[],
  conversationTurns: ConversationTurn[] = []
): DashscopeMessage[] {
  const userPrompt =
    HARD_CONSTRAINT_QA_USER_PROMPT_TEMPLATE.replace("{{question}}", question).replace(
      "{{contextChunks}}",
      buildEvidence(contextChunks)
    ) + buildConversationHistoryBlock(conversationTurns);

  return [
    {
      role: "system",
      content: `你是工程造价依据摘要助手。
只允许基于提供的依据片段作答，不得编造条文、编号、页码或结论。
请优先提炼“可确认部分”，即便不能覆盖全部问题，也要给出已能确认的范围与条件。
仅当所有片段都与问题无直接关联时，才输出“未找到足够依据”。
输出格式必须为：
一、结论
二、依据
三、风险提示`
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

function buildEvidenceOnlyAnswer(citations: LLMAnswerCitation[]) {
  const lines = citations.slice(0, 3).map((item) => {
    const chapter = [item.chapterTitle, item.sectionTitle].filter(Boolean).join(" / ") || "未标注章节";
    const page = item.pageNumber ?? "未标注";
    const excerpt = normalizeLine(item.excerpt).slice(0, 120);
    return `- ${item.documentTitle}（${item.documentCode}）｜${chapter}｜页码：${page}｜要点：${excerpt}`;
  });

  return [
    "一、结论",
    "- 已检索到与问题相关的依据片段。基于当前可用片段，可先按“依据”中的规则点做保守判断。",
    "",
    "二、依据",
    ...lines,
    "",
    "三、风险提示",
    "- 以上为基于已检索片段的保守摘要，具体仍需结合合同、补充协议和项目资料复核。"
  ].join("\n");
}

function fallbackResult(modelName = DEFAULT_MODEL, citations: LLMAnswerCitation[] = []): GenerateAnswerResult {
  return {
    answer: buildInsufficientAnswer(),
    citations,
    modelName
  };
}

async function rescueAnswerOrSummary(input: {
  question: string;
  contextChunks: LLMContextChunk[];
  conversationTurns: ConversationTurn[];
  apiKey: string;
  modelName: string;
}) {
  const { question, contextChunks, conversationTurns, apiKey, modelName } = input;
  const rescueMessages = buildRescueMessages(question, contextChunks, conversationTurns);
  const rescueResponse = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: rescueMessages,
      temperature: 0,
      top_p: 0.1,
      max_tokens: 900
    })
  }).catch(() => null);

  if (rescueResponse?.ok) {
    const rescuePayload = (await rescueResponse.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rescueText = rescuePayload.choices?.[0]?.message?.content?.trim();
    const rescueLooksInsufficient =
      rescueText?.includes("暂不足以支持明确结论") || rescueText?.includes("未能直接回答该问题");
    if (rescueText && !rescueLooksInsufficient) {
      return {
        answer: rescueText,
        citations: mapTopCitations(contextChunks),
        modelName: rescuePayload.model ?? modelName
      } satisfies GenerateAnswerResult;
    }
  }

  const topCitations = mapTopCitations(contextChunks);
  if (topCitations.length > 0) {
    return {
      answer: buildEvidenceOnlyAnswer(topCitations),
      citations: topCitations,
      modelName
    } satisfies GenerateAnswerResult;
  }

  return fallbackResult(modelName, topCitations);
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

function resolveChunkId(rawChunkId: string, contextChunks: LLMContextChunk[]) {
  const normalized = normalizeLine(rawChunkId);
  if (!normalized) {
    return null;
  }

  if (contextChunks.some((item) => item.chunkId === normalized)) {
    return normalized;
  }

  const indexMatch = normalized.match(/(?:片段|chunk)\s*#?\s*(\d{1,2})/i) ?? normalized.match(/^#?(\d{1,2})$/);
  if (indexMatch) {
    const oneBased = Number(indexMatch[1]);
    if (Number.isFinite(oneBased) && oneBased >= 1 && oneBased <= contextChunks.length) {
      return contextChunks[oneBased - 1]?.chunkId ?? null;
    }
  }

  const bySubstring = contextChunks.find((item) => normalized.includes(item.chunkId) || item.chunkId.includes(normalized));
  if (bySubstring) {
    return bySubstring.chunkId;
  }

  return null;
}

function buildAnswerWithStrictCitations(
  parsed: z.infer<typeof structuredOutputSchema>,
  contextChunks: LLMContextChunk[]
): { answer: string; citations: LLMAnswerCitation[] } | null {
  const chunkMap = new Map(contextChunks.map((chunk) => [chunk.chunkId, chunk]));

  const validEvidence = dedupeByChunkId(
    parsed.evidence
      .map((item) => ({
        chunkId: resolveChunkId(item.chunkId, contextChunks),
        reason: normalizeLine(item.reason)
      }))
      .filter((item): item is { chunkId: string; reason: string } => Boolean(item.chunkId))
      .filter((item) => chunkMap.has(item.chunkId))
  ).slice(0, 6);

  if (validEvidence.length === 0) {
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

  const normalizedConclusion = normalizeLine(parsed.conclusion);
  const hasUsableConclusion =
    normalizedConclusion.length > 0 &&
    !normalizedConclusion.includes("暂不足以支持明确结论") &&
    !normalizedConclusion.includes("未能直接回答该问题");

  if (!hasUsableConclusion) {
    return null;
  }

  const risk =
    normalizeLine(parsed.risk) ||
    "具体仍需结合合同、补充协议、招标文件、答疑纪要、签证单、联系单、往来函件及项目资料综合判断。";

  const finalRisk = parsed.canAnswer
    ? risk
    : `${risk} 当前结论为基于现有片段的保守解释，若合同或补充资料存在特别约定，应以其为准。`;

  const answer = ["一、结论", `- ${normalizedConclusion}`, "", "二、依据", ...evidenceLines, "", "三、风险提示", `- ${finalRisk}`].join(
    "\n"
  );

  return {
    answer,
    citations
  };
}

export async function generateAnswer(
  question: string,
  contextChunks: LLMContextChunk[],
  options?: {
    conversationTurns?: ConversationTurn[];
  }
): Promise<GenerateAnswerResult> {
  const startTime = Date.now();
  const modelName = process.env.DASHSCOPE_MODEL ?? DEFAULT_MODEL;
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const conversationTurns = options?.conversationTurns ?? [];

  if (!apiKey) {
    console.error("[llm] missing api key");
    return fallbackResult(modelName, mapTopCitations(contextChunks));
  }

  if (contextChunks.length === 0) {
    console.warn("[llm] no context chunks");
    return fallbackResult(modelName);
  }

  const messages = buildMessages(question, contextChunks, conversationTurns);
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
      console.error(`[llm] primary call failed status=${response.status}`, errorText);
      return fallbackResult(modelName, mapTopCitations(contextChunks));
    }

    const payload = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };

    const effectiveModel = payload.model ?? modelName;
    const rawContent = payload.choices?.[0]?.message?.content?.trim();
    if (!rawContent) {
      return rescueAnswerOrSummary({
        question,
        contextChunks,
        conversationTurns,
        apiKey,
        modelName: effectiveModel
      });
    }

    const jsonObject = extractJsonObject(rawContent);
    if (!jsonObject) {
      return rescueAnswerOrSummary({
        question,
        contextChunks,
        conversationTurns,
        apiKey,
        modelName: effectiveModel
      });
    }

    const parsed = structuredOutputSchema.safeParse(jsonObject);
    if (!parsed.success) {
      return rescueAnswerOrSummary({
        question,
        contextChunks,
        conversationTurns,
        apiKey,
        modelName: effectiveModel
      });
    }

    const strictResult = buildAnswerWithStrictCitations(parsed.data, contextChunks);
    if (!strictResult) {
      return rescueAnswerOrSummary({
        question,
        contextChunks,
        conversationTurns,
        apiKey,
        modelName: effectiveModel
      });
    }

    return {
      answer: strictResult.answer,
      citations: strictResult.citations,
      modelName: effectiveModel
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      console.error("[llm] primary call timeout, using rescue pipeline");
      return rescueAnswerOrSummary({
        question,
        contextChunks,
        conversationTurns,
        apiKey,
        modelName
      });
    } else {
      console.error("[llm] primary call exception", error);
    }
    return fallbackResult(modelName, mapTopCitations(contextChunks));
  } finally {
    clearTimeout(timer);
    console.info(`[llm] generateAnswer finished, cost=${Date.now() - startTime}ms`);
  }
}
