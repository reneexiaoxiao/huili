import type { MeetingAction, MeetingRecord, OwnerInsightBasis, OwnerInsightDimension, OwnerInsightSnapshot } from '@shared/api.interface';

export interface SeriesCandidate {
  id: string;
  label: string;
  themeCluster?: string;
  meetings: MeetingRecord[];
  strength: number;
  confidence: number;
  matchReasons: string[];
  conflictSignals: string[];
  currentProgress?: string;
  nextConclusion?: string;
  matterInsight?: string;
  peopleInsight?: string;
  ownerInsights?: OwnerInsightSnapshot[];
}

export interface SeriesMembership {
  id: string;
  label: string;
  count: number;
  alternatives: Array<{ id: string; label: string; count: number }>;
}

export interface SeriesPathStep {
  id: string;
  meetingId: string;
  title: string;
  at: string;
  stage: string;
  summary: string;
  transition?: string;
}

export interface SeriesInsight {
  kind: 'next' | 'matter' | 'people';
  label: string;
  title: string;
  detail: string;
  evidenceCount: number;
  meetingId?: string;
}

export interface SeriesThemeCluster {
  id: string;
  label: string;
  series: SeriesCandidate[];
  meetingCount: number;
  source: 'model' | 'fallback';
}

const SERIES_STOP_BIGRAMS = new Set(['会议', '纪要', '沟通', '讨论', '同步', '访谈', '项目', '相关', '需求', '方案', '确认', '周会', '复盘', '评审', '总结']);
const RECORDED_CANDIDATE_LIMIT = 180;
const SERIES_BATCH_SIZE = 12;
const SERIES_BATCH_OVERLAP = 4;
const SERIES_BATCH_LIMIT = 9;

function cleanSeriesTitle(title: string): string {
  return title
    .replace(/\d{4}[-/.年]\d{1,2}[-/.月]\d{0,2}日?/gu, '')
    .replace(/\b(?:20\d{2}|\d{1,2}:\d{2})\b/gu, '')
    .replace(/[\s|｜·—_\-【】()[\]（）]/gu, '')
    .replace(/纪要|会议记录/gu, '');
}

export function titleSignals(title: string): Set<string> {
  const clean = cleanSeriesTitle(title);
  const signals = new Set<string>();
  const latin: string[] = clean.match(/[A-Za-z][A-Za-z0-9]{1,}/gu) ?? [];
  latin.forEach((token) => { if (token.toUpperCase() !== 'AI') signals.add(token.toLowerCase()); });
  const han: string[] = clean.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  for (const token of han) {
    for (let index = 0; index < token.length - 1; index += 1) {
      const gram = token.slice(index, index + 2);
      if (!SERIES_STOP_BIGRAMS.has(gram)) signals.add(gram);
    }
  }
  return signals;
}

function stableSeriesId(meetings: MeetingRecord[]): string {
  const source = meetings.map((meeting) => meeting.id).sort().join('|');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `series-${(hash >>> 0).toString(36)}`;
}

interface ModelSeriesItem {
  name?: unknown;
  themeCluster?: unknown;
  meetingIds?: unknown;
  matchReasons?: unknown;
  conflictSignals?: unknown;
  confidence?: unknown;
  currentProgress?: unknown;
  nextConclusion?: unknown;
  matterInsight?: unknown;
  peopleInsight?: unknown;
  ownerInsights?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseModelOutput(output: unknown): Record<string, unknown> | undefined {
  const candidate = isRecord(output) && 'output' in output ? output.output : output;
  if (isRecord(candidate)) return candidate;
  if (typeof candidate !== 'string') return undefined;

  const trimmed = candidate.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
  try {
    const parsed: unknown = JSON.parse(unfenced);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

const OWNER_INSIGHT_DIMENSIONS = new Set<OwnerInsightDimension>(['communication', 'work_style', 'upward', 'downward']);
const OWNER_INSIGHT_BASES = new Set<OwnerInsightBasis>(['meeting_behavior', 'thinking_pattern', 'collaboration_pattern']);

function ownerInsightsFromModel(value: unknown, meetingIds: ReadonlySet<string>): OwnerInsightSnapshot[] {
  if (!Array.isArray(value)) return [];
  const result: OwnerInsightSnapshot[] = [];
  const seen = new Set<OwnerInsightDimension>();
  for (const item of value.slice(0, 8)) {
    if (!isRecord(item)) continue;
    const dimension = stringValue(item.dimension) as OwnerInsightDimension | undefined;
    const basis = stringValue(item.basis) as OwnerInsightBasis | undefined;
    const observation = stringValue(item.observation);
    const rawAdvice = isRecord(item.advice) ? item.advice : {};
    const advice = {
      coach: stringValue(rawAdvice.coach),
      supportive: stringValue(rawAdvice.supportive),
      advisory: stringValue(rawAdvice.advisory),
      balanced: stringValue(rawAdvice.balanced),
    };
    const evidenceExternalKeys = [...new Set(stringValues(item.evidenceExternalKeys))]
      .filter((meetingId) => meetingIds.has(meetingId))
      .slice(0, 16);
    if (!dimension || !OWNER_INSIGHT_DIMENSIONS.has(dimension) || seen.has(dimension)
      || !basis || !OWNER_INSIGHT_BASES.has(basis)
      || !observation || evidenceExternalKeys.length < 2
      || !advice.coach || !advice.supportive || !advice.advisory || !advice.balanced) continue;
    seen.add(dimension);
    const confidence = typeof item.confidence === 'number'
      ? Math.max(0, Math.min(1, item.confidence))
      : 0.65;
    result.push({
      id: stringValue(item.id) ?? `insight-${dimension}-${result.length + 1}`,
      dimension,
      basis,
      observation,
      advice: {
        coach: advice.coach,
        supportive: advice.supportive,
        advisory: advice.advisory,
        balanced: advice.balanced,
      },
      evidenceExternalKeys,
      confidence,
    });
    if (result.length >= 4) break;
  }
  return result;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim();
}

function stringValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim());
}

function normalizedScheduledTitle(title: string): string {
  return title
    .replace(/\d{4}[-/.年]\d{1,2}[-/.月]\d{0,2}日?/gu, '')
    .replace(/\s+/gu, '')
    .toLowerCase();
}

export function prepareMeetingCandidates(meetings: MeetingRecord[]): MeetingRecord[] {
  const recorded = meetings
    .filter((meeting: MeetingRecord) => meeting.recordType !== 'scheduled')
    .sort((left: MeetingRecord, right: MeetingRecord) => (
      +new Date(right.startedAt) - +new Date(left.startedAt)
    ))
    .slice(0, RECORDED_CANDIDATE_LIMIT);
  const scheduledCounts = new Map<string, number>();
  const scheduled = meetings
    .filter((meeting: MeetingRecord) => meeting.recordType === 'scheduled')
    .sort((left: MeetingRecord, right: MeetingRecord) => (
      +new Date(left.startedAt) - +new Date(right.startedAt)
    ))
    .filter((meeting: MeetingRecord) => {
      const key = normalizedScheduledTitle(meeting.title);
      const count = scheduledCounts.get(key) ?? 0;
      if (count >= 2) return false;
      scheduledCounts.set(key, count + 1);
      return true;
    })
    .slice(0, 8);
  return [...recorded, ...scheduled];
}

export function prepareMeetingBatches(meetings: MeetingRecord[]): MeetingRecord[][] {
  const candidates = prepareMeetingCandidates(meetings);
  const recorded = candidates.filter((meeting: MeetingRecord) => meeting.recordType !== 'scheduled');
  const scheduled = candidates.filter((meeting: MeetingRecord) => meeting.recordType === 'scheduled');
  const batches: MeetingRecord[][] = [];
  const step = SERIES_BATCH_SIZE - SERIES_BATCH_OVERLAP;
  for (let offset = 0; offset < recorded.length && batches.length < SERIES_BATCH_LIMIT; offset += step) {
    const batch = recorded.slice(offset, offset + SERIES_BATCH_SIZE);
    if (batch.length >= 2) batches.push(batch);
    if (offset + SERIES_BATCH_SIZE >= recorded.length) break;
  }
  const futureBridge = [...recorded.slice(0, 4), ...scheduled];
  if (futureBridge.length >= 2) batches.push(futureBridge);
  return batches;
}

export function mergeSeriesCandidates(candidates: SeriesCandidate[]): SeriesCandidate[] {
  const merged: SeriesCandidate[] = [];
  const ranked = [...candidates]
    .sort((left, right) => right.confidence - left.confidence || right.meetings.length - left.meetings.length || right.strength - left.strength);
  for (const candidate of ranked) {
    const candidateIds = new Set(candidate.meetings.map((meeting: MeetingRecord) => meeting.id));
    const candidateSignals = titleSignals(candidate.label);
    const isDuplicate = merged.some((current: SeriesCandidate) => {
      if (current.id === candidate.id) return true;
      const currentIds = new Set(current.meetings.map((meeting: MeetingRecord) => meeting.id));
      const overlap = [...candidateIds].filter((meetingId: string) => currentIds.has(meetingId)).length;
      const containment = overlap / Math.min(candidateIds.size, currentIds.size);
      const currentSignals = titleSignals(current.label);
      const sharesMeaningfulLabel = [...candidateSignals].some((signal: string) => currentSignals.has(signal));
      return containment >= 0.8 && sharesMeaningfulLabel;
    });
    if (!isDuplicate) merged.push(candidate);
    if (merged.length === 8) break;
  }
  return merged;
}

function isGenericSeriesLabel(value: string): boolean {
  const normalized = value.replace(/[\s，。,.、：:；;（）()【】「」]/gu, '');
  return /^(?:AI|项目|工作|业务)?(?:相关|综合)?(?:讨论|沟通|推进|会议)$/u.test(normalized)
    || normalized.includes('综合讨论');
}

export function seriesCandidatesFromModel(output: unknown, meetings: MeetingRecord[]): SeriesCandidate[] {
  const parsedOutput = parseModelOutput(output);
  if (!parsedOutput || !Array.isArray(parsedOutput.series)) return [];
  const meetingById = new Map(meetings.map((meeting) => [meeting.id, meeting]));
  const memberships = new Set<string>();
  const candidates: SeriesCandidate[] = [];

  for (const raw of parsedOutput.series.slice(0, 10)) {
    if (!isRecord(raw)) continue;
    const item: ModelSeriesItem = raw;
    const label = stringValue(item.name);
    const meetingIds = [...new Set(stringValues(item.meetingIds))];
    const groupedMeetings = meetingIds
      .map((meetingId) => meetingById.get(meetingId))
      .filter((meeting): meeting is MeetingRecord => Boolean(meeting))
      .sort((left, right) => +new Date(left.startedAt) - +new Date(right.startedAt));
    const matchReasons = stringValues(item.matchReasons).slice(0, 6);
    const membershipKey = groupedMeetings.map((meeting) => meeting.id).sort().join('|');
    const isOverBroad = groupedMeetings.length > 16
      || (meetings.length >= 10 && groupedMeetings.length / meetings.length > 0.72);
    if (!label || isGenericSeriesLabel(label) || groupedMeetings.length < 2 || matchReasons.length === 0 || isOverBroad || memberships.has(membershipKey)) continue;
    memberships.add(membershipKey);
    const rawConfidence = typeof item.confidence === 'number' ? item.confidence : 0.6;
    const groupedMeetingIds = new Set(groupedMeetings.map((meeting) => meeting.id));
    candidates.push({
      id: stableSeriesId(groupedMeetings),
      label: label.slice(0, 28),
      themeCluster: stringValue(item.themeCluster)?.slice(0, 24),
      meetings: groupedMeetings,
      strength: matchReasons.length,
      confidence: Math.max(0, Math.min(1, rawConfidence)),
      matchReasons,
      conflictSignals: stringValues(item.conflictSignals).slice(0, 4),
      currentProgress: stringValue(item.currentProgress),
      nextConclusion: stringValue(item.nextConclusion),
      matterInsight: stringValue(item.matterInsight),
      peopleInsight: stringValue(item.peopleInsight),
      ownerInsights: ownerInsightsFromModel(item.ownerInsights, groupedMeetingIds),
    });
  }
  return candidates
    .sort((left, right) => right.confidence - left.confidence || right.strength - left.strength)
    .slice(0, 8);
}

const FALLBACK_THEME_RULES: Array<{ label: string; signals: RegExp }> = [];

function normalizedThemeCluster(value: string | undefined): string | undefined {
  const label = value?.replace(/[「」【】]/gu, '').replace(/\s+/gu, ' ').trim().slice(0, 24);
  if (!label || /^(?:其他|综合|未分类|AI相关|相关主题|会议主题)$/iu.test(label)) return undefined;
  return label;
}

function fallbackThemeCluster(series: SeriesCandidate): string {
  const evidence = [
    series.label,
    series.currentProgress,
    series.matterInsight,
    ...series.meetings.map((meeting) => `${meeting.project ?? ''} ${meeting.title}`),
  ].filter(Boolean).join(' ');
  const ranked = FALLBACK_THEME_RULES
    .map((rule, index) => ({
      label: rule.label,
      index,
      score: Array.from(evidence.matchAll(rule.signals)).length,
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked[0]?.label ?? '其他推进';
}

function stableThemeClusterId(label: string): string {
  let hash = 2166136261;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `theme-${(hash >>> 0).toString(36)}`;
}

export function buildSeriesThemeClusters(seriesCandidates: SeriesCandidate[]): SeriesThemeCluster[] {
  const grouped = new Map<string, { series: SeriesCandidate[]; modelCount: number }>();
  for (const series of seriesCandidates) {
    const modelLabel = normalizedThemeCluster(series.themeCluster);
    const label = modelLabel ?? fallbackThemeCluster(series);
    const current = grouped.get(label) ?? { series: [], modelCount: 0 };
    current.series.push(series);
    if (modelLabel) current.modelCount += 1;
    grouped.set(label, current);
  }
  return Array.from(grouped.entries())
    .map(([label, value]) => {
      const series = [...value.series].sort((left, right) => (
        right.meetings.length - left.meetings.length
        || right.confidence - left.confidence
        || left.label.localeCompare(right.label, 'zh-CN')
      ));
      const meetingCount = new Set(series.flatMap((candidate) => candidate.meetings.map((meeting) => meeting.id))).size;
      return {
        id: stableThemeClusterId(label),
        label,
        series,
        meetingCount,
        source: value.modelCount === value.series.length ? 'model' as const : 'fallback' as const,
      };
    })
    .sort((left, right) => (
      right.series.length - left.series.length
      || right.meetingCount - left.meetingCount
      || left.label.localeCompare(right.label, 'zh-CN')
    ));
}

export function indexSeriesMembership(seriesCandidates: SeriesCandidate[]): Map<string, SeriesMembership> {
  const index = new Map<string, SeriesMembership>();
  for (const series of seriesCandidates) {
    for (const meeting of series.meetings) {
      const membership = { id: series.id, label: series.label, count: series.meetings.length };
      const current = index.get(meeting.id);
      if (!current) index.set(meeting.id, { ...membership, alternatives: [] });
      else current.alternatives.push(membership);
    }
  }
  return index;
}

function hasOutput(meeting: MeetingRecord): boolean {
  return Boolean(meeting.sourceLinks.generatedDocument || meeting.actions.some((action) => action.resultLinks.length));
}

function openActions(meetings: MeetingRecord[]): MeetingAction[] {
  return meetings.flatMap((meeting) => meeting.actions.filter((action) => !['done', 'deferred', 'cancelled'].includes(action.status)));
}

export function buildSeriesPath(series: SeriesCandidate): SeriesPathStep[] {
  return series.meetings.map((meeting, index) => {
    const previous = series.meetings[index - 1];
    const currentOpenActions = meeting.actions.filter((action) => !['done', 'deferred', 'cancelled'].includes(action.status));
    const stage = meeting.recordType === 'scheduled'
      ? '下一场待准备'
      : index === 0
      ? '议题进入讨论'
      : hasOutput(meeting)
        ? '形成产物'
        : meeting.risks.length > 0
          ? '暴露阻塞'
          : meeting.decisions.length > 0
            ? '形成决定'
            : currentOpenActions.length > 0
              ? '进入推进'
              : index === series.meetings.length - 1 ? '更新现状' : '继续澄清';
    const summary = meeting.decisions[0] || meeting.risks[0] || meeting.headline || meeting.summary || `${meeting.actions.length} 项行动`;
    let transition: string | undefined;
    if (previous) {
      if (meeting.recordType === 'scheduled') transition = '带着未决问题进入下一场';
      else if (meeting.decisions.length > 0 && previous.risks.length > 0) transition = '回应上一轮阻塞';
      else if (hasOutput(meeting)) transition = '把讨论转为产物';
      else if (meeting.risks.length > previous.risks.length) transition = '发现新的约束';
      else if (meeting.decisions.length > previous.decisions.length) transition = '收敛为决定';
      else transition = '带着未决问题继续';
    }
    return { id: `path-${meeting.id}`, meetingId: meeting.id, title: meeting.title, at: meeting.startedAt, stage, summary, transition };
  });
}

export function buildSeriesInsights(series: SeriesCandidate): SeriesInsight[] {
  const meetings = series.meetings;
  const latest = meetings.at(-1)!;
  const authoredNextConclusion = series.nextConclusion?.trim();
  const authoredMatterInsight = series.matterInsight?.trim();
  const authoredPeopleInsight = series.peopleInsight?.trim();
  const risks = meetings.flatMap((meeting) => meeting.risks.map((risk) => ({ meeting, risk })));
  const decisions = meetings.flatMap((meeting) => meeting.decisions.map((decision) => ({ meeting, decision })));
  const actions = meetings.flatMap((meeting) => meeting.actions);
  const open = openActions(meetings);
  const awaiting = open.filter((action) => action.status === 'awaiting_confirmation');
  const dependencies = open.filter((action) => action.dependency?.trim());
  const userOwned = open.filter((action) => action.category === 'user_owned');
  const latestRisk = [...risks].reverse()[0];
  const latestDecision = [...decisions].reverse()[0];
  const insights: SeriesInsight[] = [];

  if (authoredNextConclusion) {
    insights.push({
      kind: 'next',
      label: '下一步应形成的结论',
      title: authoredNextConclusion,
      detail: series.currentProgress || `基于 ${series.meetings.length} 场会议的连续承接。`,
      evidenceCount: series.matchReasons.length,
      meetingId: latest.id,
    });
  }

  if (authoredMatterInsight) {
    insights.push({
      kind: 'matter',
      label: '对事 · 推进过程',
      title: authoredMatterInsight,
      detail: series.matchReasons[0] || '可从系列会议中回溯。',
      evidenceCount: series.matchReasons.length,
      meetingId: latest.id,
    });
  }

  if (authoredPeopleInsight) {
    insights.push({
      kind: 'people',
      label: '对人 · 协作过程',
      title: authoredPeopleInsight,
      detail: series.matchReasons[1] || series.matchReasons[0] || '可从系列会议中回溯。',
      evidenceCount: series.matchReasons.length,
      meetingId: latest.id,
    });
  }

  if (!authoredNextConclusion && latestRisk) {
    insights.push({ kind: 'next', label: '下一步应形成的结论', title: `先对齐：${latestRisk.risk}`, detail: `该问题在最近一轮仍被列为阻塞；下一场会应明确负责人、完成标准或取舍。`, evidenceCount: risks.length, meetingId: latestRisk.meeting.id });
  } else if (!authoredNextConclusion && open[0]) {
    insights.push({ kind: 'next', label: '下一步应形成的结论', title: `把「${open[0].title}」收敛成可验收结果`, detail: `当前系列还有 ${open.length} 项行动未关闭，下一轮应先确认结果与验收口径。`, evidenceCount: open.length, meetingId: latest.id });
  } else if (!authoredNextConclusion && latestDecision) {
    insights.push({ kind: 'next', label: '下一步应形成的结论', title: `验证「${latestDecision.decision}」是否已经落地`, detail: '讨论已经形成决定，但仍需要通过结果或产物确认实际完成。', evidenceCount: decisions.length, meetingId: latestDecision.meeting.id });
  } else if (!authoredNextConclusion) {
    const recentProgress = (series.currentProgress || latest.headline || latest.summary || '').replace(/\s+/gu, ' ').trim();
    const excerpt = recentProgress.length > 110 ? `${recentProgress.slice(0, 110).trim()}…` : recentProgress;
    insights.push({
      kind: 'next',
      label: '下一步应形成的结论',
      title: '确认当前进展是否已经达到下一阶段条件',
      detail: excerpt
        ? `最近记录为「${excerpt}」。下一场应明确是否进入下一阶段、由谁确认，以及以什么结果作为依据。`
        : '现有记录尚未写出下一轮必须形成的判断；下一场应明确取舍、确认人和验收依据。',
      evidenceCount: Math.max(series.matchReasons.length, 1),
      meetingId: latest.id,
    });
  }

  if (!authoredMatterInsight && decisions.length + risks.length >= 2) {
    const closed = actions.filter((action) => action.status === 'done').length;
    insights.push({
      kind: 'matter',
      label: '对事 · 推进方式',
      title: risks.length > decisions.length ? '问题暴露快于决策收敛' : open.length > closed ? '已有决定，执行闭环仍是主线' : '讨论正在从决定走向交付',
      detail: `${meetings.length} 场会形成 ${decisions.length} 条决定、${risks.length} 个阻塞；行动 ${closed} 项完成、${open.length} 项未关闭。`,
      evidenceCount: decisions.length + risks.length + actions.length,
      meetingId: latest.id,
    });
  }

  if (!authoredPeopleInsight && awaiting.length + dependencies.length + userOwned.length >= 2) {
    const title = awaiting.length >= Math.max(dependencies.length, userOwned.length)
      ? '关键推进多次停在你的确认'
      : dependencies.length >= userOwned.length
        ? '协作节奏受外部反馈牵制'
        : '执行责任持续回到你这里';
    insights.push({
      kind: 'people',
      label: '对人 · 协作过程',
      title,
      detail: `${awaiting.length} 项等待确认，${dependencies.length} 项依赖他人或外部输入，${userOwned.length} 项仍由你推进。`,
      evidenceCount: awaiting.length + dependencies.length + userOwned.length,
      meetingId: latest.id,
    });
  }
  return insights;
}
