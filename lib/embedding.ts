type EmbeddingResult = {
  model: string;
  vector: number[];
};

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY ?? "";
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DASHSCOPE_NATIVE_BASE_URL = process.env.DASHSCOPE_NATIVE_BASE_URL ?? "https://dashscope.aliyuncs.com";

const TEXT_EMBEDDING_MODEL = process.env.DASHSCOPE_TEXT_EMBEDDING_MODEL ?? "text-embedding-v4";
const MULTIMODAL_EMBEDDING_MODEL = process.env.DASHSCOPE_MULTIMODAL_EMBEDDING_MODEL ?? "qwen3-vl-embedding";

const EMBEDDING_TIMEOUT_MS = Number(process.env.DASHSCOPE_EMBEDDING_TIMEOUT_MS ?? 15000);

function ensureApiKey() {
  if (!DASHSCOPE_API_KEY) {
    throw new Error("DASHSCOPE_API_KEY 未配置");
  }
}

function toFiniteVector(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

async function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function getTextEmbeddingModel() {
  return TEXT_EMBEDDING_MODEL;
}

export function getMultimodalEmbeddingModel() {
  return MULTIMODAL_EMBEDDING_MODEL;
}

export async function embedTextWithTextModel(input: string) {
  ensureApiKey();
  const text = input.trim();
  if (!text) {
    return null;
  }

  return withTimeout(async (signal) => {
    const response = await fetch(`${DASHSCOPE_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`
      },
      signal,
      body: JSON.stringify({
        model: TEXT_EMBEDDING_MODEL,
        input: text
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`text embedding 调用失败(${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: unknown }>;
    };
    const vector = toFiniteVector(payload.data?.[0]?.embedding);
    if (vector.length === 0) {
      throw new Error("text embedding 返回空向量");
    }

    return {
      model: TEXT_EMBEDDING_MODEL,
      vector
    } satisfies EmbeddingResult;
  });
}

export async function embedTextWithMultimodalModel(input: string) {
  ensureApiKey();
  const text = input.trim();
  if (!text) {
    return null;
  }

  return withTimeout(async (signal) => {
    const response = await fetch(
      `${DASHSCOPE_NATIVE_BASE_URL}/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DASHSCOPE_API_KEY}`
        },
        signal,
        body: JSON.stringify({
          model: MULTIMODAL_EMBEDDING_MODEL,
          input: {
            contents: [{ text }]
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`multimodal embedding 调用失败(${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as {
      output?: {
        embeddings?: Array<{ embedding?: unknown }>;
      };
    };
    const vector = toFiniteVector(payload.output?.embeddings?.[0]?.embedding);
    if (vector.length === 0) {
      throw new Error("multimodal embedding 返回空向量");
    }

    return {
      model: MULTIMODAL_EMBEDDING_MODEL,
      vector
    } satisfies EmbeddingResult;
  });
}

export async function embedTextWithBothModels(input: string) {
  const results: EmbeddingResult[] = [];

  try {
    const textVector = await embedTextWithTextModel(input);
    if (textVector) {
      results.push(textVector);
    }
  } catch (error) {
    console.error("[embedding] text model failed", error);
  }

  try {
    const multiVector = await embedTextWithMultimodalModel(input);
    if (multiVector) {
      results.push(multiVector);
    }
  } catch (error) {
    console.error("[embedding] multimodal model failed", error);
  }

  return results;
}
