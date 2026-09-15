import { useEffect, useMemo, useState } from 'react';
import { format, isSameDay, isSameMonth, subDays } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ArrowLeft, ArrowRight, Brain, CalendarDays, ChevronDown, CircleAlert, Compass, FileText, GitBranch, Laptop, Layers3, Link2, ListChecks, MessageCircleMore, Network, NotebookPen, RefreshCw, Search, SlidersHorizontal, Sparkles, UserRoundCheck, UsersRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Image } from '@/components/ui/image';
import type {
  DailyBlankDisposition,
  DailyBlankDrawRequest,
  DailyBlankFeedback,
  DailyBlankSnapshot,
  MeetingActionInbox,
  MeetingHubOverview,
  MeetingRecord,
} from '@shared/api.interface';
import { prioritizeNowActions, rankActions, type InboxAction, type RankedAction } from '../action-priority';
import { CALENDAR_VISIBLE_EVENT_LIMIT, calendarEventsForDay, hiddenCalendarEventCount } from '../calendar';
import { ActionItem, formatMeetingTime, statusTone } from '../components/MeetingInspector';
import { DailyBlank } from '../components/DailyBlank';
import { buildOwnerPerformanceView, OWNER_PERFORMANCE_RANGE_OPTIONS, type OwnerPerformanceDimension, type OwnerPerformanceInsight, type OwnerPerformanceRangeKey } from '../owner-performance';
import { buildSeriesInsights, buildSeriesPath, buildSeriesThemeClusters, titleSignals, type SeriesCandidate, type SeriesMembership } from '../series';
import type { ActionFilter, MeetingActionHandlers } from '../types';

const FILTERS: Array<{ key: ActionFilter; label: string }> = [
  { key: 'awaiting', label: 'AI 可推进' },
  { key: 'my_todos', label: '需要本人' },
  { key: 'executing', label: 'AI 推进中' },
  { key: 'completed', label: '已完成' },
];

const PROGRESS_COPY: Record<ActionFilter, { sort: string; kicker: string; focus: string; next: string; later: string }> = {
  awaiting: {
    sort: '优先显示能形成明确产物、只差你确认范围的事项',
    kicker: '可以交给 AI',
    focus: '先让 AI 做',
    next: '继续交给 AI',
    later: '更多可推进事项',
  },
  my_todos: {
    sort: '只保留需要你判断、承诺资源或处理关键协作的事项',
    kicker: '需要本人',
    focus: '需要你判断',
    next: '接着判断',
    later: '稍后处理',
  },
  executing: {
    sort: '查看已经交给本机 Agent 的行动、进度和产物',
    kicker: '本机推进',
    focus: '正在推进',
    next: '等待执行',
    later: '其他推进事项',
  },
  completed: {
    sort: '查看已经完成的行动与可回溯产物',
    kicker: '最近产物',
    focus: '最近完成',
    next: '更早完成',
    later: '更早完成',
  },
};

const WORK_THREAD_URL = '';
const ORGANIC_VISUAL_URL = '';

type FeedbackTone = 'balanced' | 'coach' | 'supportive' | 'advisory';

const FEEDBACK_TONES: Array<{ key: FeedbackTone; label: string; adviceLabel: string }> = [
  { key: 'balanced', label: '综合型', adviceLabel: '下一步' },
  { key: 'coach', label: '严厉教练型', adviceLabel: '直接指出' },
  { key: 'supportive', label: '支持型', adviceLabel: '保留优势' },
  { key: 'advisory', label: '建议型', adviceLabel: '先试一步' },
];

const OWNER_INSIGHT_META = {
  communication: { label: '沟通习惯', icon: MessageCircleMore },
  work_style: { label: '工作方式', icon: Layers3 },
  upward: { label: '向上协作', icon: GitBranch },
  downward: { label: '向下协作', icon: UserRoundCheck },
} as const;

const PERFORMANCE_INSIGHT_META: Record<OwnerPerformanceDimension, { label: string; icon: typeof Brain }> = {
  communication: { label: '表达与追问', icon: MessageCircleMore },
  work_style: { label: '判断与收敛', icon: Layers3 },
  upward: { label: '向上对齐', icon: GitBranch },
  downward: { label: '引导与授权', icon: UserRoundCheck },
};

function useFeedbackTonePreference(): [FeedbackTone, (tone: FeedbackTone) => void] {
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>(() => {
    if (typeof window === 'undefined') return 'balanced';
    const stored = window.localStorage.getItem(`huili-feedback-tone:${window.userId ?? 'current'}`);
    return FEEDBACK_TONES.some((tone) => tone.key === stored) ? stored as FeedbackTone : 'balanced';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`huili-feedback-tone:${window.userId ?? 'current'}`, feedbackTone);
  }, [feedbackTone]);
  return [feedbackTone, setFeedbackTone];
}

function actionMatchesFilter(action: MeetingActionInbox['actions'][number], filter: ActionFilter): boolean {
  if (filter === 'my_todos') return action.category === 'user_owned' && !['done', 'deferred', 'cancelled'].includes(action.status);
  if (filter === 'awaiting') return action.status === 'awaiting_confirmation';
  if (filter === 'executing') return ['queued', 'claimed', 'executing'].includes(action.status) || (action.category === 'ai_direct' && action.status === 'planned');
  return action.status === 'done';
}

function actionCapabilityLabel(action: InboxAction): string {
  if (action.sourceType === 'capture' && action.status === 'awaiting_confirmation') return '待你对齐';
  if (action.status === 'awaiting_confirmation') return 'AI 可推进';
  if (['queued', 'claimed', 'executing'].includes(action.status)) return 'AI 推进中';
  return '需要本人';
}

function ActionCard({ ranked, index, onOpenMeeting, ...handlers }: { ranked: RankedAction; index: number; onOpenMeeting: (id: string) => void } & MeetingActionHandlers) {
  const { action, reasons } = ranked;
  return <article className={`inbox-action ${action.category === 'ai_after_confirm' ? 'is-ai-ready' : ''}`}>
    {action.sourceType === 'capture'
      ? <div className="inbox-meeting-link is-static"><NotebookPen aria-hidden="true" /><span>随手记</span><time>{format(new Date(action.meetingStartedAt), 'M 月 d 日')}</time></div>
      : <button className="inbox-meeting-link" type="button" onClick={() => onOpenMeeting(action.meetingId)}><CalendarDays aria-hidden="true" /><span>{action.meetingTitle}</span><time>{format(new Date(action.meetingStartedAt), 'M 月 d 日')}</time><ArrowRight aria-hidden="true" /></button>}
    {reasons.length > 0 && <div className="priority-reasons" aria-label="排序依据">{reasons.map((reason) => <span key={reason}>{reason}</span>)}</div>}
    <ActionItem action={action} index={index} {...handlers} />
  </article>;
}

export function NowPage({
  meetings,
  inbox,
  agent,
  dailyBlank,
  dailyBlankDrawer,
  dailyBlankDrawRequest,
  onOpenMeeting,
  onOpenProgress,
  onConnectAgent,
  onContinueDailyBlank,
  onDailyBlankFeedback,
  onSaveAndRedrawDailyBlank,
  onDailyBlankDisposition,
  onRefreshDailyBlank,
}: {
  meetings: MeetingRecord[];
  inbox: MeetingActionInbox;
  agent: MeetingHubOverview['agent'];
  dailyBlank?: DailyBlankSnapshot;
  dailyBlankDrawer: DailyBlankSnapshot[];
  dailyBlankDrawRequest?: DailyBlankDrawRequest;
  onOpenMeeting: (id: string) => void;
  onOpenProgress: () => void;
  onConnectAgent: () => void;
  onContinueDailyBlank: (prompt: string) => void;
  onDailyBlankFeedback: (feedback: DailyBlankFeedback) => Promise<void>;
  onSaveAndRedrawDailyBlank: (blankId: string, tags: string[]) => Promise<void>;
  onDailyBlankDisposition: (blankId: string, action: DailyBlankDisposition) => Promise<void>;
  onRefreshDailyBlank: () => void;
}) {
  const now = Date.now();
  const upcoming = meetings.filter((meeting) => meeting.recordType === 'scheduled' && new Date(meeting.startedAt).getTime() >= now).sort((a, b) => +new Date(a.startedAt) - +new Date(b.startedAt));
  const nextMeeting = upcoming[0];
  const openActions = prioritizeNowActions(inbox.actions, now);
  return (
    <main className="page-workspace now-page">
      <header className="page-heading now-heading">
        <div className="now-heading-copy"><p className="kicker">给 AI 的自由时间</p><h1>此刻</h1><p>留白给 AI，让它试着 <span lang="en">amuse me</span>。<br />会心一笑、意外发现，或换个角度，都算数。</p></div>
        <button className={`now-agent-card ${agent.paired ? 'is-connected' : ''}`} type="button" onClick={onConnectAgent} aria-label={agent.paired ? `${agent.deviceName ?? 'Agent'} 已配对，打开连接设置` : '连接我的 Agent'}>
          <span className="now-agent-icon"><Laptop aria-hidden="true" /></span>
          <span className="now-agent-copy">
            <small>{agent.paired ? '已配对设备' : '连接我的电脑'}</small>
            <strong>{agent.paired ? agent.deviceName ?? '我的 Agent' : '连接我的 Agent'}</strong>
            <span>{agent.paired ? '会议和行动同步到你的个人空间' : '由你选择的 Agent 接手'}</span>
          </span>
          <ArrowRight aria-hidden="true" />
        </button>
      </header>
      <DailyBlank
        dailyBlank={dailyBlank}
        drawer={dailyBlankDrawer}
        drawRequest={dailyBlankDrawRequest}
        meetings={meetings}
        onOpenMeeting={onOpenMeeting}
        onContinue={onContinueDailyBlank}
        onFeedback={onDailyBlankFeedback}
        onSaveAndRedraw={onSaveAndRedrawDailyBlank}
        onDisposition={onDailyBlankDisposition}
        onRefresh={onRefreshDailyBlank}
      />
      <div className="now-layout">
        <section className="now-primary">
          <div className="section-heading"><div><p className="kicker">下一个时间点</p><h2>最近会议</h2></div></div>
          {nextMeeting ? <button className="next-meeting-card" type="button" onClick={() => onOpenMeeting(nextMeeting.id)}>
            <span className="next-meeting-date"><strong>{format(new Date(nextMeeting.startedAt), 'd')}</strong><small>{format(new Date(nextMeeting.startedAt), 'M 月 · EEE', { locale: zhCN })}</small></span>
            <span className="next-meeting-copy"><small>{formatMeetingTime(nextMeeting)}{nextMeeting.project ? ` · ${nextMeeting.project}` : ''}</small><strong>{nextMeeting.title}</strong><span>{nextMeeting.headline}</span></span>
            <ArrowRight aria-hidden="true" />
          </button> : <div className="actionable-empty"><CalendarDays aria-hidden="true" /><h3>近期没有已同步的会议</h3><p>可以去日历查看其他月份。</p></div>}
        </section>
        <section className="now-actions">
          <div className="section-heading"><div><p className="kicker">下一步行动</p><h2>优先推进</h2></div><button type="button" onClick={onOpenProgress}>查看全部 <ArrowRight /></button></div>
          {openActions.length ? <div className="now-action-list">{openActions.map((action) => <button key={action.id} type="button" onClick={onOpenProgress}><span>{actionCapabilityLabel(action)} · {action.meetingTitle}</span><strong>{action.title}</strong><small>{action.dueAt ? format(new Date(action.dueAt), 'M 月 d 日 HH:mm') : '暂无截止时间'}</small></button>)}</div> : <div className="actionable-empty compact"><ListChecks aria-hidden="true" /><h3>没有待处理行动</h3><p>新行动会在会议记录后进入推进页。</p></div>}
        </section>
      </div>
      {WORK_THREAD_URL && <Image className="huili-work-thread" src={WORK_THREAD_URL} width={2172} height={724} alt="" aria-hidden="true" quality={68} />}
    </main>
  );
}

export function ProgressPage({ inbox, filter, onFilterChange, onOpenMeeting, ...handlers }: { inbox: MeetingActionInbox; filter: ActionFilter; onFilterChange: (filter: ActionFilter) => void; onOpenMeeting: (id: string) => void } & MeetingActionHandlers) {
  const counts: Record<ActionFilter, number> = { my_todos: inbox.counts.myTodos, awaiting: inbox.counts.awaitingConfirmation, executing: inbox.counts.aiInProgress, completed: inbox.counts.completed };
  const actions = inbox.actions.filter((action) => actionMatchesFilter(action, filter));
  const ranked = rankActions(actions);
  const focusCount = filter === 'completed' ? Math.min(6, ranked.length) : Math.min(ranked.length, 4, Math.max(2, Math.ceil(ranked.length * 0.12)));
  const nextCount = filter === 'completed' ? 0 : Math.min(8, Math.max(0, ranked.length - focusCount));
  const focusActions = ranked.slice(0, focusCount);
  const nextActions = ranked.slice(focusCount, focusCount + nextCount);
  const laterActions = ranked.slice(focusCount + nextCount);
  const copy = PROGRESS_COPY[filter];
  return (
    <main className="page-workspace progress-page">
      <header className="page-heading"><p className="kicker">跨会议行动</p><h1>推进</h1><p>先把能交给 AI 的工作推进起来；需要你拍板的事项单独保留。</p></header>
      <div className="action-filter-tabs" aria-label="行动状态">{FILTERS.map((item) => <button className={filter === item.key ? 'active' : ''} key={item.key} type="button" onClick={() => onFilterChange(item.key)}><span>{item.label}</span><strong>{counts[item.key]}</strong></button>)}</div>
      {actions.length ? <div className="priority-queue">
        <p className="priority-sort-note"><SlidersHorizontal aria-hidden="true" />{copy.sort}</p>
        <section className="priority-section priority-focus">
          <header><div><p className="kicker">{copy.kicker}</p><h2>{copy.focus}</h2></div><strong>{focusActions.length} 项</strong></header>
          <div className="inbox-actions">{focusActions.map((item, index) => <ActionCard key={item.action.id} ranked={item} index={index} onOpenMeeting={onOpenMeeting} {...handlers} />)}</div>
        </section>
        {nextActions.length > 0 && <section className="priority-section priority-next">
          <header><div><p className="kicker">随后</p><h2>{copy.next}</h2></div><strong>{nextActions.length} 项</strong></header>
          <div className="inbox-actions">{nextActions.map((item, index) => <ActionCard key={item.action.id} ranked={item} index={focusCount + index} onOpenMeeting={onOpenMeeting} {...handlers} />)}</div>
        </section>}
        {laterActions.length > 0 && <details className="priority-section priority-later">
          <summary><span><strong>{copy.later}</strong><small>{laterActions.length} 项</small></span><ChevronDown aria-hidden="true" /></summary>
          <div className="inbox-actions">{laterActions.map((item, index) => <ActionCard key={item.action.id} ranked={item} index={focusCount + nextCount + index} onOpenMeeting={onOpenMeeting} {...handlers} />)}</div>
        </details>}
      </div> : <div className="actionable-empty"><ListChecks aria-hidden="true" /><h3>当前分类没有行动项</h3><p>可切换上方状态查看其他行动。</p></div>}
    </main>
  );
}

export function CalendarPage({ monthLabel, days, meetingsByDay, meetings, seriesByMeeting, selectedId, onSelect, onOpenSeries }: { monthLabel: string; days: Date[]; meetingsByDay: Map<string, MeetingRecord[]>; meetings: MeetingRecord[]; seriesByMeeting: Map<string, SeriesMembership>; selectedId?: string; onSelect: (id: string) => void; onOpenSeries: (seriesId: string) => void }) {
  const [expandedDayKey, setExpandedDayKey] = useState<string>();
  const monthDate = days.find((day) => format(day, 'yyyy 年 M 月') === monthLabel) ?? days[Math.floor(days.length / 2)];
  const expandedDay = expandedDayKey ? days.find((day) => format(day, 'yyyy-MM-dd') === expandedDayKey) : undefined;
  const expandedMeetings = expandedDayKey ? calendarEventsForDay(meetingsByDay, expandedDayKey) : [];

  useEffect(() => { setExpandedDayKey(undefined); }, [monthLabel]);

  const selectExpandedMeeting = (meetingId: string) => {
    setExpandedDayKey(undefined);
    onSelect(meetingId);
  };

  return <>
    <div className="calendar-stage">
      <div className="weekday-row">{['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{days.map((day) => {
        const key = format(day, 'yyyy-MM-dd'); const events = calendarEventsForDay(meetingsByDay, key); const hiddenCount = hiddenCalendarEventCount(events);
        return <div className={['calendar-day', monthDate && !isSameMonth(day, monthDate) ? 'outside' : '', isSameDay(day, new Date()) ? 'today' : '', events.some((item) => item.id === selectedId) ? 'selected' : ''].filter(Boolean).join(' ')} key={key}>
          <span className="day-number">{format(day, 'd')}</span><div className="day-events">{events.slice(0, CALENDAR_VISIBLE_EVENT_LIMIT).map((meeting) => { const series = seriesByMeeting.get(meeting.id); const alternativeCount = series?.alternatives.length ?? 0; return <div className={`calendar-event-wrap ${series ? 'has-series' : ''}`} key={meeting.id}><button aria-label={`${format(new Date(meeting.startedAt), 'M 月 d 日 HH:mm')} ${meeting.title}`} className={`calendar-event ${statusTone(meeting.status)} ${selectedId === meeting.id ? 'active' : ''}`} type="button" onClick={() => onSelect(meeting.id)}><time>{format(new Date(meeting.startedAt), 'HH:mm')}</time><span>{meeting.title}</span></button>{series && <button className="calendar-series-jump" type="button" aria-label={`打开「${series.label}」系列脉络`} title={`${series.label} · ${series.count} 场${alternativeCount > 0 ? `，另关联 ${alternativeCount} 个主题` : ''}`} onClick={() => onOpenSeries(series.id)}><Network aria-hidden="true" />{alternativeCount > 0 && <span>{alternativeCount + 1}</span>}</button>}</div>; })}{hiddenCount > 0 && <button className="more-events" type="button" aria-label={`查看 ${format(day, 'M 月 d 日')} 的全部 ${events.length} 场会议`} onClick={() => setExpandedDayKey(key)}>+{hiddenCount} · 查看全部</button>}</div>
        </div>;
      })}</div>
    </div>
    <footer className="calendar-footer"><div className="legend"><span><i className="upcoming" />即将开始</span><span><i className="done" />会后记录</span></div><p><strong>{meetings.length}</strong> 场会议 · <strong>{meetings.reduce((total, meeting) => total + meeting.actions.length, 0)}</strong> 项行动</p></footer>
    <Dialog open={Boolean(expandedDayKey && expandedMeetings.length)} onOpenChange={(open) => { if (!open) setExpandedDayKey(undefined); }}>
      <DialogContent className="day-meetings-dialog">
        <DialogHeader>
          <p className="kicker">当日会议</p>
          <DialogTitle>{expandedDay ? format(expandedDay, 'M 月 d 日 EEEE', { locale: zhCN }) : '当日会议'}</DialogTitle>
          <DialogDescription>{expandedMeetings.length} 场会议，选择一场查看详情。</DialogDescription>
        </DialogHeader>
        <div className="day-meetings-list">
          {expandedMeetings.map((meeting) => <button className={`day-meeting-option ${selectedId === meeting.id ? 'selected' : ''}`} key={meeting.id} type="button" onClick={() => selectExpandedMeeting(meeting.id)}>
            <time>{format(new Date(meeting.startedAt), 'HH:mm')}</time>
            <span><strong>{meeting.title}</strong><small>{meeting.headline || (meeting.recordType === 'scheduled' ? '即将开始' : '会后记录')}</small></span>
            <ArrowRight aria-hidden="true" />
          </button>)}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

export function CalendarRail({ meetings, onSelect }: { meetings: MeetingRecord[]; onSelect: (id: string) => void }) {
  const upcoming = meetings.filter((meeting) => meeting.recordType === 'scheduled').slice(0, 4);
  return <aside className="calendar-rail"><p className="kicker">本月提醒</p><h2>时间与会议</h2>{upcoming.length ? <div className="rail-meetings">{upcoming.map((meeting) => <button key={meeting.id} type="button" onClick={() => onSelect(meeting.id)}><time>{format(new Date(meeting.startedAt), 'M 月 d 日 HH:mm')}</time><strong>{meeting.title}</strong><span>{meeting.headline}</span></button>)}</div> : <div className="actionable-empty compact"><CalendarDays aria-hidden="true" /><h3>本月没有已同步的未来会议</h3><p>切换月份查看其他日程。</p></div>}</aside>;
}

export function EmptyProductPage({ kind, onPrimary }: { kind: 'explore' | 'memory'; onPrimary: () => void }) {
  const explore = kind === 'explore'; const Icon = explore ? Compass : Search;
  return <main className="page-workspace quiet-page"><div className="quiet-empty"><Icon aria-hidden="true" /><p className="kicker">{explore ? '跨会议线索' : '可追溯记录'}</p><h1>{explore ? '暂无可漫游的关系' : '还没有可查看的记忆索引'}</h1><p>{explore ? '当会议之间出现可追溯的连续关系时，会在这里展开。' : '你仍可以从日历打开会议，查看已同步的资料、结论和行动。'}</p><Button variant="outline" onClick={onPrimary}>{explore ? '回到日历' : '查看会议资料'}<ArrowRight /></Button></div>{WORK_THREAD_URL && <Image className="huili-work-thread" src={WORK_THREAD_URL} width={2172} height={724} alt="" aria-hidden="true" quality={68} />}</main>;
}

type ExploreNodeKind = 'series' | 'meeting' | 'decision' | 'risk' | 'action' | 'output';
type ExploreNode = { id: string; kind: ExploreNodeKind; eyebrow: string; title: string; detail: string; x: number; y: number; meetingId?: string };

function buildExploreNodes(series: SeriesCandidate): ExploreNode[] {
  const positions = [{ x: 18, y: 21 }, { x: 16, y: 70 }, { x: 46, y: 82 }];
  const nodes: ExploreNode[] = [{ id: 'series', kind: 'series', eyebrow: '系列会议', title: series.label, detail: `${series.meetings.length} 场会议 · ${format(new Date(series.meetings.at(-1)!.startedAt), '更新至 M 月 d 日')}`, x: 49, y: 45 }];
  const meetingNodes = series.meetings.length <= 3 ? series.meetings : [series.meetings[0], series.meetings[Math.floor(series.meetings.length / 2)], series.meetings.at(-1)!];
  meetingNodes.forEach((meeting, index) => nodes.push({ id: `meeting-${meeting.id}`, kind: 'meeting', eyebrow: `会议 · ${format(new Date(meeting.startedAt), 'M/d')}`, title: meeting.title, detail: meeting.headline || `${meeting.actions.length} 项行动`, x: positions[index].x, y: positions[index].y, meetingId: meeting.id }));
  const latestDecision = [...series.meetings].reverse().flatMap((meeting) => meeting.decisions.map((decision) => ({ meeting, decision })))[0];
  if (latestDecision) nodes.push({ id: 'decision', kind: 'decision', eyebrow: '关键决定', title: latestDecision.decision, detail: `来自 ${format(new Date(latestDecision.meeting.startedAt), 'M 月 d 日')}会议`, x: 79, y: 22, meetingId: latestDecision.meeting.id });
  const latestRisk = [...series.meetings].reverse().flatMap((meeting) => meeting.risks.map((risk) => ({ meeting, risk })))[0];
  if (latestRisk) nodes.push({ id: 'risk', kind: 'risk', eyebrow: '仍在阻塞', title: latestRisk.risk, detail: `来自 ${format(new Date(latestRisk.meeting.startedAt), 'M 月 d 日')}会议`, x: 83, y: 58, meetingId: latestRisk.meeting.id });
  const openActions = series.meetings.flatMap((meeting) => meeting.actions.filter((action) => !['done', 'deferred', 'cancelled'].includes(action.status)));
  if (openActions.length) nodes.push({ id: 'action', kind: 'action', eyebrow: '当前推进', title: openActions[0].title, detail: `${openActions.length} 项行动尚未关闭`, x: 68, y: 82 });
  const outputMeeting = [...series.meetings].reverse().find((meeting) => meeting.sourceLinks.generatedDocument || meeting.actions.some((action) => action.resultLinks.length));
  if (outputMeeting) nodes.push({ id: 'output', kind: 'output', eyebrow: '已有产物', title: outputMeeting.actions.flatMap((action) => action.resultLinks)[0]?.label || '会议产物与纪要', detail: `形成于 ${format(new Date(outputMeeting.startedAt), 'M 月 d 日')}`, x: 22, y: 91, meetingId: outputMeeting.id });
  return nodes;
}

const NODE_ICONS: Record<ExploreNodeKind, typeof Compass> = { series: Network, meeting: CalendarDays, decision: GitBranch, risk: CircleAlert, action: ListChecks, output: FileText };

function discussionPathGeometry(count: number) {
  const width = Math.max(900, count * 190 + 100);
  const usableWidth = width - 260;
  const gap = count > 1 ? usableWidth / (count - 1) : 0;
  const points = Array.from({ length: count }, (_, index) => ({ x: 130 + index * gap, y: index % 2 === 0 ? 175 : 365 }));
  const path = points.slice(1).reduce((value, point, index) => {
    const previous = points[index];
    const bend = previous.y < point.y ? 82 : -82;
    return `${value} C ${previous.x + 88} ${previous.y + bend}, ${point.x - 88} ${point.y - bend}, ${point.x} ${point.y}`;
  }, points[0] ? `M ${points[0].x} ${points[0].y}` : '');
  return { width, points, path };
}

export function ExplorePage({ inbox, seriesCandidates, seriesLoading, seriesError, selectedSeriesId, onSelectSeries, onOpenMeeting, onStartExplore, onOpenCalendar, onOpenPeople }: { inbox: MeetingActionInbox; seriesCandidates: SeriesCandidate[]; seriesLoading: boolean; seriesError?: string; selectedSeriesId?: string; onSelectSeries: (seriesId: string) => void; onOpenMeeting: (id: string) => void; onStartExplore: () => void; onOpenCalendar: () => void; onOpenPeople: () => void }) {
  const runs = inbox.actions
    .filter((action) => action.sourceType === 'capture' && action.title.startsWith('漫游：'))
    .sort((left, right) => +new Date(right.meetingStartedAt) - +new Date(left.meetingStartedAt))
    .slice(0, 6);
  const [viewMode, setViewMode] = useState<'path' | 'network'>('path');
  const [selectedNodeId, setSelectedNodeId] = useState('series');
  const [selectedPathMeetingId, setSelectedPathMeetingId] = useState<string>();
  const selectedSeries = seriesCandidates.find((series) => series.id === selectedSeriesId) ?? seriesCandidates[0];
  const seriesClusters = useMemo(() => buildSeriesThemeClusters(seriesCandidates), [seriesCandidates]);
  const selectedCluster = seriesClusters.find((cluster) => cluster.series.some((series) => series.id === selectedSeries?.id)) ?? seriesClusters[0];
  const nodes = useMemo(() => selectedSeries ? buildExploreNodes(selectedSeries) : [], [selectedSeries]);
  const pathSteps = useMemo(() => selectedSeries ? buildSeriesPath(selectedSeries) : [], [selectedSeries]);
  const seriesInsights = useMemo(() => selectedSeries ? buildSeriesInsights(selectedSeries) : [], [selectedSeries]);
  const pathGeometry = useMemo(() => discussionPathGeometry(pathSteps.length), [pathSteps.length]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const selectedPathStep = pathSteps.find((step) => step.meetingId === selectedPathMeetingId) ?? pathSteps.at(-1);
  const SelectedNodeIcon = selectedNode ? NODE_ICONS[selectedNode.kind] : Compass;
  const nextInsight = seriesInsights.find((insight) => insight.kind === 'next');
  const processInsights = seriesInsights.filter((insight) => insight.kind !== 'next');
  const selectSeries = (seriesId: string): void => {
    onSelectSeries(seriesId);
    setSelectedNodeId('series');
    setSelectedPathMeetingId(undefined);
  };
  if (seriesLoading) {
    return <main className="page-workspace explore-page">{ORGANIC_VISUAL_URL && <img className="organic-visual organic-visual-explore" src={ORGANIC_VISUAL_URL} alt="" aria-hidden="true" />}<header className="explore-heading"><div><p className="kicker">系列会议的讨论与推进</p><h1>正在辨认会议脉络</h1><p>只有决定、阻塞、行动或产物真正承接的会议，才会出现在同一个主题里。</p></div></header><div className="series-discovery-state"><Sparkles aria-hidden="true" /><strong>正在从已有会议中找连续主题…</strong><span>没有足够依据的会议会保持独立。</span></div></main>;
  }
  if (!selectedSeries && runs.length === 0) {
    if (seriesError) return <main className="page-workspace explore-page">{ORGANIC_VISUAL_URL && <img className="organic-visual organic-visual-explore" src={ORGANIC_VISUAL_URL} alt="" aria-hidden="true" />}<header className="explore-heading"><div><p className="kicker">系列会议的讨论与推进</p><h1>会议脉络还没有整理出来</h1><p>{seriesError}</p></div><div className="explore-heading-actions"><Button variant="outline" onClick={onOpenCalendar}>回到日历</Button><Button onClick={() => window.location.reload()}>重新整理</Button></div></header></main>;
    return <EmptyProductPage kind="explore" onPrimary={onOpenCalendar} />;
  }
  return <main className="page-workspace explore-page">
    {ORGANIC_VISUAL_URL && <img className="organic-visual organic-visual-explore" src={ORGANIC_VISUAL_URL} alt="" aria-hidden="true" />}
    <header className="explore-heading">
      <div><p className="kicker">系列会议的讨论与推进</p><h1>{selectedSeries ? `「${selectedSeries.label}」如何一步步走到现在？` : '漫游'}</h1><p>沿着每次讨论的转折，看决定如何形成、哪里反复受阻，以及下一场需要收敛什么。</p></div>
      <div className="explore-heading-actions"><Button variant="outline" onClick={onOpenPeople}><UsersRound />人与协作</Button><Button onClick={onStartExplore}><Sparkles />探索别的问题</Button></div>
    </header>
    <div className="explore-controls">
      {seriesCandidates.length > 1 && <section className="series-index" aria-label="会议主题与系列">
        <header className="series-index-heading"><span><Layers3 aria-hidden="true" />主题目录</span><small>{seriesClusters.length} 个主题 · {seriesCandidates.length} 条脉络</small></header>
        <div className="series-theme-grid" role="tablist" aria-label="选择会议主题">
          {seriesClusters.map((cluster, index) => <button aria-selected={selectedCluster?.id === cluster.id} className={selectedCluster?.id === cluster.id ? 'active' : ''} key={cluster.id} role="tab" type="button" onClick={() => selectSeries(cluster.series[0].id)}><span><i>{String(index + 1).padStart(2, '0')}</i><strong>{cluster.label}</strong></span><small>{cluster.series.length} 条 · {cluster.meetingCount} 场</small></button>)}
        </div>
        {selectedCluster && <div className="series-switcher" role="tabpanel" aria-label={`${selectedCluster.label}下的系列会议`}>
          <div className="series-cluster-caption"><strong>{selectedCluster.label}</strong><span>选择一条脉络查看讨论过程</span></div>
          <div className="series-cluster-list">{selectedCluster.series.map((series) => <button className={selectedSeries?.id === series.id ? 'active' : ''} key={series.id} type="button" onClick={() => selectSeries(series.id)}><span>{series.label}</span><small>{series.meetings.length} 场</small></button>)}</div>
        </div>}
      </section>}
      <div className="explore-mode-switch" aria-label="漫游视角"><button className={viewMode === 'path' ? 'active' : ''} type="button" onClick={() => setViewMode('path')}><GitBranch aria-hidden="true" />讨论路径</button><button className={viewMode === 'network' ? 'active' : ''} type="button" onClick={() => setViewMode('network')}><Network aria-hidden="true" />关系脉络</button></div>
    </div>
    {selectedSeries && <section className="explore-map-shell">
      {viewMode === 'path' ? <div className="discussion-path-viewport" aria-label={`${selectedSeries.label}系列会议讨论路径`}>
        <div className="discussion-path-canvas" style={{ '--path-width': `${pathGeometry.width}px` } as React.CSSProperties}>
          <svg className="discussion-path-thread" viewBox={`0 0 ${pathGeometry.width} 540`} preserveAspectRatio="none" aria-hidden="true"><defs><filter id="pathPencil"><feTurbulence baseFrequency="0.015 0.09" numOctaves="3" seed="7" type="fractalNoise" result="noise" /><feDisplacementMap in="SourceGraphic" in2="noise" scale="2.8" /></filter><filter id="pathFiber"><feTurbulence baseFrequency="0.04 0.22" numOctaves="2" seed="19" type="fractalNoise" result="fiber" /><feDisplacementMap in="SourceGraphic" in2="fiber" scale="1.4" /></filter></defs><path className="path-thread-echo" d={pathGeometry.path} /><path className="path-thread-line" d={pathGeometry.path} /><path className="path-thread-grain" d={pathGeometry.path} /></svg>
          {pathSteps.map((step, index) => { const point = pathGeometry.points[index]; return <button className={`discussion-step ${selectedPathStep?.meetingId === step.meetingId ? 'selected' : ''}`} style={{ '--step-x': `${point.x}px`, '--step-y': `${point.y}px` } as React.CSSProperties} key={step.id} type="button" onClick={() => setSelectedPathMeetingId(step.meetingId)}><span className="discussion-step-index">{String(index + 1).padStart(2, '0')}</span><span className="discussion-step-copy"><small>{format(new Date(step.at), 'M 月 d 日')} · {step.stage}</small><strong>{step.title}</strong><em>{step.summary}</em></span>{step.transition && <span className="discussion-transition">{step.transition}</span>}</button>; })}
          <div className="path-start-label">议题进入</div><div className="path-now-label"><Sparkles aria-hidden="true" />当前进展</div>
        </div>
      </div> : <div className="explore-map" aria-label={`${selectedSeries.label}系列会议关系图`}>
        <svg className="explore-threads" viewBox="0 0 1000 640" preserveAspectRatio="none" aria-hidden="true">
          <defs><filter id="softGlow"><feGaussianBlur stdDeviation="5" /></filter></defs>
          {nodes.filter((node) => node.id !== 'series').map((node, index) => {
            const x = node.x * 10; const y = node.y * 6.4; const centerX = 490; const centerY = 288;
            const dx = x - centerX; const dy = y - centerY; const distance = Math.hypot(dx, dy) || 1;
            const normalX = -dy / distance; const normalY = dx / distance;
            const sweep = [76, -104, 132, -82, 112, -126, 90][index % 7];
            const midpointX = centerX + dx * 0.52 + normalX * sweep;
            const midpointY = centerY + dy * 0.52 + normalY * sweep;
            const path = `M ${centerX} ${centerY} C ${centerX + dx * 0.17 + normalX * sweep * 0.74} ${centerY + dy * 0.17 + normalY * sweep * 0.74}, ${midpointX - dx * 0.12 + normalX * sweep * 0.24} ${midpointY - dy * 0.12 + normalY * sweep * 0.24}, ${midpointX} ${midpointY} C ${midpointX + dx * 0.14 - normalX * sweep * 0.34} ${midpointY + dy * 0.14 - normalY * sweep * 0.34}, ${x - dx * 0.19 - normalX * sweep * 0.62} ${y - dy * 0.19 - normalY * sweep * 0.62}, ${x} ${y}`;
            const echoSweep = sweep + (sweep > 0 ? 18 : -18);
            const echoMidpointX = centerX + dx * 0.49 + normalX * echoSweep;
            const echoMidpointY = centerY + dy * 0.49 + normalY * echoSweep;
            const echoPath = `M ${centerX} ${centerY} C ${centerX + dx * 0.2 + normalX * echoSweep * 0.68} ${centerY + dy * 0.2 + normalY * echoSweep * 0.68}, ${echoMidpointX - dx * 0.1} ${echoMidpointY - dy * 0.1}, ${echoMidpointX} ${echoMidpointY} C ${echoMidpointX + dx * 0.16 - normalX * echoSweep * 0.28} ${echoMidpointY + dy * 0.16 - normalY * echoSweep * 0.28}, ${x - dx * 0.22 - normalX * echoSweep * 0.54} ${y - dy * 0.22 - normalY * echoSweep * 0.54}, ${x} ${y}`;
            return <g className={`thread-group ${selectedNode?.id === node.id ? 'selected' : ''}`} key={`edge-${node.id}`}>
              <path className={`thread-echo thread-${node.kind}`} d={echoPath} />
              <path className={`thread thread-${node.kind}`} d={path} />
              <circle className={`thread-waypoint thread-dot-${node.kind}`} cx={midpointX} cy={midpointY} r="2.6" />
              <circle className={`thread-dot thread-dot-${node.kind}`} cx={x} cy={y} r="4" />
            </g>;
          })}
          <circle className="thread-orbit" cx="490" cy="288" r="155" /><circle className="thread-orbit faint" cx="490" cy="288" r="230" />
        </svg>
        {nodes.map((node) => { const Icon = NODE_ICONS[node.kind]; return <button className={`explore-node node-${node.kind} ${selectedNode?.id === node.id ? 'selected' : ''}`} style={{ '--node-x': `${node.x}%`, '--node-y': `${node.y}%` } as React.CSSProperties} key={node.id} type="button" onClick={() => setSelectedNodeId(node.id)}><span className="node-icon"><Icon aria-hidden="true" /></span><span className="node-copy"><small>{node.eyebrow}</small><strong>{node.title}</strong><em>{node.detail}</em></span></button>; })}
        <div className="map-caption"><Link2 aria-hidden="true" /><span>{selectedSeries.meetings.length} 场连续会议</span><i />{nodes.length - 1} 条可追溯线索</div>
      </div>}
      <aside className="evidence-drawer series-insight-drawer">
        <header><div><p className="kicker">当前系列</p><h2>推进判断</h2></div><span>{selectedSeries.matchReasons.length} 条连续依据</span></header>
        {nextInsight && <div className="series-next-conclusion"><div className="series-next-label"><span><Sparkles aria-hidden="true" />{nextInsight.label}</span><small>{nextInsight.evidenceCount} 条依据</small></div><h3>{nextInsight.title}</h3><p>{nextInsight.detail}</p><button type="button" onClick={() => nextInsight.meetingId && onOpenMeeting(nextInsight.meetingId)}>查看依据 <ArrowRight aria-hidden="true" /></button></div>}
        {processInsights.length > 0 && <div className="series-process-insights"><p>过程洞察</p>{processInsights.map((insight) => <button className={`process-insight insight-${insight.kind}`} key={insight.kind} type="button" onClick={() => insight.meetingId && onOpenMeeting(insight.meetingId)}><span>{insight.kind === 'people' ? <UsersRound aria-hidden="true" /> : <Brain aria-hidden="true" />}{insight.label}</span><strong>{insight.title}</strong><small>{insight.detail}</small><em>{insight.evidenceCount} 条依据</em></button>)}</div>}
        {viewMode === 'path' && selectedPathStep && <div className="selected-path-evidence"><span><CalendarDays aria-hidden="true" />当前节点</span><strong>{selectedPathStep.title}</strong><p>{selectedPathStep.summary}</p><Button variant="outline" size="sm" onClick={() => onOpenMeeting(selectedPathStep.meetingId)}>打开这场会<ArrowRight /></Button></div>}
        {viewMode === 'network' && selectedNode && <div className={`evidence-focus evidence-${selectedNode.kind}`}><span><SelectedNodeIcon aria-hidden="true" />{selectedNode.eyebrow}</span><h3>{selectedNode.title}</h3><p>{selectedNode.detail}</p>{selectedNode.meetingId && <Button variant="outline" size="sm" onClick={() => onOpenMeeting(selectedNode.meetingId!)}>回到这场会<ArrowRight /></Button>}</div>}
        <div className="evidence-meetings"><p>系列来源</p>{selectedSeries.meetings.slice(-4).reverse().map((meeting) => <button key={meeting.id} type="button" onClick={() => onOpenMeeting(meeting.id)}><span><CalendarDays aria-hidden="true" /></span><span><small>{format(new Date(meeting.startedAt), 'M 月 d 日')}</small><strong>{meeting.title}</strong></span><ArrowRight aria-hidden="true" /></button>)}</div>
        {runs.length > 0 && <div className="explore-latest-run"><Sparkles aria-hidden="true" /><span><small>最近一次主动漫游</small><strong>{runs[0].title.replace(/^漫游：/u, '')}</strong></span><em className={`action-state ${statusTone(runs[0].status)}`}>{runs[0].status === 'done' ? '已完成' : runs[0].status === 'failed' ? '需检查' : '生成中'}</em></div>}
      </aside>
    </section>}
  </main>;
}

function InsightEvidence({ insight, onOpenMeeting }: { insight: OwnerPerformanceInsight; onOpenMeeting: (id: string) => void }) {
  return <div className="performance-evidence" aria-label={`${insight.evidence.length} 场会议依据`}>
    {insight.evidence.map((meeting) => <button key={meeting.meetingId} type="button" onClick={() => onOpenMeeting(meeting.meetingId)} title={meeting.title}>
      <CalendarDays aria-hidden="true" />
      <span>{format(new Date(meeting.startedAt), 'M 月 d 日')}</span>
      <strong>{meeting.title}</strong>
      <ArrowRight aria-hidden="true" />
    </button>)}
  </div>;
}

export function InsightsPage({
  meetings,
  seriesCandidates,
  seriesLoading,
  seriesError,
  onOpenMeeting,
  onOpenPeople,
  onOpenCalendar,
}: {
  meetings: MeetingRecord[];
  seriesCandidates: SeriesCandidate[];
  seriesLoading: boolean;
  seriesError?: string;
  onOpenMeeting: (id: string) => void;
  onOpenPeople: () => void;
  onOpenCalendar: () => void;
}) {
  const [feedbackTone, setFeedbackTone] = useFeedbackTonePreference();
  const [selectedRange, setSelectedRange] = useState<OwnerPerformanceRangeKey>('30d');
  const performance = useMemo(
    () => buildOwnerPerformanceView(meetings, seriesCandidates),
    [meetings, seriesCandidates],
  );
  const activeTone = FEEDBACK_TONES.find((tone) => tone.key === feedbackTone) ?? FEEDBACK_TONES[0];
  const activeRange = performance.ranges[selectedRange];
  const activeDecisionCount = activeRange.recordedMeetings.reduce((sum, meeting) => sum + meeting.decisions.length, 0);
  const activeContentCount = activeRange.recordedMeetings.filter((meeting) => Boolean(meeting.summary?.trim() || meeting.headline.trim())).length;
  const activeExternalKeys = new Set(activeRange.recordedMeetings.map((meeting) => meeting.externalKey));
  const activeSeriesCount = seriesCandidates.filter((series) => series.meetings.some((meeting) => activeExternalKeys.has(meeting.externalKey))).length;
  const activeMinutes = activeRange.recordedMeetings.reduce((sum, meeting) => sum + (meeting.durationMinutes ?? 0), 0);
  const pendingResultCount = Math.max(activeRange.meetings.length - activeRange.recordedMeetings.length, 0);
  const primaryInsights = activeRange.insights.slice(0, 3);
  const additionalInsights = activeRange.insights.slice(3);
  const now = new Date();
  const activePeriodTitle = selectedRange === 'today'
    ? format(now, 'M 月 d 日 EEEE', { locale: zhCN })
    : `${format(subDays(now, activeRange.days - 1), 'M 月 d 日')}—${format(now, 'M 月 d 日')}`;

  return <main className={`page-workspace insights-page tone-${feedbackTone}`}>
    {ORGANIC_VISUAL_URL && <img className="organic-visual organic-visual-insights" src={ORGANIC_VISUAL_URL} alt="" aria-hidden="true" />}
    <header className="insights-heading">
      <div><p className="kicker">今天到近 90 天</p><h1>洞察 <Sparkles aria-hidden="true" /></h1><p>从会中的表达、追问、判断与协作证据里，看清当下表现和跨会重复的思考方式。</p></div>
      <aside className="insights-heading-tools">
        <div className="feedback-tone-control"><span>建议方式</span><div role="group" aria-label="选择建议方式">{FEEDBACK_TONES.map((tone) => <button aria-pressed={feedbackTone === tone.key} className={feedbackTone === tone.key ? 'active' : ''} key={tone.key} type="button" onClick={() => setFeedbackTone(tone.key)}>{tone.label}</button>)}</div></div>
        <button className="people-entry" type="button" onClick={onOpenPeople}><span><UsersRound aria-hidden="true" /><small>协作视角</small><strong>人与协作</strong></span><ArrowRight aria-hidden="true" /></button>
      </aside>
    </header>

    <nav className="insight-range-control" aria-label="洞察时间范围">
      {OWNER_PERFORMANCE_RANGE_OPTIONS.map((option) => {
        const range = performance.ranges[option.key];
        const isActive = selectedRange === option.key;
        return <button
          aria-pressed={isActive}
          className={isActive ? 'active' : ''}
          data-ai-section-type="button"
          key={option.key}
          type="button"
          onClick={() => setSelectedRange(option.key)}
        >
          <strong>{option.label}</strong>
          <span>{range.recordedMeetings.length} 场记录</span>
          <em>{range.insights.length} 条洞察</em>
        </button>;
      })}
    </nav>

    <section className="daily-performance">
      <header><div><p className="kicker">{selectedRange === 'today' ? '今日表现' : `${activeRange.label}表现`}</p><h2>{activePeriodTitle}</h2></div><span>只看会中证据，不依据待办勾选</span></header>
      <div className="daily-performance-layout">
        <aside className="daily-ledger">
          <div className="daily-count"><strong>{String(activeRange.recordedMeetings.length).padStart(2, '0')}</strong><span>场会已有结果</span></div>
          <dl>
            <div><dt>有内容记录</dt><dd>{activeContentCount}</dd></div>
            <div><dt>明确判断</dt><dd>{activeDecisionCount}</dd></div>
            <div><dt>进入系列</dt><dd>{activeSeriesCount}</dd></div>
            <div><dt>会议时长</dt><dd>{activeMinutes > 0 ? `${activeMinutes} 分` : '—'}</dd></div>
          </dl>
          {pendingResultCount > 0 && <p>{pendingResultCount} 场会还在等待结果回传。</p>}
        </aside>
        <div className="daily-insight-flow">
          {primaryInsights.length > 0 ? primaryInsights.map((insight, index) => {
            const meta = PERFORMANCE_INSIGHT_META[insight.dimension];
            const InsightIcon = meta.icon;
            return <article className={index === 0 ? 'is-featured' : ''} key={insight.id}>
              <header><span><InsightIcon aria-hidden="true" /></span><small>{String(index + 1).padStart(2, '0')} · {insight.label}</small><em>{insight.evidence.length} 场依据</em></header>
              <h3>{insight.observation}</h3>
              <div className="performance-advice"><small>{activeTone.adviceLabel}</small><strong>{insight.advice[feedbackTone]}</strong></div>
              <InsightEvidence insight={insight} onOpenMeeting={onOpenMeeting} />
            </article>;
          }) : <div className="daily-insight-empty"><span>{seriesLoading ? <RefreshCw aria-hidden="true" /> : <Search aria-hidden="true" />}</span><h3>{seriesLoading ? '正在整理这个周期的会议表现' : seriesError ? '这个周期的历史证据暂未加载完整' : activeRange.meetings.length > 0 ? `${activeRange.label}还没有足够的跨会证据` : `${activeRange.label}还没有可分析的会议记录`}</h3><p>{seriesLoading ? '会议记录仍可查看；跨会议证据整理完成后会出现在这里。' : seriesError ? '可以先查看日历中的会议内容，历史证据恢复后这里会自动补齐。' : activeRange.meetings.length > 0 ? `已有 ${activeRange.meetings.length} 场会议；至少两场会共同支持的表达、判断或协作模式才会保留。` : '有已同步的会议内容后，这里才会形成可回溯的判断。'}</p><Button variant="outline" onClick={onOpenCalendar}>查看日历<ArrowRight /></Button></div>}
        </div>
      </div>
    </section>

    {additionalInsights.length > 0 && <section className="recent-performance">
      <header>
        <div><p className="kicker">更多跨会模式</p><h2>{activeRange.label}里，还有哪些表现反复出现？</h2><p>{activeRange.recordedMeetings.length} 场会议可作为依据；同一类下有不同证据的表现会分别保留。</p></div>
      </header>
      <div className="recent-insight-river">{additionalInsights.map((insight, index) => {
        const meta = PERFORMANCE_INSIGHT_META[insight.dimension];
        const InsightIcon = meta.icon;
        return <article className={`recent-insight insight-${insight.dimension}`} key={insight.id}>
          <span className="recent-insight-index">{String(index + 4).padStart(2, '0')}</span>
          <div className="recent-insight-mark"><InsightIcon aria-hidden="true" /></div>
          <div className="recent-insight-copy"><header><small>跨会模式 · {insight.label}</small><em>{insight.evidence.length} 场依据</em></header><h3>{insight.observation}</h3><div className="performance-advice"><small>{activeTone.adviceLabel}</small><strong>{insight.advice[feedbackTone]}</strong></div><InsightEvidence insight={insight} onOpenMeeting={onOpenMeeting} /></div>
        </article>;
      })}</div>
    </section>}
  </main>;
}

function compactActionTitle(title: string): string {
  return title.replace(/[\s，。,.、：:；;（）()【】[\]]/gu, '').replace(/确认|完成|整理|跟进|处理|沟通/gu, '').slice(0, 12);
}

function repeatedDelegationCandidates(actions: InboxAction[]) {
  const candidates = actions.filter((action) => action.category === 'user_owned' && !['done', 'deferred', 'cancelled'].includes(action.status));
  const groups: Array<{ key: string; actions: InboxAction[] }> = [];
  for (const action of candidates) {
    const signals = titleSignals(action.title);
    const match = groups.find((group) => {
      const other = titleSignals(group.actions[0].title);
      return [...signals].filter((signal) => other.has(signal)).length >= 2;
    });
    if (match) match.actions.push(action);
    else groups.push({ key: compactActionTitle(action.title) || action.title.slice(0, 12), actions: [action] });
  }
  return groups.filter((group) => group.actions.length >= 2).sort((left, right) => right.actions.length - left.actions.length).slice(0, 4);
}

export function PeopleCollaborationPage({ meetings, inbox, seriesCandidates, onOpenMeeting, onBack }: { meetings: MeetingRecord[]; inbox: MeetingActionInbox; seriesCandidates: SeriesCandidate[]; onOpenMeeting: (id: string) => void; onBack: () => void }) {
  const delegations = useMemo(() => repeatedDelegationCandidates(inbox.actions), [inbox.actions]);
  const judgments = inbox.actions.filter((action) => action.status === 'awaiting_confirmation').slice(0, 4);
  const reminders = inbox.actions.filter((action) => action.dependency && action.status !== 'awaiting_confirmation' && !['done', 'deferred', 'cancelled'].includes(action.status)).slice(0, 4);
  const decisionCount = meetings.reduce((total, meeting) => total + meeting.decisions.length, 0);
  const deliverableCount = inbox.actions.filter((action) => action.deliverable || action.resultLinks.length).length;
  const sourceCount = meetings.reduce((total, meeting) => total + Object.values(meeting.sourceLinks).filter(Boolean).length, 0);
  const [feedbackTone, setFeedbackTone] = useFeedbackTonePreference();
  const ownerInsights = useMemo(() => {
    const bestByDimension = new Map<keyof typeof OWNER_INSIGHT_META, {
      insight: NonNullable<SeriesCandidate['ownerInsights']>[number];
      series: SeriesCandidate;
      meetingId?: string;
    }>();
    for (const series of seriesCandidates) {
      for (const insight of series.ownerInsights ?? []) {
        const dimension = insight.dimension as keyof typeof OWNER_INSIGHT_META;
        if (!OWNER_INSIGHT_META[dimension]) continue;
        const current = bestByDimension.get(dimension);
        const currentWeight = current
          ? current.insight.evidenceExternalKeys.length + current.insight.confidence
          : -1;
        const nextWeight = insight.evidenceExternalKeys.length + insight.confidence;
        if (nextWeight <= currentWeight) continue;
        const sourceMeeting = series.meetings.find((meeting) => insight.evidenceExternalKeys.includes(meeting.externalKey));
        bestByDimension.set(dimension, { insight, series, meetingId: sourceMeeting?.id });
      }
    }
    return (Object.keys(OWNER_INSIGHT_META) as Array<keyof typeof OWNER_INSIGHT_META>)
      .map((dimension) => bestByDimension.get(dimension))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [seriesCandidates]);
  const activeTone = FEEDBACK_TONES.find((tone) => tone.key === feedbackTone) ?? FEEDBACK_TONES[0];
  const hasEvidence = ownerInsights.length + delegations.length + judgments.length + reminders.length + decisionCount > 0;
  return <main className="page-workspace people-page">
    {ORGANIC_VISUAL_URL && <img className="organic-visual organic-visual-people" src={ORGANIC_VISUAL_URL} alt="" aria-hidden="true" />}
    <header className="people-heading"><div><button type="button" onClick={onBack}><ArrowLeft />返回洞察</button><p className="kicker">跨会议协作观察</p><h1>人与协作 <Sparkles aria-hidden="true" /></h1><p>只呈现有会议、行动或来源支撑的协作模式。</p></div></header>
    {hasEvidence ? <>
      {ownerInsights.length > 0 && <section className={`owner-insights tone-${feedbackTone}`}>
        <header><div><p className="kicker">本人工作镜像</p><h2>跨会议看你的工作方式</h2><p>只显示至少两场会议共同支持的模式；切换方式不会改变事实。</p></div><div className="feedback-tone-control"><span>建议方式</span><div role="group" aria-label="选择建议方式">{FEEDBACK_TONES.map((tone) => <button aria-pressed={feedbackTone === tone.key} className={feedbackTone === tone.key ? 'active' : ''} key={tone.key} type="button" onClick={() => setFeedbackTone(tone.key)}>{tone.label}</button>)}</div></div></header>
        <div className="owner-insight-grid">{ownerInsights.map(({ insight, series, meetingId }, index) => {
          const meta = OWNER_INSIGHT_META[insight.dimension];
          const InsightIcon = meta.icon;
          return <article className={`owner-insight-card insight-${insight.dimension}`} key={`${insight.id}-${series.id}`}><header><span><InsightIcon aria-hidden="true" /></span><small>{String(index + 1).padStart(2, '0')} · {meta.label}</small><em>{insight.evidenceExternalKeys.length} 场依据</em></header><strong>{insight.observation}</strong><div className="owner-insight-advice"><small>{activeTone.adviceLabel}</small><p>{insight.advice[feedbackTone]}</p></div>{meetingId && <button type="button" onClick={() => onOpenMeeting(meetingId)}><span>{series.label}</span><ArrowRight aria-hidden="true" /></button>}</article>;
        })}</div>
      </section>}
      <div className="collaboration-columns">
        {delegations.length > 0 && <section className="collaboration-lane lane-delegate"><header><span><UserRoundCheck aria-hidden="true" /></span><div><h2>可向下授权</h2><p>重复出现、边界相对稳定的工作</p></div><strong>{delegations.length}</strong></header><div>{delegations.map((group) => <button key={group.key} type="button" onClick={() => onOpenMeeting(group.actions[0].meetingId)}><span><small>近期待办 · {group.actions.length} 次</small><strong>{group.actions[0].title}</strong><em>{group.actions[0].meetingTitle}</em></span><ArrowRight /></button>)}</div></section>}
        {judgments.length > 0 && <section className="collaboration-lane lane-judgment"><header><span><Brain aria-hidden="true" /></span><div><h2>需要你亲自判断</h2><p>影响范围或边界仍待确认</p></div><strong>{judgments.length}</strong></header><div>{judgments.map((action) => <button key={action.id} type="button" onClick={() => onOpenMeeting(action.meetingId)}><span><small>等待确认</small><strong>{action.title}</strong><em>{action.dependency || action.meetingTitle}</em></span><ArrowRight /></button>)}</div></section>}
        {reminders.length > 0 && <section className="collaboration-lane lane-reminder"><header><span><MessageCircleMore aria-hidden="true" /></span><div><h2>沟通提醒</h2><p>有明确依赖、尚未闭环的事项</p></div><strong>{reminders.length}</strong></header><div>{reminders.map((action) => <button key={action.id} type="button" onClick={() => onOpenMeeting(action.meetingId)}><span><small>{action.dueAt ? format(new Date(action.dueAt), 'M 月 d 日前') : '仍在等待'}</small><strong>{action.title}</strong><em>{action.dependency}</em></span><ArrowRight /></button>)}</div></section>}
      </div>
      <section className="collaboration-portrait"><header><div><p className="kicker">近 180 天素材</p><h2>协作画像</h2></div><span>不是评分，只是可回溯的工作痕迹</span></header><div className="portrait-river"><article><span><Layers3 /></span><small>会议脉络</small><strong>{meetings.filter((meeting) => meeting.recordType === 'minutes').length}</strong><p>场已同步记录</p></article><article><span><Brain /></span><small>决策素材</small><strong>{decisionCount}</strong><p>条明确决定</p></article><article><span><FileText /></span><small>交付表达</small><strong>{deliverableCount}</strong><p>项产物或交付</p></article><article><span><Link2 /></span><small>来源网络</small><strong>{sourceCount}</strong><p>个可追溯入口</p></article></div></section>
    </> : <div className="people-empty"><UsersRound aria-hidden="true" /><h2>还没有足够的协作证据</h2><p>当同类工作、确认事项或明确依赖反复出现时，这里才会形成视角。</p><Button variant="outline" onClick={onBack}>回到洞察</Button></div>}
  </main>;
}
