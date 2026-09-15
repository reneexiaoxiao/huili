const PREPARATION_SECTIONS = [
  {
    title: '为什么要开这场会',
    pattern: '会议背景|前因后果|为什么(?:现在)?要?开(?:这场会)?',
  },
  {
    title: '今天必须定',
    pattern: '本次必须判断或决定(?:的问题)?|本次要定|今天必须定',
  },
  { title: '上次说到哪', pattern: '上次停点|上次说到哪' },
  { title: '还有什么没说清', pattern: '未关闭事项|还有什么没说清' },
  { title: '会上直接这样问', pattern: '会上直接这样问' },
  { title: '会前带上', pattern: '会前带上' },
  { title: '会前怎么准备', pattern: '(?:会前)?准备建议' },
  { title: '会议信息', pattern: '会议事实|会议信息' },
  { title: '', pattern: '近期变化|参会人准备' },
] as const;

export type PreparationSection = { title: string; items: string[] };

const PREPARATION_FRAGMENT = /^(?:和|与|及|或|以及|并|、|，|。|；|：|[-—…]+)$/u;

function cleanPreparationItem(value: string): string {
  return value
    .replace(/^\s*(?:[-•·]|\d+[.、])\s*/, '')
    .replace(/\[链接已隐藏\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function preparationMarkerPattern(): RegExp {
  return new RegExp(
    `(${PREPARATION_SECTIONS.map((section) => section.pattern).join('|')})\\s*(?:(?:[:：|｜-])\\s*|(?=\\n))`,
    'g',
  );
}

export function splitPreparationItems(value: string): string[] {
  return value
    .replace(/\s+[-•·]\s+(?=[0-9A-Za-z\u4e00-\u9fff])/g, '\n')
    .replace(/\s+(?=\d+[.、]\s*)/g, '\n')
    .split(/\n+/)
    .map(cleanPreparationItem)
    .filter(
      (item) =>
        /[0-9A-Za-z\u4e00-\u9fff]/u.test(item) &&
        !PREPARATION_FRAGMENT.test(item),
    )
    .slice(0, 8);
}

export function isPreparationCompletionNotice(value?: string): boolean {
  const text = String(value || '').trim();
  if (!text || preparationMarkerPattern().test(text)) return false;
  return (
    /(?:会前准备|简报).{0,24}(?:已完成|已生成|已导出)/u.test(text) &&
    /(?:包含|涵盖|按).{0,100}(?:会议背景|为什么要开这场会|本次要定|今天必须定|上次停点|上次说到哪|未关闭事项|还有什么没说清|准备建议|会上直接这样问)/u.test(
      text,
    )
  );
}

export function parsePreparationBrief(value?: string): PreparationSection[] {
  const text = String(value || '')
    .replace(/^会前准备简报\s*[|｜:：-]?\s*/i, '')
    .trim();
  if (!text || isPreparationCompletionNotice(text)) return [];
  const matches = [...text.matchAll(preparationMarkerPattern())];
  if (!matches.length)
    return [{ title: '准备结果', items: splitPreparationItems(text) }].filter(
      (section) => section.items.length,
    );
  const parsed: PreparationSection[] = [];
  matches.forEach((match, index) => {
    const rawTitle = match[1];
    const definition = PREPARATION_SECTIONS.find((section) =>
      new RegExp(`^(?:${section.pattern})$`).test(rawTitle),
    );
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const items = splitPreparationItems(text.slice(start, end));
    if (definition?.title && items.length)
      parsed.push({ title: definition.title, items });
  });
  const rank = new Map(
    PREPARATION_SECTIONS.map((section, index) => [section.title, index]),
  );
  return parsed.sort(
    (left, right) =>
      (rank.get(left.title as (typeof PREPARATION_SECTIONS)[number]['title']) ??
        99) -
      (rank.get(
        right.title as (typeof PREPARATION_SECTIONS)[number]['title'],
      ) ?? 99),
  );
}

export function hasStructuredPreparationBrief(value?: string): boolean {
  return parsePreparationBrief(value).some(
    (section) => section.title !== '准备结果',
  );
}
