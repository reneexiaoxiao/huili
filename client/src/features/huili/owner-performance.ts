import type {
  MeetingRecord,
  OwnerInsightAdviceSnapshot,
  OwnerInsightBasis,
  OwnerInsightDimension,
} from '@shared/api.interface';

import type { SeriesCandidate } from './series';

export type OwnerPerformanceRangeKey = 'today' | '7d' | '30d' | '90d';
export type OwnerPerformanceScope = OwnerPerformanceRangeKey;
export type OwnerPerformanceDimension = OwnerInsightDimension;

export interface OwnerPerformanceRangeOption {
  key: OwnerPerformanceRangeKey;
  label: string;
  days: number;
}

export interface OwnerPerformanceEvidence {
  meetingId: string;
  externalKey: string;
  title: string;
  startedAt: string;
}

export interface OwnerPerformanceInsight {
  id: string;
  scope: OwnerPerformanceScope;
  dimension: OwnerPerformanceDimension;
  basis: OwnerInsightBasis;
  label: string;
  title: string;
  observation: string;
  advice: OwnerInsightAdviceSnapshot;
  evidence: OwnerPerformanceEvidence[];
  source: 'series_pattern';
}

export interface OwnerPerformanceRangeView extends OwnerPerformanceRangeOption {
  meetings: MeetingRecord[];
  recordedMeetings: MeetingRecord[];
  insights: OwnerPerformanceInsight[];
}

export interface OwnerPerformanceView {
  ranges: Record<OwnerPerformanceRangeKey, OwnerPerformanceRangeView>;
}

export const OWNER_PERFORMANCE_RANGE_OPTIONS: readonly OwnerPerformanceRangeOption[] = [
  { key: 'today', label: '今天', days: 1 },
  { key: '7d', label: '近 7 天', days: 7 },
  { key: '30d', label: '近 30 天', days: 30 },
  { key: '90d', label: '近 90 天', days: 90 },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const SHANGHAI_DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const SERIES_INSIGHT_LABELS: Record<OwnerInsightDimension, {
  label: string;
  recentTitle: string;
  todayTitle: string;
}> = {
  communication: {
    label: '表达与追问',
    recentTitle: '你在表达与追问上有一个反复模式',
    todayTitle: '今天的表达与追问延续了近期模式',
  },
  work_style: {
    label: '判断与收敛',
    recentTitle: '你处理问题的取舍方式在多场会里重复出现',
    todayTitle: '今天的判断方式延续了近期模式',
  },
  upward: {
    label: '向上对齐',
    recentTitle: '你向上呈现判断时有一个反复模式',
    todayTitle: '今天的向上对齐延续了近期模式',
  },
  downward: {
    label: '引导与授权',
    recentTitle: '你在引导团队形成结论时有一个反复模式',
    todayTitle: '今天的引导与授权延续了近期模式',
  },
};

function shanghaiDayKey(value: Date | string): string {
  return SHANGHAI_DAY_FORMATTER.format(typeof value === 'string' ? new Date(value) : value);
}

function isRecordedMeeting(meeting: MeetingRecord, nowMs: number): boolean {
  return meeting.recordType === 'minutes' && new Date(meeting.startedAt).getTime() <= nowMs;
}

function sortNewestFirst(meetings: MeetingRecord[]): MeetingRecord[] {
  return [...meetings].sort((left, right) => +new Date(right.startedAt) - +new Date(left.startedAt));
}

function shanghaiDayStartMs(value: Date): number {
  const [year, month, day] = shanghaiDayKey(value).split('-').map(Number);
  return Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000;
}

function meetingsInRange(
  meetings: MeetingRecord[],
  option: OwnerPerformanceRangeOption,
  now: Date,
): MeetingRecord[] {
  const todayKey = shanghaiDayKey(now);
  if (option.key === 'today') {
    return sortNewestFirst(meetings.filter((meeting) => shanghaiDayKey(meeting.startedAt) === todayKey));
  }
  const startMs = shanghaiDayStartMs(now) - (option.days - 1) * DAY_MS;
  const endMs = shanghaiDayStartMs(now) + DAY_MS;
  return sortNewestFirst(meetings.filter((meeting) => {
    const startedAt = new Date(meeting.startedAt).getTime();
    return startedAt >= startMs && startedAt < endMs;
  }));
}

function evidenceFrom(meetings: MeetingRecord[], limit = 4): OwnerPerformanceEvidence[] {
  return sortNewestFirst(meetings).slice(0, limit).map((meeting) => ({
    meetingId: meeting.id,
    externalKey: meeting.externalKey,
    title: meeting.title,
    startedAt: meeting.startedAt,
  }));
}

function modelPerformanceInsights(
  seriesCandidates: SeriesCandidate[],
  evidenceByExternalKey: ReadonlyMap<string, MeetingRecord>,
  scope: OwnerPerformanceScope,
  requiredEvidenceKeys?: ReadonlySet<string>,
): OwnerPerformanceInsight[] {
  const bestByObservation = new Map<string, {
    insight: OwnerPerformanceInsight;
    weight: number;
    latestEvidenceAt: number;
  }>();
  for (const series of seriesCandidates) {
    for (const ownerInsight of series.ownerInsights ?? []) {
      const evidence = ownerInsight.evidenceExternalKeys
        .map((externalKey) => evidenceByExternalKey.get(externalKey))
        .filter((meeting): meeting is MeetingRecord => Boolean(meeting));
      if (evidence.length < 2) continue;
      if (requiredEvidenceKeys && !evidence.some((meeting) => requiredEvidenceKeys.has(meeting.externalKey))) continue;
      const meta = SERIES_INSIGHT_LABELS[ownerInsight.dimension];
      const candidate: OwnerPerformanceInsight = {
        id: `${scope}-${series.id}-${ownerInsight.id}`,
        scope,
        dimension: ownerInsight.dimension,
        basis: ownerInsight.basis,
        label: meta.label,
        title: scope === 'today' ? meta.todayTitle : meta.recentTitle,
        observation: ownerInsight.observation,
        advice: ownerInsight.advice,
        evidence: evidenceFrom(evidence),
        source: 'series_pattern',
      };
      const weight = evidence.length + ownerInsight.confidence;
      const latestEvidenceAt = Math.max(...evidence.map((meeting) => +new Date(meeting.startedAt)));
      const observationKey = `${ownerInsight.dimension}:${ownerInsight.observation.trim().toLocaleLowerCase('zh-CN')}`;
      const current = bestByObservation.get(observationKey);
      if (!current || weight > current.weight || (weight === current.weight && latestEvidenceAt > current.latestEvidenceAt)) {
        bestByObservation.set(observationKey, { insight: candidate, weight, latestEvidenceAt });
      }
    }
  }
  return [...bestByObservation.values()]
    .sort((left, right) => right.weight - left.weight || right.latestEvidenceAt - left.latestEvidenceAt)
    .map(({ insight }) => insight);
}

export function buildOwnerPerformanceView(
  meetings: MeetingRecord[],
  seriesCandidates: SeriesCandidate[],
  now = new Date(),
): OwnerPerformanceView {
  const nowMs = now.getTime();
  const recordedMeetings = meetings.filter((meeting) => isRecordedMeeting(meeting, nowMs));
  const rangeEntries = OWNER_PERFORMANCE_RANGE_OPTIONS.map((option) => {
    const rangeMeetings = meetingsInRange(meetings, option, now);
    const rangeRecordedMeetings = meetingsInRange(recordedMeetings, option, now);
    const evidenceMeetings = option.key === 'today'
      ? meetingsInRange(recordedMeetings, OWNER_PERFORMANCE_RANGE_OPTIONS[3], now)
      : rangeRecordedMeetings;
    const evidenceByExternalKey = new Map(evidenceMeetings.map((meeting) => [meeting.externalKey, meeting]));
    const requiredEvidenceKeys = option.key === 'today'
      ? new Set(rangeRecordedMeetings.map((meeting) => meeting.externalKey))
      : undefined;
    const insights = modelPerformanceInsights(
      seriesCandidates,
      evidenceByExternalKey,
      option.key,
      requiredEvidenceKeys,
    ).slice(0, 8);
    return [option.key, {
      ...option,
      meetings: rangeMeetings,
      recordedMeetings: rangeRecordedMeetings,
      insights,
    }] as const;
  });

  return { ranges: Object.fromEntries(rangeEntries) as OwnerPerformanceView['ranges'] };
}
