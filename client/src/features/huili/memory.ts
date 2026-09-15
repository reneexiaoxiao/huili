import type { MeetingRecord } from '@shared/api.interface';

import type { SeriesCandidate } from './series';

export type MemoryKind = 'thread' | 'decision' | 'risk' | 'artifact' | 'meeting';
export type MemoryFilter = 'all' | MemoryKind;

export interface MemoryEvidence {
  meetingId: string;
  title: string;
  startedAt: string;
  headline: string;
}

export interface MemoryEntry {
  id: string;
  kind: MemoryKind;
  label: string;
  title: string;
  summary: string;
  detail?: string;
  updatedAt: string;
  evidence: MemoryEvidence[];
  tags: string[];
  sourceUrl?: string;
  sourceLabel?: string;
  seriesId?: string;
}

export interface MemoryGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  kind: 'series' | 'evidence';
  strength: number;
}

const KIND_LABELS: Record<MemoryKind, string> = {
  thread: '会议脉络',
  decision: '明确决定',
  risk: '仍待解',
  artifact: '已有产物',
  meeting: '会议记录',
};

const KIND_WEIGHT: Record<MemoryKind, number> = {
  thread: 5,
  decision: 4,
  risk: 3,
  artifact: 2,
  meeting: 1,
};

function compact(value: string | undefined, limit = 180): string {
  if (!value?.trim()) return '';
  const clean = value.replace(/\s+/gu, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit).trim()}…` : clean;
}

function visibleTitle(value: string): string {
  return compact(value.replace(/^followup-\d{8}-[a-z0-9-]+-\d{2}\s*[:：]\s*/iu, ''), 180);
}

function normalizedKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s，。,.、：:；;（）()【】\[\]“”"']/gu, '')
    .slice(0, 220);
}

function meetingEvidence(meeting: MeetingRecord): MemoryEvidence {
  return {
    meetingId: meeting.id,
    title: visibleTitle(meeting.title),
    startedAt: meeting.startedAt,
    headline: compact(meeting.headline || meeting.summary || meeting.title, 120),
  };
}

function meetingSource(meeting: MeetingRecord): { sourceUrl?: string; sourceLabel?: string } {
  if (meeting.sourceLinks.smartMinutes) return { sourceUrl: meeting.sourceLinks.smartMinutes, sourceLabel: '打开智能纪要' };
  if (meeting.sourceLinks.originalMinutes) return { sourceUrl: meeting.sourceLinks.originalMinutes, sourceLabel: '打开原始妙记' };
  if (meeting.sourceLinks.generatedDocument) return { sourceUrl: meeting.sourceLinks.generatedDocument, sourceLabel: '打开会议产物' };
  if (meeting.sourceLinks.transcript) return { sourceUrl: meeting.sourceLinks.transcript, sourceLabel: '打开逐字稿' };
  if (meeting.sourceLinks.calendarEvent) return { sourceUrl: meeting.sourceLinks.calendarEvent, sourceLabel: '打开日程' };
  return {};
}

function groupedFactEntries(
  meetings: MeetingRecord[],
  kind: Extract<MemoryKind, 'decision' | 'risk'>,
): MemoryEntry[] {
  const groups = new Map<string, { text: string; meetings: MeetingRecord[] }>();
  for (const meeting of meetings) {
    const facts = kind === 'decision' ? meeting.decisions : meeting.risks;
    for (const raw of facts) {
      const text = compact(raw, 220);
      const key = normalizedKey(text);
      if (!key) continue;
      const current = groups.get(key);
      if (current) {
        if (!current.meetings.some((item) => item.id === meeting.id)) current.meetings.push(meeting);
      } else groups.set(key, { text, meetings: [meeting] });
    }
  }
  return [...groups.entries()].map(([key, group]) => {
    const ordered = [...group.meetings].sort((left, right) => +new Date(right.startedAt) - +new Date(left.startedAt));
    const latest = ordered[0];
    const repeated = ordered.length > 1;
    return {
      id: `${kind}-${key}`,
      kind,
      label: KIND_LABELS[kind],
      title: visibleTitle(group.text),
      summary: repeated
        ? `这项内容在 ${ordered.length} 场会议中出现，最近一次来自「${latest.title}」。`
        : compact(latest.headline || latest.summary || `来自「${latest.title}」`, 150),
      updatedAt: latest.startedAt,
      evidence: ordered.slice(0, 5).map(meetingEvidence),
      tags: repeated ? [`${ordered.length} 场会议`] : [],
      ...meetingSource(latest),
    };
  });
}

function threadEntries(seriesCandidates: SeriesCandidate[]): MemoryEntry[] {
  return seriesCandidates.map<MemoryEntry>((series) => {
    const meetings = [...series.meetings]
      .filter((meeting) => meeting.recordType !== 'scheduled')
      .sort((left, right) => +new Date(left.startedAt) - +new Date(right.startedAt));
    const latest = meetings.at(-1);
    const details = [
      series.matterInsight && `对事：${series.matterInsight}`,
      series.peopleInsight && `对人：${series.peopleInsight}`,
      series.nextConclusion && `接下来：${series.nextConclusion}`,
    ].filter((item): item is string => Boolean(item));
    return {
      id: `thread-${series.id}`,
      kind: 'thread',
      label: KIND_LABELS.thread,
      title: series.label,
      summary: compact(series.currentProgress || latest?.headline || latest?.summary || `${meetings.length} 场会议形成连续脉络`, 180),
      detail: details.join('\n'),
      updatedAt: latest?.startedAt ?? new Date(0).toISOString(),
      evidence: meetings.slice(-6).reverse().map(meetingEvidence),
      tags: [`${meetings.length} 场会议`, ...series.matchReasons.slice(0, 2).map((reason) => compact(reason, 36))],
      seriesId: series.id,
    };
  }).filter((entry) => entry.evidence.length >= 2);
}

function artifactEntries(meetings: MeetingRecord[]): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const seenUrls = new Set<string>();
  for (const meeting of meetings) {
    const add = (url: string | undefined, title: string, summary: string, sourceLabel = '打开产物') => {
      if (!url || seenUrls.has(url)) return;
      seenUrls.add(url);
      entries.push({
        id: `artifact-${meeting.id}-${entries.length}`,
        kind: 'artifact',
        label: KIND_LABELS.artifact,
        title: visibleTitle(title),
        summary: compact(summary, 160),
        updatedAt: meeting.startedAt,
        evidence: [meetingEvidence(meeting)],
        tags: [meeting.project].filter((item): item is string => Boolean(item)),
        sourceUrl: url,
        sourceLabel,
      });
    };
    add(meeting.sourceLinks.generatedDocument, `${meeting.title} · 会后产物`, meeting.headline);
    for (const action of meeting.actions) {
      for (const result of action.resultLinks) {
        if (result.kind !== 'source') add(result.url, result.label || action.deliverable || action.title, result.description || action.evidenceSummary || meeting.headline);
      }
    }
  }
  return entries;
}

function meetingEntries(meetings: MeetingRecord[]): MemoryEntry[] {
  return meetings.map((meeting) => ({
    id: `meeting-${meeting.id}`,
    kind: 'meeting',
    label: KIND_LABELS.meeting,
    title: visibleTitle(meeting.title),
    summary: compact(meeting.headline || meeting.summary || '已同步会议记录', 180),
    detail: compact(meeting.summary, 420) || undefined,
    updatedAt: meeting.startedAt,
    evidence: [meetingEvidence(meeting)],
    tags: [meeting.project, meeting.durationMinutes ? `${meeting.durationMinutes} 分钟` : undefined].filter((item): item is string => Boolean(item)),
    ...meetingSource(meeting),
  }));
}

export function buildMemoryEntries(meetings: MeetingRecord[], seriesCandidates: SeriesCandidate[]): MemoryEntry[] {
  const recorded = meetings
    .filter((meeting) => meeting.recordType !== 'scheduled')
    .sort((left, right) => +new Date(right.startedAt) - +new Date(left.startedAt));
  const entries = [
    ...threadEntries(seriesCandidates),
    ...groupedFactEntries(recorded, 'decision'),
    ...groupedFactEntries(recorded, 'risk'),
    ...artifactEntries(recorded),
    ...meetingEntries(recorded),
  ];
  const seriesByMeetingId = new Map<string, string>();
  for (const series of [...seriesCandidates].sort((left, right) => right.confidence - left.confidence)) {
    for (const meeting of series.meetings) {
      if (!seriesByMeetingId.has(meeting.id)) seriesByMeetingId.set(meeting.id, series.id);
    }
  }
  return entries
    .map((entry) => {
      if (entry.seriesId) return entry;
      const seriesId = entry.evidence.map((evidence) => seriesByMeetingId.get(evidence.meetingId)).find(Boolean);
      return seriesId ? { ...entry, seriesId } : entry;
    })
    .sort((left, right) => (
      KIND_WEIGHT[right.kind] - KIND_WEIGHT[left.kind]
      || +new Date(right.updatedAt) - +new Date(left.updatedAt)
      || left.title.localeCompare(right.title, 'zh-CN')
    ));
}

const GRAPH_KIND_QUOTA: Record<MemoryKind, number> = {
  thread: 1,
  decision: 3,
  risk: 2,
  artifact: 2,
  meeting: 1,
};

function sharedEvidenceCount(left: MemoryEntry, right: MemoryEntry): number {
  const leftMeetingIds = new Set(left.evidence.map((evidence) => evidence.meetingId));
  return right.evidence.reduce((count, evidence) => count + Number(leftMeetingIds.has(evidence.meetingId)), 0);
}

function graphRelationScore(left: MemoryEntry, right: MemoryEntry): number {
  const sharedEvidence = sharedEvidenceCount(left, right);
  const sameSeries = Boolean(left.seriesId && left.seriesId === right.seriesId);
  if (!sharedEvidence && !sameSeries) return 0;
  return sharedEvidence * 5 + Number(sameSeries) * 4 + Number(left.kind === 'thread' || right.kind === 'thread') * 2;
}

function graphEntryScore(entry: MemoryEntry, index: number): number {
  const kindScore: Record<MemoryKind, number> = { thread: 50, decision: 42, risk: 38, artifact: 30, meeting: 18 };
  return kindScore[entry.kind] + Math.min(entry.evidence.length, 6) * 5 - index / 1000;
}

/** Selects a small, connected and type-diverse view instead of rendering the whole memory index. */
export function selectMemoryGraphEntries(entries: MemoryEntry[], selectedId?: string, limit = 9): MemoryEntry[] {
  if (limit <= 0 || entries.length === 0) return [];
  const ordered = entries
    .map((entry, index) => ({ entry, score: graphEntryScore(entry, index) }))
    .sort((left, right) => right.score - left.score)
    .map(({ entry }) => entry);
  const selected = entries.find((entry) => entry.id === selectedId);
  const result: MemoryEntry[] = [];
  const seen = new Set<string>();
  const quotaUsed: Record<MemoryKind, number> = { thread: 0, decision: 0, risk: 0, artifact: 0, meeting: 0 };
  const add = (entry: MemoryEntry | undefined) => {
    if (!entry || seen.has(entry.id) || result.length >= limit) return;
    result.push(entry);
    seen.add(entry.id);
    quotaUsed[entry.kind] += 1;
  };

  const defaultFocus = ordered.find((entry) => entry.kind !== 'thread' && entry.kind !== 'meeting') ?? ordered[0];
  add(selected ?? defaultFocus);
  if (selected) {
    ordered
      .filter((entry) => entry.id !== selected.id)
      .map((entry) => ({ entry, score: graphRelationScore(selected, entry) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 4)
      .forEach(({ entry }) => add(entry));
  }

  (Object.keys(GRAPH_KIND_QUOTA) as MemoryKind[]).forEach((kind) => {
    ordered
      .filter((entry) => entry.kind === kind)
      .slice(0, Math.max(0, GRAPH_KIND_QUOTA[kind] - quotaUsed[kind]))
      .forEach(add);
  });
  ordered.forEach(add);
  return result;
}

function graphRelationLabel(left: MemoryEntry, right: MemoryEntry, sameSeries: boolean, sharedEvidence: number): string {
  if (sameSeries) {
    const detail = left.kind === 'thread' ? right : right.kind === 'thread' ? left : undefined;
    if (detail?.kind === 'decision') return '脉络中的决定';
    if (detail?.kind === 'risk') return '脉络中的阻塞';
    if (detail?.kind === 'artifact') return '脉络中的产物';
    if (detail?.kind === 'meeting') return '脉络中的会议';
    return '同一会议脉络';
  }
  return sharedEvidence > 1 ? '多场会议共同印证' : '来自同一场会';
}

/** Builds traceable semantic edges from shared source meetings and series membership. */
export function buildMemoryGraphEdges(entries: MemoryEntry[], limit = 16): MemoryGraphEdge[] {
  const candidates: MemoryGraphEdge[] = [];
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex];
      const right = entries[rightIndex];
      const sharedEvidence = sharedEvidenceCount(left, right);
      const sameSeries = Boolean(left.seriesId && left.seriesId === right.seriesId);
      const strength = graphRelationScore(left, right);
      if (!strength) continue;
      candidates.push({
        id: `memory-edge-${left.id}-${right.id}`,
        sourceId: left.id,
        targetId: right.id,
        label: graphRelationLabel(left, right, sameSeries, sharedEvidence),
        kind: sameSeries ? 'series' : 'evidence',
        strength,
      });
    }
  }

  const degree = new Map<string, number>();
  const result: MemoryGraphEdge[] = [];
  for (const edge of candidates.sort((left, right) => right.strength - left.strength)) {
    if (result.length >= limit) break;
    const sourceDegree = degree.get(edge.sourceId) ?? 0;
    const targetDegree = degree.get(edge.targetId) ?? 0;
    if (sourceDegree >= 5 || targetDegree >= 5) continue;
    result.push(edge);
    degree.set(edge.sourceId, sourceDegree + 1);
    degree.set(edge.targetId, targetDegree + 1);
  }
  return result;
}

export function filterMemoryEntries(entries: MemoryEntry[], query: string, filter: MemoryFilter): MemoryEntry[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter !== 'all' && entry.kind !== filter) return false;
    if (!needle) return true;
    const haystack = [
      entry.label,
      entry.title,
      entry.summary,
      entry.detail,
      ...entry.tags,
      ...entry.evidence.flatMap((evidence) => [evidence.title, evidence.headline]),
    ].filter(Boolean).join('\n').toLowerCase();
    return haystack.includes(needle);
  });
}

export function memoryKindLabel(kind: MemoryKind): string {
  return KIND_LABELS[kind];
}
