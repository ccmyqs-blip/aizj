export function normalizeKeywords(input: string) {
  const cleaned = input.trim();
  if (!cleaned) {
    return [];
  }

  const tokens = cleaned
    .split(/[\s,，。；;、|]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return [cleaned];
  }

  const expanded: string[] = [];

  for (const token of tokens) {
    expanded.push(token);

    const isCjk = /[\u4e00-\u9fff]/.test(token);
    if (isCjk && token.length >= 4) {
      const maxBigrams = 8;
      for (let i = 0; i < token.length - 1 && i < maxBigrams; i += 1) {
        expanded.push(token.slice(i, i + 2));
      }
    }
  }

  return Array.from(new Set(expanded)).slice(0, 12);
}

export function buildSnippet(text: string, keywords: string[], maxLength = 120) {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) {
    return "";
  }

  if (keywords.length === 0) {
    return raw.length <= maxLength ? raw : `${raw.slice(0, maxLength)}...`;
  }

  const lowerRaw = raw.toLowerCase();
  const firstHitIndex = keywords
    .map((keyword) => lowerRaw.indexOf(keyword.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstHitIndex === undefined) {
    return raw.length <= maxLength ? raw : `${raw.slice(0, maxLength)}...`;
  }

  const start = Math.max(0, firstHitIndex - Math.floor(maxLength / 3));
  const end = Math.min(raw.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < raw.length ? "..." : "";

  return `${prefix}${raw.slice(start, end)}${suffix}`;
}

export function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
