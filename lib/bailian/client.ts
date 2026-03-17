type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResult = {
  content: string;
  modelName: string;
};

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-plus";

export async function callBailianChatCompletion(
  messages: ChatMessage[],
  options?: {
    timeoutMs?: number;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<ChatCompletionResult> {
  const apiKey = process.env.DASHSCOPE_API_KEY ?? process.env.BAILIAN_API_KEY;
  if (!apiKey) {
    throw new Error("DASHSCOPE_API_KEY 未配置");
  }

  const baseUrl = process.env.DASHSCOPE_BASE_URL ?? process.env.BAILIAN_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.DASHSCOPE_MODEL ?? process.env.BAILIAN_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options?.timeoutMs ?? 12000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.1,
        max_tokens: options?.maxTokens ?? 600
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`百炼调用失败(${response.status}) ${errorText}`);
    }

    const data = (await response.json()) as {
      model?: string;
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("百炼返回空内容");
    }

    return {
      content,
      modelName: data.model ?? model
    };
  } finally {
    clearTimeout(timer);
  }
}
