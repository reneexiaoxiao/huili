import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logger } from '@/lib/logger';

import { getMeetingSeries } from '@/api';
import type {
  DailyBlankDrawRequest,
  DailyBlankSnapshot,
  MeetingRecord,
  MeetingSeriesCandidateSnapshot,
  MeetingSeriesSyncStatus,
} from '@shared/api.interface';
import type { SeriesCandidate } from './series';

interface MeetingSeriesState {
  candidates: SeriesCandidate[];
  loading: boolean;
  error?: string;
  syncStatus: MeetingSeriesSyncStatus;
  refresh: () => void;
  lastSuccessfulAt?: string;
  dailyBlank?: DailyBlankSnapshot;
  dailyBlankDrawer: DailyBlankSnapshot[];
  dailyBlankDrawRequest?: DailyBlankDrawRequest;
  replaceDailyBlank: (dailyBlank: DailyBlankSnapshot, drawer?: DailyBlankSnapshot[]) => void;
  beginDailyBlankDraw: (
    drawer: DailyBlankSnapshot[],
    drawRequest: DailyBlankDrawRequest,
  ) => void;
}

const SERIES_REFRESH_INTERVAL_MS = 60_000;

function hydrateCandidate(
  snapshot: MeetingSeriesCandidateSnapshot,
  meetingByExternalKey: ReadonlyMap<string, MeetingRecord>,
): SeriesCandidate | undefined {
  const meetings = snapshot.meetingExternalKeys
    .map((externalKey) => meetingByExternalKey.get(externalKey))
    .filter((meeting): meeting is MeetingRecord => Boolean(meeting))
    .sort((left, right) => +new Date(left.startedAt) - +new Date(right.startedAt));
  if (meetings.length < 2) return undefined;
  return {
    id: snapshot.id,
    label: snapshot.label,
    themeCluster: snapshot.themeCluster,
    meetings,
    strength: snapshot.strength,
    confidence: snapshot.confidence,
    matchReasons: snapshot.matchReasons,
    conflictSignals: snapshot.conflictSignals,
    currentProgress: snapshot.currentProgress,
    nextConclusion: snapshot.nextConclusion,
    matterInsight: snapshot.matterInsight,
    peopleInsight: snapshot.peopleInsight,
    ownerInsights: snapshot.ownerInsights,
  };
}

export function useMeetingSeries(
  meetings: MeetingRecord[],
  enabled = true,
): MeetingSeriesState {
  const refreshHint = useMemo(
    () => meetings
      .map((meeting) => `${meeting.externalKey}:${meeting.status}:${meeting.actions.length}`)
      .sort()
      .join('|'),
    [meetings],
  );
  const retainedCandidates = useRef<SeriesCandidate[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refreshNow = useCallback(() => setRefreshNonce((value) => value + 1), []);
  const [state, setState] = useState<MeetingSeriesState>({
    candidates: [],
    loading: false,
    syncStatus: 'not_started',
    refresh: refreshNow,
    dailyBlankDrawer: [],
    replaceDailyBlank: () => undefined,
    beginDailyBlankDraw: () => undefined,
  });
  const replaceDailyBlank = useCallback((dailyBlank: DailyBlankSnapshot, drawer?: DailyBlankSnapshot[]) => {
    setState((current) => ({ ...current, dailyBlank, ...(drawer ? { dailyBlankDrawer: drawer } : {}) }));
  }, []);
  const beginDailyBlankDraw = useCallback((
    dailyBlankDrawer: DailyBlankSnapshot[],
    dailyBlankDrawRequest: DailyBlankDrawRequest,
  ) => {
    setState((current) => ({
      ...current,
      dailyBlank: undefined,
      dailyBlankDrawer,
      dailyBlankDrawRequest,
    }));
  }, []);
  const drawPending = state.dailyBlankDrawRequest?.state === 'pending';

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const refresh = async (showLoading: boolean): Promise<void> => {
      if (showLoading && retainedCandidates.current.length === 0) {
        setState((current) => ({ ...current, loading: true, error: undefined }));
      }
      try {
        const response = await getMeetingSeries();
        if (cancelled) return;
        const meetingByExternalKey = new Map(
          response.meetings.map((meeting) => [meeting.externalKey, meeting]),
        );
        const nextCandidates = response.snapshot.candidates
          .map((candidate) => hydrateCandidate(candidate, meetingByExternalKey))
          .filter((candidate): candidate is SeriesCandidate => Boolean(candidate));
        if (nextCandidates.length > 0) retainedCandidates.current = nextCandidates;
        setState({
          candidates: nextCandidates.length > 0
            ? nextCandidates
            : retainedCandidates.current,
          loading: false,
          syncStatus: response.snapshot.status,
          refresh: refreshNow,
          lastSuccessfulAt: response.snapshot.lastSuccessfulAt,
          dailyBlank: response.snapshot.dailyBlank,
          dailyBlankDrawer: response.snapshot.dailyBlankDrawer,
          dailyBlankDrawRequest: response.snapshot.dailyBlankDrawRequest,
          replaceDailyBlank,
          beginDailyBlankDraw,
          ...(response.snapshot.status === 'degraded'
            ? { error: '会议脉络更新稍有延迟，当前仍展示上一版。' }
            : {}),
        });
      } catch (error) {
        if (cancelled) return;
        logger.error('加载持久化会议脉络失败', error);
        setState((current) => ({
          ...current,
          candidates: retainedCandidates.current,
          loading: false,
          error: retainedCandidates.current.length > 0
            ? '会议脉络更新稍有延迟，当前仍展示上一版。'
            : '会议脉络暂时没有加载出来，请稍后重试。',
        }));
      }
    };

    void refresh(true);
    const interval = window.setInterval(
      () => { void refresh(false); },
      drawPending ? 3_000 : SERIES_REFRESH_INTERVAL_MS,
    );
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [beginDailyBlankDraw, drawPending, enabled, refreshHint, refreshNonce, refreshNow, replaceDailyBlank]);

  return { ...state, replaceDailyBlank, beginDailyBlankDraw, refresh: refreshNow };
}
