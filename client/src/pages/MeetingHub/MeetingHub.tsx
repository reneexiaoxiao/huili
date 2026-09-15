import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parse,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Bot,
  Check,
  CircleAlert,
  Copy,
  Download,
  EyeOff,
  Laptop,
  Link2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';

import {
  cancelMeetingAction,
  completeMeetingTodo,
  confirmMeetingAction,
  createCapture,
  createMeetingPreparation,
  createMeetingAiTask,
  deferMeetingAction,
  getIgnoredMeetings,
  getMeetingActionInbox,
  getMeetingHubOverview,
  getProjectCatalog,
  ignoreMeeting,
  ignoreMeetingActions,
  restoreMeeting,
  saveAndRedrawDailyBlank,
  updateDailyBlankFeedback,
  updateDailyBlankDisposition,
} from '@/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { AppShell } from '@/features/huili/AppShell';
import { ProjectsPage } from '@/features/huili/pages/ProjectsPage';
import { DeepPreparationDialog } from '@/features/huili/components/DeepPreparationDialog';
import { MeetingInspector } from '@/features/huili/components/MeetingInspector';
import { AgentConnectionDialog } from '@/features/huili/components/AgentConnectionDialog';
import { QuickCaptureDialog } from '@/features/huili/components/QuickCaptureDialog';
import { MemoryPage } from '@/features/huili/pages/MemoryPage';
import {
  CalendarPage,
  CalendarRail,
  ExplorePage,
  InsightsPage,
  NowPage,
  PeopleCollaborationPage,
  ProgressPage,
} from '@/features/huili/pages/WorkspacePages';
import { indexSeriesMembership } from '@/features/huili/series';
import {
  viewUsesMeetingSeries,
  type ActionFilter,
  type HuiliView,
} from '@/features/huili/types';
import { useMeetingSeries } from '@/features/huili/useMeetingSeries';
import type {
  DailyBlankFeedback,
  IgnoredMeetingSummary,
  MeetingAction,
  MeetingActionInbox,
  MeetingHubOverview,
  MeetingRecord,
  PairingCodeResponse,
} from '@shared/api.interface';
import '@/features/huili/tokens.css';
import './meeting-hub.css';
import type { ProjectCatalog } from '@shared/project.interface';

const EMPTY_OVERVIEW: MeetingHubOverview = {
  meetings: [],
  counts: {
    meetings: 0,
    awaitingConfirmation: 0,
    inProgress: 0,
    done: 0,
    upcoming: 0,
  },
  agent: { paired: false },
};

const EMPTY_ACTION_INBOX: MeetingActionInbox = {
  actions: [],
  counts: {
    myTodos: 0,
    awaitingConfirmation: 0,
    aiInProgress: 0,
    completed: 0,
  },
};
const VIEWS: HuiliView[] = [
  'now',
  'projects',
  'progress',
  'calendar',
  'explore',
  'insights',
  'people',
  'memory',
];
function viewFromLocation(pathname: string, search: string): HuiliView {
  const queryView = new URLSearchParams(search).get('view');
  if (VIEWS.includes(queryView as HuiliView)) return queryView as HuiliView;
  const pathView = pathname.split('/').filter(Boolean).at(-1);
  return VIEWS.includes(pathView as HuiliView)
    ? (pathView as HuiliView)
    : 'now';
}

function monthFromSearch(search: string): Date {
  const value = new URLSearchParams(search).get('month');
  if (!value) return startOfMonth(new Date());
  const parsed = parse(value, 'yyyy-MM', new Date());
  return isValid(parsed) ? startOfMonth(parsed) : startOfMonth(new Date());
}

function rangeForView(
  view: HuiliView,
  month: Date,
): { from: string; to: string } {
  const now = new Date();
  if (view === 'calendar')
    return {
      from: subDays(startOfMonth(month), 180).toISOString(),
      to: addDays(endOfMonth(month), 90).toISOString(),
    };
  if (view === 'progress')
    return {
      from: subDays(now, 365).toISOString(),
      to: addDays(now, 90).toISOString(),
    };
  return {
    from: subDays(now, 180).toISOString(),
    to: addDays(now, 90).toISOString(),
  };
}

function LoadingState() {
  return (
    <div className="loading-state page-workspace">
      <Skeleton className="h-10 w-52" />
      <Skeleton className="h-[540px] w-full" />
    </div>
  );
}

export default function MeetingHub() {
  const location = useLocation();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => monthFromSearch(location.search));
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [projectCatalog, setProjectCatalog] = useState<ProjectCatalog>();
  const [actionInbox, setActionInbox] = useState(EMPTY_ACTION_INBOX);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('awaiting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [confirmingAction, setConfirmingAction] = useState<MeetingAction>();
  const [alignmentText, setAlignmentText] = useState('');
  const [completingAction, setCompletingAction] = useState<MeetingAction>();
  const [cancellingAction, setCancellingAction] = useState<MeetingAction>();
  const [addingTaskMeeting, setAddingTaskMeeting] = useState<MeetingRecord>();
  const [meetingAiTaskText, setMeetingAiTaskText] = useState('');
  const [meetingAiTaskRequestId, setMeetingAiTaskRequestId] = useState(() =>
    crypto.randomUUID(),
  );
  const [ignoringMeetingActions, setIgnoringMeetingActions] =
    useState<MeetingRecord>();
  const [hidingMeeting, setHidingMeeting] = useState<MeetingRecord>();
  const [ignoredMeetings, setIgnoredMeetings] = useState<
    IgnoredMeetingSummary[]
  >([]);
  const [ignoredMeetingsOpen, setIgnoredMeetingsOpen] = useState(false);
  const [completionNote, setCompletionNote] = useState('');
  const [artifactLabel, setArtifactLabel] = useState('完成产物');
  const [artifactUrl, setArtifactUrl] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [preparingMeeting, setPreparingMeeting] = useState<MeetingRecord>();
  const [preparationInstruction, setPreparationInstruction] = useState('');
  const [exploreOpen, setExploreOpen] = useState(false);
  const [exploreText, setExploreText] = useState('');
  const [exploreRequestId, setExploreRequestId] = useState(() =>
    crypto.randomUUID(),
  );
  const [working, setWorking] = useState(false);
  const [agentConnectOpen, setAgentConnectOpen] = useState(false);
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const requestId = useRef(0);
  const pairingInvitationShown = useRef(false);

  const view = viewFromLocation(location.pathname, location.search);
  useEffect(() => {
    if (view !== 'calendar') return;
    let active = true;
    void getProjectCatalog().then(data => { if (active) setProjectCatalog(data); }).catch(() => { if (active) setProjectCatalog(undefined); });
    return () => { active = false; };
  }, [view]);
  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const selectedId =
    view === 'calendar'
      ? (searchParams.get('meetingId') ?? undefined)
      : undefined;
  const selectedSeriesId =
    view === 'explore'
      ? (searchParams.get('seriesId') ?? undefined)
      : undefined;
  useEffect(() => {
    if (view !== 'calendar') return;
    const urlMonth = monthFromSearch(location.search);
    if (urlMonth.getTime() !== month.getTime()) setMonth(urlMonth);
  }, [location.search, month, view]);

  const load = useCallback(
    async (silent: boolean = false): Promise<void> => {
      const currentRequest = silent ? requestId.current : ++requestId.current;
      if (!silent) {
        setLoading(true);
        setError(undefined);
      }
      try {
        const range = rangeForView(view, month);
        const [data, inbox, ignored] = await Promise.all([
          getMeetingHubOverview(range.from, range.to),
          getMeetingActionInbox(),
          getIgnoredMeetings(),
        ]);
        if (currentRequest !== requestId.current) return;
        setOverview(data);
        setActionInbox(inbox);
        setIgnoredMeetings(ignored.meetings);
        setOverviewLoaded(true);
      } catch {
        if (!silent && currentRequest === requestId.current)
          setError('会议与行动暂时没有加载出来，请稍后重试。');
      } finally {
        if (!silent && currentRequest === requestId.current) setLoading(false);
      }
    },
    [month, view],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const backgroundWorkActive: boolean = overview.meetings.some(
    (meeting: MeetingRecord) =>
      meeting.actions.some((action: MeetingAction) =>
        ['queued', 'claimed', 'executing'].includes(action.status),
      ),
  );

  useEffect(() => {
    if (!backgroundWorkActive) return;
    const timer: number = window.setInterval(() => void load(true), 4000);
    return () => window.clearInterval(timer);
  }, [backgroundWorkActive, load]);

  const selectedMeeting = overview.meetings.find(
    (meeting) => meeting.id === selectedId,
  );
  const updateCalendarUrl = useCallback(
    (nextMonth: Date, meetingId?: string, replace = false) => {
      const params = new URLSearchParams();
      params.set('view', 'calendar');
      params.set('month', format(nextMonth, 'yyyy-MM'));
      if (meetingId) params.set('meetingId', meetingId);
      navigate(
        { pathname: location.pathname, search: `?${params.toString()}` },
        { replace },
      );
    },
    [location.pathname, navigate],
  );

  useEffect(() => {
    if (!loading && selectedId && !selectedMeeting)
      updateCalendarUrl(month, undefined, true);
  }, [loading, month, selectedId, selectedMeeting, updateCalendarUrl]);

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') updateCalendarUrl(month, undefined, true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [month, selectedId, updateCalendarUrl]);

  const navigateView = (nextView: HuiliView) => {
    if (nextView === 'calendar') updateCalendarUrl(month);
    else
      navigate({
        pathname: location.pathname,
        search: nextView === 'now' ? '' : `?view=${nextView}`,
      });
  };
  const openSeries = (seriesId: string, replace = false) => {
    const params = new URLSearchParams();
    params.set('view', 'explore');
    params.set('seriesId', seriesId);
    navigate(
      { pathname: location.pathname, search: `?${params.toString()}` },
      { replace },
    );
  };
  const selectMeeting = (meetingId: string) =>
    meetingId === selectedId
      ? updateCalendarUrl(month, undefined, true)
      : updateCalendarUrl(month, meetingId);
  const openMeetingFromAnyView = (meetingId: string) => {
    const record = overview.meetings.find((item) => item.id === meetingId);
    const inboxItem = actionInbox.actions.find(
      (item) => item.meetingId === meetingId,
    );
    const nextMonth = startOfMonth(
      new Date(record?.startedAt ?? inboxItem?.meetingStartedAt ?? month),
    );
    setMonth(nextMonth);
    updateCalendarUrl(nextMonth, meetingId);
  };
  const changeMonth = (nextMonth: Date) => {
    setMonth(nextMonth);
    updateCalendarUrl(nextMonth, undefined, true);
  };

  const days = useMemo(() => {
    const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const last = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const result: Date[] = [];
    for (let day = first; day <= last; day = addDays(day, 1)) result.push(day);
    return result;
  }, [month]);

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, MeetingHubOverview['meetings']>();
    for (const meeting of overview.meetings) {
      const key = format(new Date(meeting.startedAt), 'yyyy-MM-dd');
      map.set(key, [...(map.get(key) ?? []), meeting]);
    }
    return map;
  }, [overview.meetings]);
  const visibleDayKeys = useMemo(
    () => new Set(days.map((day) => format(day, 'yyyy-MM-dd'))),
    [days],
  );
  const visibleCalendarMeetings = useMemo(
    () =>
      overview.meetings.filter((meeting) =>
        visibleDayKeys.has(format(new Date(meeting.startedAt), 'yyyy-MM-dd')),
      ),
    [overview.meetings, visibleDayKeys],
  );
  const {
    candidates: seriesCandidates,
    loading: seriesLoading,
    error: seriesError,
    dailyBlank,
    dailyBlankDrawer,
    dailyBlankDrawRequest,
    replaceDailyBlank,
    beginDailyBlankDraw,
    refresh: refreshDailyBlank,
  } = useMeetingSeries(overview.meetings, viewUsesMeetingSeries(view));
  const seriesByMeeting = useMemo(
    () => indexSeriesMembership(seriesCandidates),
    [seriesCandidates],
  );

  const confirmAction = async () => {
    if (!confirmingAction) return;
    setWorking(true);
    try {
      await confirmMeetingAction(confirmingAction.actionId, {
        instruction: alignmentText.trim() || undefined,
      });
      setConfirmingAction(undefined);
      setAlignmentText('');
      await load();
    } catch {
      setError('这项行动没有开始，请确认电脑上的自动推进服务在线后重试。');
    } finally {
      setWorking(false);
    }
  };

  const deferAction = async (action: MeetingAction) => {
    setWorking(true);
    try {
      await deferMeetingAction(action.actionId);
      await load();
    } catch {
      setError('暂缓状态没有保存成功，请重试。');
    } finally {
      setWorking(false);
    }
  };

  const cancelAction = async () => {
    if (!cancellingAction) return;
    setWorking(true);
    try {
      await cancelMeetingAction(cancellingAction.actionId);
      setCancellingAction(undefined);
      await load();
    } catch {
      setError('“不用做了”没有保存成功，请重试。');
    } finally {
      setWorking(false);
    }
  };

  const addMeetingAiTask = async () => {
    if (!addingTaskMeeting || !meetingAiTaskText.trim()) return;
    setWorking(true);
    try {
      await createMeetingAiTask(addingTaskMeeting.id, {
        clientRequestId: meetingAiTaskRequestId,
        instruction: meetingAiTaskText.trim(),
      });
      setAddingTaskMeeting(undefined);
      setMeetingAiTaskText('');
      setMeetingAiTaskRequestId(crypto.randomUUID());
      await load();
    } catch {
      setError('这项任务没有交给 AI，请确认本机连接后重试。');
    } finally {
      setWorking(false);
    }
  };

  const completeTodo = async () => {
    if (!completingAction) return;
    const cleanUrl = artifactUrl.trim();
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      setError('产物链接需要以 http:// 或 https:// 开头。');
      return;
    }
    setWorking(true);
    try {
      await completeMeetingTodo(completingAction.actionId, {
        evidenceSummary: completionNote.trim() || undefined,
        resultLinks: cleanUrl
          ? [{ label: artifactLabel.trim() || '完成产物', url: cleanUrl }]
          : [],
      });
      setCompletingAction(undefined);
      setCompletionNote('');
      setArtifactLabel('完成产物');
      setArtifactUrl('');
      await load();
    } catch {
      setError('待办完成状态没有保存成功，请重试。');
    } finally {
      setWorking(false);
    }
  };

  const ignoreSelectedMeetingActions = async () => {
    if (!ignoringMeetingActions) return;
    setWorking(true);
    try {
      await ignoreMeetingActions(ignoringMeetingActions.id);
      setIgnoringMeetingActions(undefined);
      await load();
    } catch {
      setError('这场会议的待办没有忽略成功，请重试。');
    } finally {
      setWorking(false);
    }
  };

  const ignoreSelectedMeeting = async () => {
    if (!hidingMeeting) return;
    setWorking(true);
    try {
      await ignoreMeeting(hidingMeeting.id);
      setHidingMeeting(undefined);
      updateCalendarUrl(month, undefined, true);
      await load();
    } catch {
      setError('这场会议没有忽略成功，请重试。');
    } finally {
      setWorking(false);
    }
  };

  const restoreIgnoredMeeting = async (meetingId: string) => {
    setWorking(true);
    try {
      await restoreMeeting(meetingId);
      await load();
    } catch {
      setError('这场会议没有恢复成功，请重试。');
    } finally {
      setWorking(false);
    }
  };

  const openTodoDialog = (action: MeetingAction) => {
    setCompletingAction(action);
    setCompletionNote(action.evidenceSummary ?? '');
    setArtifactLabel(action.resultLinks[0]?.label ?? '完成产物');
    setArtifactUrl(action.resultLinks[0]?.url ?? '');
  };
  const openConfirmDialog = (action: MeetingAction) => {
    setAlignmentText('');
    setConfirmingAction(action);
  };

  const openMeetingAiTaskDialog = (meeting: MeetingRecord) => {
    setMeetingAiTaskText('');
    setMeetingAiTaskRequestId(crypto.randomUUID());
    setAddingTaskMeeting(meeting);
  };

  const openCaptureDialog = () => {
    setCaptureOpen(true);
  };

  const startQuickPreparation = async (meeting: MeetingRecord) => {
    setWorking(true);
    try {
      await createMeetingPreparation(meeting.id, {
        force: true,
        mode: 'quick',
        output: 'brief',
      });
      await load();
    } catch {
      setError('会前准备没有开始，请重试。');
    } finally {
      setWorking(false);
    }
  };

  const openDeepPreparation = (meeting: MeetingRecord) => {
    setPreparationInstruction('');
    setPreparingMeeting(meeting);
  };

  const startDeepPreparation = async () => {
    if (!preparingMeeting) return;
    setWorking(true);
    try {
      await createMeetingPreparation(preparingMeeting.id, {
        force: true,
        mode: 'deep',
        output: 'lark_document',
        ...(preparationInstruction.trim()
          ? { instruction: preparationInstruction.trim() }
          : {}),
      });
      setPreparingMeeting(undefined);
      setPreparationInstruction('');
      await load();
    } catch {
      setError('深度会前准备没有开始，请重试。');
    } finally {
      setWorking(false);
    }
  };

  const openExploreDialog = () => {
    setExploreText('');
    setExploreRequestId(crypto.randomUUID());
    setExploreOpen(true);
  };

  const openExploreWithPrompt = (prompt: string) => {
    setExploreText(prompt);
    setExploreRequestId(crypto.randomUUID());
    setExploreOpen(true);
  };

  const saveDailyBlankFeedback = async (feedback: DailyBlankFeedback) => {
    if (!dailyBlank) return;
    const response = await updateDailyBlankFeedback(dailyBlank.id, feedback);
    replaceDailyBlank(response.dailyBlank);
  };

  const changeDailyBlankDisposition = async (
    blankId: string,
    action: Parameters<typeof updateDailyBlankDisposition>[1],
  ) => {
    const response = await updateDailyBlankDisposition(blankId, action);
    if (response.drawRequest?.state === 'pending') {
      beginDailyBlankDraw(response.drawer, response.drawRequest);
    } else {
      replaceDailyBlank(response.dailyBlank, response.drawer);
    }
  };

  const saveAndDrawAnotherDailyBlank = async (blankId: string, tags: string[]) => {
    const response = await saveAndRedrawDailyBlank(blankId, tags);
    beginDailyBlankDraw(response.drawer, response.drawRequest);
  };

  const openSetup = () => setAgentConnectOpen(true);

  const startExplore = async () => {
    if (!exploreText.trim()) return;
    setWorking(true);
    try {
      await createCapture({
        clientRequestId: exploreRequestId,
        mode: 'agent',
        text: `漫游：${exploreText.trim()}\n\n请从候选历史会议中自行判断相关性，只基于可核对证据呈现关系、推进、分歧或阻塞；证据不足就明确保留不确定。`,
      });
      setExploreOpen(false);
      setExploreText('');
      await load();
    } catch {
      setError('这次漫游还没有开始，请重试。');
    } finally {
      setWorking(false);
    }
  };

  const progressCount =
    actionInbox.counts.myTodos +
    actionInbox.counts.awaitingConfirmation +
    actionInbox.counts.aiInProgress;
  const handlers = {
    onConfirm: openConfirmDialog,
    onDefer: (action: MeetingAction) => void deferAction(action),
    onCancel: setCancellingAction,
    onComplete: openTodoDialog,
  };
  const page = loading ? (
    <LoadingState />
  ) : view === 'now' ? (
    <NowPage
      meetings={overview.meetings}
      inbox={actionInbox}
      agent={overview.agent}
      dailyBlank={dailyBlank}
      dailyBlankDrawer={dailyBlankDrawer}
      dailyBlankDrawRequest={dailyBlankDrawRequest}
      onOpenMeeting={openMeetingFromAnyView}
      onOpenProgress={() => {
        setActionFilter('awaiting');
        navigateView('progress');
      }}
      onConnectAgent={openSetup}
      onContinueDailyBlank={openExploreWithPrompt}
      onDailyBlankFeedback={saveDailyBlankFeedback}
      onSaveAndRedrawDailyBlank={saveAndDrawAnotherDailyBlank}
      onDailyBlankDisposition={changeDailyBlankDisposition}
      onRefreshDailyBlank={refreshDailyBlank}
    />
  ) : view === 'progress' ? (
    <ProgressPage
      inbox={actionInbox}
      filter={actionFilter}
      onFilterChange={setActionFilter}
      onOpenMeeting={openMeetingFromAnyView}
      {...handlers}
    />
  ) : view === 'projects' ? (
    <ProjectsPage
      selectedId={searchParams.get('projectId') ?? undefined}
      onOpenCalendar={() => navigateView('calendar')}
      onSelect={(id) => {
        const params = new URLSearchParams({ view: 'projects' });
        if (id) params.set('projectId', id);
        navigate({ pathname: location.pathname, search: `?${params.toString()}` });
      }}
      onOpenMeeting={openMeetingFromAnyView}
    />
  ) : view === 'explore' ? (
    <ExplorePage
      inbox={actionInbox}
      seriesCandidates={seriesCandidates}
      seriesLoading={seriesLoading}
      seriesError={seriesError}
      selectedSeriesId={selectedSeriesId}
      onSelectSeries={(seriesId) => openSeries(seriesId, true)}
      onOpenMeeting={openMeetingFromAnyView}
      onStartExplore={openExploreDialog}
      onOpenCalendar={() => navigateView('calendar')}
      onOpenPeople={() => navigateView('people')}
    />
  ) : view === 'insights' ? (
    <InsightsPage
      meetings={overview.meetings}
      seriesCandidates={seriesCandidates}
      seriesLoading={seriesLoading}
      seriesError={seriesError}
      onOpenMeeting={openMeetingFromAnyView}
      onOpenPeople={() => navigateView('people')}
      onOpenCalendar={() => navigateView('calendar')}
    />
  ) : view === 'people' ? (
    <PeopleCollaborationPage
      meetings={overview.meetings}
      inbox={actionInbox}
      seriesCandidates={seriesCandidates}
      onOpenMeeting={openMeetingFromAnyView}
      onBack={() => navigateView('insights')}
    />
  ) : view === 'memory' ? (
    <MemoryPage
      meetings={overview.meetings}
      seriesCandidates={seriesCandidates}
      seriesLoading={seriesLoading}
      seriesError={seriesError}
      onOpenMeeting={openMeetingFromAnyView}
      onOpenSeries={openSeries}
      onExplore={openExploreWithPrompt}
      onOpenCalendar={() => navigateView('calendar')}
    />
  ) : (
    <main
      className={`hub-workspace calendar-view ${selectedMeeting ? 'has-inspector' : 'no-inspector'}`}
    >
      <section className="calendar-workspace">
        <header className="calendar-toolbar">
          <div>
            <p className="kicker">我的日历</p>
            <h1>{format(month, 'yyyy 年 M 月')}</h1>
          </div>
          <div className="calendar-tools">
            {ignoredMeetings.length > 0 && (
              <Button
                className="ignored-meetings-trigger"
                variant="ghost"
                size="sm"
                onClick={() => setIgnoredMeetingsOpen(true)}
              >
                <EyeOff aria-hidden="true" />
                已忽略 {ignoredMeetings.length}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => changeMonth(startOfMonth(new Date()))}
            >
              今天
            </Button>
            <div className="month-switcher">
              <Button
                variant="outline"
                size="icon"
                aria-label="上一个月"
                onClick={() => changeMonth(subMonths(month, 1))}
              >
                <ArrowLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="下一个月"
                onClick={() => changeMonth(addMonths(month, 1))}
              >
                <ArrowRight />
              </Button>
            </div>
          </div>
        </header>
        <CalendarPage
          monthLabel={format(month, 'yyyy 年 M 月')}
          days={days}
          meetingsByDay={meetingsByDay}
          meetings={visibleCalendarMeetings}
          seriesByMeeting={seriesByMeeting}
          selectedId={selectedId}
          onSelect={selectMeeting}
          onOpenSeries={openSeries}
        />
      </section>
      {selectedMeeting ? (
        <MeetingInspector
          meeting={selectedMeeting}
          projectLinks={(projectCatalog?.projects || []).filter(p => p.meetings.some(m => m.id === selectedMeeting.id)).map(p => ({ id: p.id, name: p.name }))}
          onOpenProject={(id) => navigate({ pathname: location.pathname, search: `?view=projects&projectId=${encodeURIComponent(id)}` })}
          series={seriesByMeeting.get(selectedMeeting.id)}
          onOpenSeries={openSeries}
          onClose={() => updateCalendarUrl(month, undefined, true)}
          onPrepareQuick={(meeting) => void startQuickPreparation(meeting)}
          onPrepareDeep={openDeepPreparation}
          onIgnoreActions={setIgnoringMeetingActions}
          onIgnoreMeeting={setHidingMeeting}
          onAddAiTask={openMeetingAiTaskDialog}
          {...handlers}
        />
      ) : (
        <CalendarRail meetings={overview.meetings} onSelect={selectMeeting} />
      )}
      {selectedMeeting && (
        <button
          className="mobile-inspector-backdrop"
          aria-label="收起会议详情"
          type="button"
          onClick={() => updateCalendarUrl(month, undefined, true)}
        />
      )}
    </main>
  );

  return (
    <AppShell
      view={view}
      progressCount={progressCount}
      onNavigate={navigateView}
      onCapture={openCaptureDialog}
    >
      {error && (
        <Alert variant="warning" className="hub-alert">
          <CircleAlert />
          <AlertTitle>暂时没完成</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw />
            重试
          </Button>
        </Alert>
      )}
      {page}

      <DeepPreparationDialog
        meeting={preparingMeeting}
        instruction={preparationInstruction}
        working={working}
        onInstructionChange={setPreparationInstruction}
        onOpenChange={(open) => {
          if (!open) {
            setPreparingMeeting(undefined);
            setPreparationInstruction('');
          }
        }}
        onSubmit={() => void startDeepPreparation()}
      />
      <QuickCaptureDialog key={window.userId || 'current-session'} open={captureOpen}
        onOpenChange={setCaptureOpen} onSaved={mode => {
          if (mode === 'agent') { setActionFilter('executing'); navigateView('progress'); }
          void load(true);
        }} />
      <AgentConnectionDialog open={agentConnectOpen} onOpenChange={setAgentConnectOpen} />

      <Dialog
        open={Boolean(cancellingAction)}
        onOpenChange={(open) => {
          if (!open) setCancellingAction(undefined);
        }}
      >
        <DialogContent className="confirm-dialog cancel-action-dialog">
          <DialogHeader>
            <p className="kicker">调整任务</p>
            <DialogTitle>确定不用做了？</DialogTitle>
            <DialogDescription>
              这项不会再出现在推进页，原会议记录仍会保留。
            </DialogDescription>
          </DialogHeader>
          <div className="alignment-action">
            <span>本次取消</span>
            <strong>{cancellingAction?.title}</strong>
          </div>
          <div className="scope-note">
            <Ban aria-hidden="true" />
            <p>
              <strong>用于校准后续识别</strong>
              <br />
              会里会记住这次选择，只用于你的个人任务判断。
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancellingAction(undefined)}
            >
              返回
            </Button>
            <Button
              variant="destructive"
              disabled={working}
              onClick={() => void cancelAction()}
            >
              {working ? '正在保存' : '不用做了'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(addingTaskMeeting)}
        onOpenChange={(open) => {
          if (!open) {
            setAddingTaskMeeting(undefined);
            setMeetingAiTaskText('');
          }
        }}
      >
        <DialogContent className="confirm-dialog meeting-ai-task-dialog">
          <DialogHeader>
            <p className="kicker">补充本场任务</p>
            <DialogTitle>额外交给 AI</DialogTitle>
            <DialogDescription>
              说明要形成的结果、可用背景和不能越过的边界。
            </DialogDescription>
          </DialogHeader>
          <div className="alignment-action">
            <span>关联会议</span>
            <strong>{addingTaskMeeting?.title}</strong>
          </div>
          <label className="alignment-field">
            <span>要交给 AI 的任务</span>
            <Textarea
              autoFocus
              value={meetingAiTaskText}
              onChange={(event) => setMeetingAiTaskText(event.target.value)}
              placeholder="例如：把这场会涉及的三个方案整理成一页对比，先标出信息缺口，不联系参会人。"
            />
          </label>
          <div className="scope-note">
            <Bot aria-hidden="true" />
            <p>
              <strong>会与这场会议一起保留</strong>
              <br />
              电脑离线时先排队；涉及发送、发布或修改外部内容时仍会等你确认。
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddingTaskMeeting(undefined);
                setMeetingAiTaskText('');
              }}
            >
              取消
            </Button>
            <Button
              disabled={working || !meetingAiTaskText.trim()}
              onClick={() => void addMeetingAiTask()}
            >
              <Sparkles />
              {working ? '正在提交' : '交给 AI 推进'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(confirmingAction)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmingAction(undefined);
            setAlignmentText('');
          }
        }}
      >
        <DialogContent className="confirm-dialog">
          <DialogHeader>
            <p className="kicker">开始前对齐</p>
            <DialogTitle>先把这件事说清楚</DialogTitle>
            <DialogDescription>
              补充你想要的结果、可用背景和边界；这些内容会随事项一起交给 Agent。
            </DialogDescription>
          </DialogHeader>
          <div className="alignment-action">
            <span>本次推进</span>
            <strong>{confirmingAction?.title}</strong>
            {confirmingAction?.deliverable && (
              <small>交付：{confirmingAction.deliverable}</small>
            )}
          </div>
          <label className="alignment-field">
            <span>补充给 Agent（可选）</span>
            <Textarea
              autoFocus
              value={alignmentText}
              onChange={(event) => setAlignmentText(event.target.value)}
              placeholder="例如：先给我一版可评审的框架；不要联系任何人，也不要修改线上文档。缺信息时先列出来等我确认。"
            />
          </label>
          <div className="scope-note">
            <Bot aria-hidden="true" />
            <p>
              <strong>由这台电脑执行</strong>
              <br />
              电脑离线时先保留，重新在线后继续；涉及额外外部操作时会停下来等你确认。
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmingAction(undefined);
                setAlignmentText('');
              }}
            >
              取消
            </Button>
            <Button disabled={working} onClick={() => void confirmAction()}>
              <Check />
              {working ? '正在提交' : '对齐并开始'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={exploreOpen} onOpenChange={setExploreOpen}>
        <DialogContent className="confirm-dialog explore-dialog">
          <DialogHeader>
            <p className="kicker">开始一次漫游</p>
            <DialogTitle>这次想探索什么？</DialogTitle>
            <DialogDescription>
              可以找系列推进、反复出现的分歧、授权机会或某个人的沟通模式。结果只在证据足够时出现。
            </DialogDescription>
          </DialogHeader>
          <label className="alignment-field">
            <span>探索方向</span>
            <Textarea
              autoFocus
              value={exploreText}
              onChange={(event) => setExploreText(event.target.value)}
              placeholder="例如：找出加盟商相关会议的连续决策过程，目前推进到哪里，还有哪些问题反复没有解决。"
            />
          </label>
          <div className="scope-note">
            <Sparkles aria-hidden="true" />
            <p>
              <strong>从现有记录出发</strong>
              <br />
              Agent
              会阅读候选历史会议并自行判断关系；本次不会自动合并会议或改写日历。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExploreOpen(false)}>
              取消
            </Button>
            <Button
              disabled={working || !exploreText.trim()}
              onClick={() => void startExplore()}
            >
              <Sparkles />
              {working ? '正在提交' : '开始漫游'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(completingAction)}
        onOpenChange={(open) => !open && setCompletingAction(undefined)}
      >
        <DialogContent className="complete-dialog">
          <DialogHeader>
            <p className="kicker">完成你的待办</p>
            <DialogTitle>{completingAction?.title}</DialogTitle>
            <DialogDescription>
              有可访问的产物就贴上链接；沟通、确认等无链接事项也可以直接完成。
            </DialogDescription>
          </DialogHeader>
          <div className="complete-fields">
            <label>
              <span>完成说明（可选）</span>
              <Textarea
                value={completionNote}
                onChange={(event) => setCompletionNote(event.target.value)}
                placeholder="例如：已和合作方确认最终预算口径"
              />
            </label>
            <div className="artifact-fields">
              <label>
                <span>产物名称</span>
                <Input
                  value={artifactLabel}
                  onChange={(event) => setArtifactLabel(event.target.value)}
                />
              </label>
              <label>
                <span>产物链接（可选）</span>
                <Input
                  value={artifactUrl}
                  onChange={(event) => setArtifactUrl(event.target.value)}
                  placeholder="https://"
                />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCompletingAction(undefined)}
            >
              取消
            </Button>
            <Button disabled={working} onClick={() => void completeTodo()}>
              <Check />
              {working ? '正在保存' : '标记完成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(ignoringMeetingActions)}
        onOpenChange={(open) => !open && setIgnoringMeetingActions(undefined)}
      >
        <DialogContent className="confirm-dialog">
          <DialogHeader>
            <p className="kicker">批量处理</p>
            <DialogTitle>忽略这场会议的待办？</DialogTitle>
            <DialogDescription>
              尚未开始、待确认和失败的事项会从推进页移除；已完成或正在执行的事项不受影响，会议记录仍会保留。
            </DialogDescription>
          </DialogHeader>
          <div className="alignment-action">
            <span>本场会议</span>
            <strong>{ignoringMeetingActions?.title}</strong>
            <small>
              {ignoringMeetingActions?.actions.filter(
                (action) =>
                  !action.actionId.startsWith('prep:auto:') &&
                  ['planned', 'awaiting_confirmation', 'failed'].includes(
                    action.status,
                  ),
              ).length ?? 0}{' '}
              项待办将被忽略
            </small>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIgnoringMeetingActions(undefined)}
            >
              取消
            </Button>
            <Button
              disabled={working}
              onClick={() => void ignoreSelectedMeetingActions()}
            >
              {working ? '正在处理' : '确认忽略'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(hidingMeeting)}
        onOpenChange={(open) => !open && setHidingMeeting(undefined)}
      >
        <DialogContent className="confirm-dialog">
          <DialogHeader>
            <p className="kicker">会议管理</p>
            <DialogTitle>从会里忽略这场会议？</DialogTitle>
            <DialogDescription>
              它会从日历、推进、漫游、洞察和记忆中隐藏；飞书里的原始会议和妙记不会被删除。
            </DialogDescription>
          </DialogHeader>
          <div className="alignment-action">
            <span>将忽略</span>
            <strong>{hidingMeeting?.title}</strong>
            <small>之后可从“已忽略会议”恢复。</small>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHidingMeeting(undefined)}
            >
              取消
            </Button>
            <Button
              disabled={working}
              onClick={() => void ignoreSelectedMeeting()}
            >
              <EyeOff aria-hidden="true" />
              {working ? '正在忽略' : '忽略会议'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={ignoredMeetingsOpen} onOpenChange={setIgnoredMeetingsOpen}>
        <DialogContent className="ignored-meetings-dialog">
          <DialogHeader>
            <p className="kicker">会议管理</p>
            <DialogTitle>已忽略会议</DialogTitle>
            <DialogDescription>
              这些会议不会出现在推进、漫游、洞察和记忆中；恢复后会重新出现。
            </DialogDescription>
          </DialogHeader>
          {ignoredMeetings.length > 0 ? (
            <div className="ignored-meetings-list">
              {ignoredMeetings.map((meeting) => (
                <div key={meeting.id}>
                  <span>
                    <time>
                      {format(
                        new Date(meeting.startedAt),
                        'yyyy 年 M 月 d 日 HH:mm',
                      )}
                    </time>
                    <strong>{meeting.title}</strong>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={working}
                    onClick={() => void restoreIgnoredMeeting(meeting.id)}
                  >
                    <RotateCcw aria-hidden="true" />
                    恢复
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="ignored-meetings-empty">目前没有已忽略的会议。</p>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
