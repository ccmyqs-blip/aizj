const DOMAIN_SYNONYM_GROUPS: string[][] = [
  ["屋面瓦片", "瓦屋面", "屋面瓦", "盖瓦", "小青瓦", "琉璃瓦", "水泥瓦", "坡屋面"],
  ["工程量", "计量", "工程量计算", "计算规则", "计价规则", "清单计价"],
  ["签证", "现场签证", "工程签证", "经济签证"],
  ["变更", "设计变更", "工程变更"],
  ["结算", "竣工结算", "结算审核"],
  ["索赔", "工期索赔", "费用索赔"],
  ["土方", "土石方", "挖土方", "回填土", "放坡", "工作面"]
];

const TERM_TO_GROUP = new Map<string, string[]>();
for (const group of DOMAIN_SYNONYM_GROUPS) {
  for (const item of group) {
    TERM_TO_GROUP.set(item.toLowerCase(), group);
  }
}

function uniq(input: string[]) {
  return Array.from(new Set(input.filter(Boolean)));
}

export function expandWithDomainSynonyms(tokens: string[], limit = 40) {
  const normalized = uniq(tokens.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const expanded = [...normalized];

  for (const token of normalized) {
    const group = TERM_TO_GROUP.get(token);
    if (group) {
      expanded.push(...group.map((item) => item.toLowerCase()));
      continue;
    }

    for (const [term, relatedGroup] of TERM_TO_GROUP.entries()) {
      if (token.includes(term) || term.includes(token)) {
        expanded.push(...relatedGroup.map((item) => item.toLowerCase()));
      }
    }
  }

  return uniq(expanded).slice(0, Math.max(1, limit));
}

export function collectDomainKeywordsFromText(text: string, limit = 24) {
  const normalized = text.toLowerCase();
  const matched: string[] = [];

  for (const group of DOMAIN_SYNONYM_GROUPS) {
    const hasAny = group.some((item) => normalized.includes(item.toLowerCase()));
    if (!hasAny) {
      continue;
    }
    matched.push(...group.map((item) => item.toLowerCase()));
  }

  return uniq(matched).slice(0, Math.max(1, limit));
}

