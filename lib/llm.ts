import { buildSnippet } from "@/lib/search-utils";

const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = process.env.DASHSCOPE_MODEL ?? "qwen-plus";
const REQUEST_TIMEOUT_MS = 12000;

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

const DEFAULT_NOT_FOUND_ANSWER = "未找到足够依据";

export const COST_QA_SYSTEM_PROMPT = `你是一个中国建设工程造价与计价依据检索助手。

你的职责：
1. 仅根据提供的规范、标准、依据片段回答问题
2. 优先给出简洁、专业、保守的回答
3. 必须标明依据来源
4. 如果依据不足、存在争议或无法确定，明确说明
5. 不得编造规范编号、条文内容、页码或结论
6. 不得替代具体项目合同约定
7. 涉及结算、签证、变更、索赔等问题时，应提醒“具体仍需结合合同、补充协议和项目资料判断”

输出格式：
一、结论
二、依据
三、风险提示`;

export const COST_QA_USER_PROMPT_TEMPLATE = `用户问题：
{{question}}

可用依据片段：
{{contextChunks}}

请严格基于以上依据片段回答，不允许使用片段外的知识补充具体条文内容。`;

function buildEvidence(contextChunks: LLMContextChunk[]) {
  return contextChunks
    .map((chunk, index) => {
      const chapter = [chunk.chapterTitle, chunk.sectionTitle].filter(Boolean).join(" / ") || "未标注章节";
      return [
        `【证据${index + 1}】`,
        `规范名：${chunk.documentTitle}`,
        `规范编号：${chunk.documentCode}`,
        `章节：${chapter}`,
        `页码：${chunk.pageNumber ?? "未标注"}`,
        `条款片段：${buildSnippet(chunk.chunkText, [], 220)}`
      ].join("\n");
    })
    .join("\n\n");
}

function buildMessages(question: string, contextChunks: LLMContextChunk[]): DashscopeMessage[] {
  const evidence = buildEvidence(contextChunks);
  const userPrompt = COST_QA_USER_PROMPT_TEMPLATE.replace("{{question}}", question).replace("{{contextChunks}}", evidence);

  return [
    {
      role: "system",
      content: COST_QA_SYSTEM_PROMPT
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

function fallbackResult(modelName = DEFAULT_MODEL, citations: LLMAnswerCitation[] = []): GenerateAnswerResult {
  return {
    answer: DEFAULT_NOT_FOUND_ANSWER,
    citations,
    modelName
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
    console.warn("[llm] 无上下文证据，直接返回未找到足够依据");
    return fallbackResult(modelName);
  }

  const messages = buildMessages(question, contextChunks);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    console.info(`[llm] 请求百炼模型: model=${modelName}, chunks=${contextChunks.length}`);

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
        temperature: 0.1,
        max_tokens: 600
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
      console.error("[llm] 百炼响应无内容");
      return fallbackResult(effectiveModel, mapTopCitations(contextChunks));
    }

    if (
      rawContent.includes(DEFAULT_NOT_FOUND_ANSWER) ||
      rawContent.includes("依据不足") ||
      rawContent.includes("无法确定")
    ) {
      return fallbackResult(effectiveModel, mapTopCitations(contextChunks));
    }

    const citations = mapTopCitations(contextChunks);
    if (citations.length === 0) {
      return fallbackResult(effectiveModel);
    }

    return {
      answer: rawContent,
      citations,
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
    console.info(`[llm] generateAnswer 完成, 耗时=${Date.now() - startTime}ms`);
  }
}
