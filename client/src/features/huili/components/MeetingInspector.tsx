import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  Bot,
  Check,
  ChevronRight,
  ExternalLink,
  EyeOff,
  FileText,
  Link2,
  ListChecks,
  Network,
  UserRound,
  WandSparkles,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  hasStructuredPreparationBrief,
  isPreparationCompletionNotice,
  parsePreparationBrief,
} from '../preparation-brief';
import type {
  ActionCategory,
  ActionResultLink,
  MeetingAction,
  MeetingRecord,
} from '@shared/api.interface';
import type { SeriesMembership } from '../series';
import type { MeetingActionHandlers } from '../types';

const STATUS_LABEL: Record<string, string> = {
  upcoming: '即将开始',
  ready: '已生成纪要',
  awaiting_confirmation: 'AI 可推进',
  in_progress: '推进中',
  done: '已完成',
  ignored: '已忽略',
  planned: '需要本人',
  queued: '已排队',
  claimed: '已领取',
  executing: '推进中',
  deferred: '已暂缓',
  cancelled: '不用做了',
  failed: '需检查',
};

const ACTION_GROUPS: Array<{
  category: ActionCategory;
  title: string;
  eyebrow: string;
  icon: typeof Bot;
}> = [
  { category: 'ai_direct', title: 'AI 已推进', eyebrow: '已授权', icon: Bot },
  {
    category: 'ai_after_confirm',
    title: 'AI 可推进',
    eyebrow: '确认范围后交给 AI',
    icon: ListChecks,
  },
  {
    category: 'user_owned',
    title: '需要本人',
    eyebrow: '需要你判断',
    icon: UserRound,
  },
];

export function statusTone(status: string): string {
  if (status === 'upcoming') return 'upcoming';
  if (status === 'done') return 'done';
  if (['in_progress', 'queued', 'claimed', 'executing'].includes(status))
    return 'executing';
  if (['deferred', 'cancelled', 'ignored'].includes(status)) return 'deferred';
  return 'pending';
}

export function formatMeetingTime(meeting: MeetingRecord): string {
  const start = new Date(meeting.startedAt);
  const end = meeting.endedAt ? new Date(meeting.endedAt) : undefined;
  return end
    ? `${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`
    : format(start, 'HH:mm');
}

function SourceLink({
  label,
  description,
  url,
}: {
  label: string;
  description: string;
  url?: string;
}) {
  if (!url) return null;
  return (
    <a className="source-link" href={url} target="_blank" rel="noreferrer">
      <span className="source-icon">
        <FileText aria-hidden="true" />
      </span>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <ExternalLink aria-hidden="true" />
    </a>
  );
}

function ResultLinks({ action }: { action: MeetingAction }) {
  const deliverables = action.resultLinks.filter(
    (link) => link.kind !== 'source',
  );
  if (deliverables.length === 0) return null;
  return (
    <div className="action-results" aria-label="完成产物">
      {deliverables.map((link) => (
        <a
          href={link.url}
          key={`${link.label}-${link.url}`}
          target="_blank"
          rel="noreferrer"
        >
          <Link2 aria-hidden="true" />
          <span>{link.label}</span>
          <ExternalLink aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

function PreparationBrief({
  action,
  onDeepPrepare,
}: {
  action: MeetingAction;
  onDeepPrepare: () => void;
}) {
  const running = ['queued', 'claimed', 'executing'].includes(action.status);
  const failed = action.status === 'failed';
  const incomplete = isPreparationCompletionNotice(action.evidenceSummary);
  const parsedSections = parsePreparationBrief(action.evidenceSummary);
  const sections =
    running || failed
      ? hasStructuredPreparationBrief(action.evidenceSummary)
        ? parsedSections
        : []
      : parsedSections;
  const documentRequested = ['会前准备文档', '完整会前准备文档'].includes(
    action.deliverable ?? '',
  );
  const documentReady =
    documentRequested &&
    action.resultLinks.some((link) => link.kind === 'deliverable');
  if (incomplete || ((failed || running) && !sections.length)) {
    return (
      <article
        className={`preparation-brief ${failed || incomplete ? 'is-failed' : 'is-running'}`}
      >
        <div className="preparation-brief-state">
          <span>
            {incomplete ? '内容不完整' : failed ? '准备暂停' : '正在整理'}
          </span>
          <strong>
            {incomplete
              ? '这次没有整理出能直接使用的内容。请点击“快速更新”再试一次。'
              : failed
                ? documentReady
                  ? '文档已创建，但完整内容暂未写完。可先打开文档，或重新开始深度准备。'
                  : documentRequested
                    ? '文档还没有创建成功，请重新开始深度准备。'
                    : '会前准备暂未完成，请重新准备。'
                : action.deliverable === '完整会前准备文档'
                  ? documentReady
                    ? '文档已创建，正在补齐你会上要定、要问和要带的内容'
                    : '正在创建文档'
                  : action.deliverable === '会前准备文档'
                    ? documentReady
                      ? '文档已创建，正在继续补充内容'
                      : '正在创建文档'
                    : '正在找出这场会最该讲清楚的事'}
          </strong>
        </div>
        <ResultLinks action={action} />
        {!failed && (
          <div
            className="progress-track"
            aria-label={`完成 ${action.progress}%`}
          >
            <i style={{ width: `${action.progress}%` }} />
          </div>
        )}
      </article>
    );
  }
  if (!sections.length) return null;
  return (
    <article className="preparation-brief">
      <div className="preparation-brief-topline">
        <span>精简预览</span>
        {action.dueAt && (
          <time>{format(new Date(action.dueAt), 'M 月 d 日 HH:mm')} 前</time>
        )}
      </div>
      {running && (
        <div className="preparation-refreshing" aria-live="polite">
          <span>
            {documentRequested
              ? action.deliverable === '完整会前准备文档'
                ? documentReady
                  ? '文档已创建，正在继续补充'
                  : '正在创建深度准备文档'
                : documentReady
                  ? '文档已创建，正在继续补充'
                  : '正在创建会前准备文档'
              : '正在更新预览'}
          </span>
          <div
            className="progress-track"
            aria-label={`完成 ${action.progress}%`}
          >
            <i style={{ width: `${action.progress}%` }} />
          </div>
        </div>
      )}
      {failed && (
        <div className="preparation-refreshing is-failed" role="alert">
          <span>深度准备未完成，原简报已保留</span>
          <strong>可先继续使用以下内容，或重新开始深度准备。</strong>
        </div>
      )}
      <div className="preparation-brief-grid">
        {sections.map((section) => (
          <section
            className={section.title === '今天必须定' ? 'is-primary' : ''}
            key={section.title}
          >
            <h4>{section.title}</h4>
            <ul>
              {section.items.map((item, index) => (
                <li key={`${section.title}-${index}`}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <ResultLinks action={action} />
      {action.status === 'done' && !documentReady && (
        <Button
          className="preparation-export"
          variant="ghost"
          size="sm"
          onClick={onDeepPrepare}
        >
          <WandSparkles aria-hidden="true" />
          展开为深度会前准备
        </Button>
      )}
    </article>
  );
}

function uniqueRelatedSources(actions: MeetingAction[]): ActionResultLink[] {
  const seen = new Set<string>();
  return actions
    .flatMap((action) => action.resultLinks)
    .filter((link) => {
      if (link.kind !== 'source' || seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    });
}

export function ActionItem({
  action,
  index,
  onConfirm,
  onDefer,
  onCancel,
  onComplete,
}: { action: MeetingAction; index: number } & MeetingActionHandlers) {
  const canConfirm =
    action.category === 'ai_after_confirm' &&
    action.status === 'awaiting_confirmation';
  const canComplete =
    action.category === 'user_owned' &&
    !['done', 'deferred', 'cancelled'].includes(action.status);
  const canCancel =
    !action.actionId.startsWith('prep:auto:') &&
    ['planned', 'awaiting_confirmation', 'failed'].includes(action.status);
  return (
    <article className="action-item">
      <div className="action-topline">
        <span className="action-index">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h4>{action.title}</h4>
        <span className={`action-state ${statusTone(action.status)}`}>
          {action.actionId.startsWith('capture:') && action.status === 'awaiting_confirmation'
            ? '待对齐' : STATUS_LABEL[action.status] ?? action.status}
        </span>
      </div>
      {action.description && (
        <p className="action-description">{action.description}</p>
      )}
      {(action.deliverable || action.dueAt || action.dependency) && (
        <div className="action-meta">
          {action.deliverable && <span>交付：{action.deliverable}</span>}
          {action.dueAt && (
            <span>
              目标：{format(new Date(action.dueAt), 'M 月 d 日 HH:mm')}
            </span>
          )}
          {action.dependency && <span>依赖：{action.dependency}</span>}
        </div>
      )}
      {action.evidenceSummary && (
        <p className="action-evidence">{action.actionId.startsWith('capture:') ? '任务进展：' : '完成说明：'}{action.evidenceSummary}</p>
      )}
      <ResultLinks action={action} />
      {['queued', 'claimed', 'executing', 'done'].includes(action.status) && (
        <div className="progress-track" aria-label={`完成 ${action.progress}%`}>
          <i style={{ width: `${action.progress}%` }} />
        </div>
      )}
      {(canConfirm || canComplete || canCancel) && (
        <div className="action-buttons">
          {canConfirm && (
            <Button variant="ghost" size="sm" onClick={() => onDefer(action)}>
              暂缓
            </Button>
          )}
          {canCancel && (
            <Button
              className="cancel-action-button"
              variant="ghost"
              size="sm"
              onClick={() => onCancel(action)}
            >
              不用做了
            </Button>
          )}
          {canConfirm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onConfirm(action)}
            >
              交给 AI 推进
            </Button>
          )}
          {canComplete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onComplete(action)}
            >
              <Check />
              完成待办
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

export function MeetingInspector({
  meeting,
  series,
  onClose,
  onConfirm,
  onDefer,
  onCancel,
  onComplete,
  onPrepareQuick,
  onPrepareDeep,
  onOpenSeries,
  onIgnoreActions,
  onIgnoreMeeting,
  onAddAiTask,
  projectLinks = [],
  onOpenProject,
}: {
  meeting: MeetingRecord;
  series?: SeriesMembership;
  onClose: () => void;
  onPrepareQuick: (meeting: MeetingRecord) => void;
  onPrepareDeep: (meeting: MeetingRecord) => void;
  onOpenSeries: (seriesId: string) => void;
  onIgnoreActions: (meeting: MeetingRecord) => void;
  onIgnoreMeeting: (meeting: MeetingRecord) => void;
  onAddAiTask: (meeting: MeetingRecord) => void;
  projectLinks?: Array<{ id: string; name: string }>;
  onOpenProject?: (id: string) => void;
} & MeetingActionHandlers) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, { materials: boolean; distillation: boolean }>
  >({});
  const state = expandedSections[meeting.id] ?? {
    materials: false,
    distillation: false,
  };
  const toggle = (section: 'materials' | 'distillation') =>
    setExpandedSections((current) => {
      const currentMeetingState = current[meeting.id] ?? {
        materials: false,
        distillation: false,
      };
      return {
        ...current,
        [meeting.id]: {
          ...currentMeetingState,
          [section]: !currentMeetingState[section],
        },
      };
    });
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [meeting.id]);
  const start = new Date(meeting.startedAt);
  const isScheduled = meeting.recordType === 'scheduled';
  const preparation = meeting.actions.find((action) =>
    action.actionId.startsWith('prep:auto:'),
  );
  const preparationRunning = preparation
    ? ['queued', 'claimed', 'executing'].includes(preparation.status)
    : false;
  const preparationReady = preparation?.status === 'done';
  const preparationFailed = preparation?.status === 'failed';
  const preparationHasBrief = preparation
    ? hasStructuredPreparationBrief(preparation.evidenceSummary)
    : false;
  const preparationDocumentReady = preparation
    ? ['会前准备文档', '完整会前准备文档'].includes(
        preparation.deliverable ?? '',
      ) && preparation.resultLinks.some((link) => link.kind === 'deliverable')
    : false;
  const preparationTitle = preparationRunning
    ? preparation?.deliverable === '完整会前准备文档'
      ? preparationDocumentReady
        ? '文档已创建，正在继续补充'
        : '正在创建深度准备文档'
      : preparation?.deliverable === '会前准备文档'
        ? preparationDocumentReady
          ? '文档已创建，正在继续补充'
          : '正在创建会前准备文档'
        : '正在整理会前简报'
    : preparationReady
      ? preparationDocumentReady
        ? preparation?.deliverable === '完整会前准备文档'
          ? '深度准备已完成'
          : '会前简报已导出'
        : '会前简报已更新'
      : preparationFailed
        ? preparationHasBrief
          ? '深度准备未完成，原简报已保留'
          : '会前准备需要重新开始'
        : '快速看摘要，需要时再展开';
  const relatedSources = uniqueRelatedSources(meeting.actions);
  const sourceCount =
    Object.values(meeting.sourceLinks).filter(Boolean).length +
    relatedSources.length;
  const otherPreparationActions = meeting.actions.filter(
    (action) =>
      action.id !== preparation?.id &&
      !['deferred', 'cancelled'].includes(action.status),
  );
  const visibleMeetingActions = meeting.actions.filter(
    (action) => !['deferred', 'cancelled'].includes(action.status),
  );
  const ignorableActionCount = meeting.actions.filter(
    (action) =>
      !action.actionId.startsWith('prep:auto:') &&
      ['planned', 'awaiting_confirmation', 'failed'].includes(action.status),
  ).length;
  const ignoredActionCount = meeting.actions.filter(
    (action) => action.status === 'deferred',
  ).length;
  const conclusionMeta = [
    meeting.decisions.length ? `${meeting.decisions.length} 条已确定` : '',
    meeting.risks.length ? `${meeting.risks.length} 条待确认` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const distillationMeta =
    conclusionMeta ||
    (meeting.durationMinutes !== undefined
      ? `${meeting.durationMinutes} 分钟`
      : '已提炼');
  return (
    <aside className="meeting-inspector" aria-label="会议详情">
      <button
        className="inspector-close"
        type="button"
        aria-label="收起会议详情"
        onClick={onClose}
      >
        <X />
      </button>
      <div className="inspector-scroll" ref={scrollRef}>
        <header className="meeting-header">
          <div className="meeting-meta">
            <span>{format(start, 'M 月 d 日')}</span>
            <i />
            <span>{formatMeetingTime(meeting)}</span>
            {meeting.project && (
              <>
                <i />
                <span>{meeting.project}</span>
              </>
            )}
          </div>
          <div className="meeting-title-row">
            <h2>{meeting.title}</h2>
            <span className={`status-pill ${statusTone(meeting.status)}`}>
              {isScheduled && meeting.invitationStatus === 'invited'
                ? '待回复'
                : (STATUS_LABEL[meeting.status] ?? meeting.status)}
            </span>
          </div>
          {projectLinks.map(project => <button className="meeting-series-link" type="button" key={project.id} onClick={() => onOpenProject?.(project.id)}>
            <Link2 aria-hidden="true" /><span><small>关联项目</small><strong>{project.name}</strong></span><ChevronRight aria-hidden="true" />
          </button>)}
          {series && (
            <button
              className="meeting-series-link"
              type="button"
              onClick={() => onOpenSeries(series.id)}
            >
              <Network aria-hidden="true" />
              <span>
                <small>
                  {series.alternatives.length > 0
                    ? `关联 ${series.alternatives.length + 1} 个连续主题`
                    : '属于系列会议'}
                </small>
                <strong>
                  {series.label} · {series.count} 场
                </strong>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          )}
        </header>
        {isScheduled && (
          <section className="summary-block">
            <div className="summary-label">
              <span>{isScheduled ? '会前信息' : '整体结论'}</span>
              {meeting.durationMinutes !== undefined && (
                <span>{meeting.durationMinutes} 分钟</span>
              )}
            </div>
            <h3>{meeting.headline}</h3>
            {meeting.summary && <p>{meeting.summary}</p>}
          </section>
        )}
        {isScheduled && (
          <section className="preparation-section">
            <div className="section-heading">
              <div>
                <p className="kicker">
                  <WandSparkles aria-hidden="true" />
                  会前准备
                </p>
                <h3>{preparationTitle}</h3>
              </div>
              {!preparationRunning && (
                <div className="preparation-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPrepareQuick(meeting)}
                  >
                    {preparation ? '快速更新' : '快速准备'}
                  </Button>
                  <Button
                    className="preparation-deep-action"
                    size="sm"
                    onClick={() => onPrepareDeep(meeting)}
                  >
                    <WandSparkles aria-hidden="true" />
                    深度准备
                  </Button>
                </div>
              )}
            </div>
            {preparation && (
              <PreparationBrief
                action={preparation}
                onDeepPrepare={() => onPrepareDeep(meeting)}
              />
            )}
            {otherPreparationActions.length > 0 && (
              <div className="action-list">
                {otherPreparationActions.map((action, index) => (
                  <ActionItem
                    key={action.id}
                    action={action}
                    index={index}
                    onConfirm={onConfirm}
                    onDefer={onDefer}
                    onCancel={onCancel}
                    onComplete={onComplete}
                  />
                ))}
              </div>
            )}
            {!preparation && otherPreparationActions.length === 0 && (
              <p className="preparation-empty">
                临近会议时，将自动整理历史会议、已授权聊天和相关资料；也可以现在开始。
              </p>
            )}
          </section>
        )}
        {!isScheduled && (
          <section className="actions-section">
            {ignorableActionCount > 0 && (
              <div className="meeting-actions-toolbar">
                <span>{ignorableActionCount} 项待处理</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onIgnoreActions(meeting)}
                >
                  <EyeOff aria-hidden="true" />
                  忽略本场待办
                </Button>
              </div>
            )}
            {ACTION_GROUPS.map((group) => {
              const actions = visibleMeetingActions.filter(
                (action) => action.category === group.category,
              );
              if (!actions.length) return null;
              const Icon = group.icon;
              return (
                <div
                  className={`action-group action-group-${group.category}`}
                  key={group.category}
                >
                  <div className="section-heading action-heading">
                    <div>
                      <p className="kicker">
                        <Icon aria-hidden="true" />
                        {group.eyebrow}
                      </p>
                      <h3>{group.title}</h3>
                    </div>
                    <span>{actions.length} 项</span>
                  </div>
                  <div className="action-list">
                    {actions.map((action, index) => (
                      <ActionItem
                        key={action.id}
                        action={action}
                        index={index}
                        onConfirm={onConfirm}
                        onDefer={onDefer}
                        onCancel={onCancel}
                        onComplete={onComplete}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {!visibleMeetingActions.length && (
              <p className="no-actions">
                {ignoredActionCount > 0
                  ? `已忽略本场 ${ignoredActionCount} 项待办。`
                  : '这场记录没有需要继续推进的事项。'}
              </p>
            )}
          </section>
        )}
        <section className="meeting-ai-task-action">
          <span className="meeting-ai-task-icon">
            <Bot aria-hidden="true" />
          </span>
          <span>
            <strong>这场会还有事要交给 AI？</strong>
            <small>补充一项具体任务，确认后进入本机推进。</small>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddAiTask(meeting)}
          >
            额外交给 AI
          </Button>
        </section>
        {!isScheduled && (
          <section
            className={`reference-section ${state.distillation ? 'is-open' : ''}`}
          >
            <button
              aria-controls={`meeting-distillation-${meeting.id}`}
              aria-expanded={state.distillation}
              className="reference-summary"
              type="button"
              onClick={() => toggle('distillation')}
            >
              <span className="reference-title">
                <ChevronRight aria-hidden="true" />
                <strong>讨论结论</strong>
              </span>
              <span className="reference-meta">
                {distillationMeta}
                <span className="reference-toggle" aria-hidden="true" />
              </span>
            </button>
            {state.distillation && (
              <div
                className="reference-body distillation-body"
                id={`meeting-distillation-${meeting.id}`}
              >
                <h3>{meeting.headline}</h3>
                {meeting.summary && <p>{meeting.summary}</p>}
                {(meeting.decisions.length > 0 || meeting.risks.length > 0) && (
                  <div className="facts-section distillation-facts">
                    {meeting.decisions.length > 0 && (
                      <div className="fact-group">
                        <h3>已经确定</h3>
                        <ul>
                          {meeting.decisions.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {meeting.risks.length > 0 && (
                      <div className="fact-group risk-group">
                        <h3>还卡在哪里</h3>
                        <ul>
                          {meeting.risks.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}
        {sourceCount > 0 && (
          <section
            className={`reference-section ${state.materials ? 'is-open' : ''}`}
          >
            <button
              aria-controls={`meeting-materials-${meeting.id}`}
              aria-expanded={state.materials}
              className="reference-summary"
              type="button"
              onClick={() => toggle('materials')}
            >
              <span className="reference-title">
                <ChevronRight aria-hidden="true" />
                <strong>会议资料</strong>
              </span>
              <span className="reference-meta">
                {sourceCount} 项
                <span className="reference-toggle" aria-hidden="true" />
              </span>
            </button>
            {state.materials && (
              <div
                className="reference-body"
                id={`meeting-materials-${meeting.id}`}
              >
                <p className="reference-note">
                  相关资料来自你有权查看的飞书内容；打开后仍按原权限查看。
                </p>
                <div className="source-links">
                  {relatedSources.map((source) => (
                    <SourceLink
                      key={source.url}
                      label={source.label}
                      description={source.description || '与本场会议直接相关'}
                      url={source.url}
                    />
                  ))}
                  <SourceLink
                    label="日程详情"
                    description="查看参会信息与日程更新"
                    url={meeting.sourceLinks.calendarEvent}
                  />
                  <SourceLink
                    label="加入会议"
                    description="打开飞书会议入口"
                    url={meeting.sourceLinks.joinMeeting}
                  />
                  <SourceLink
                    label="原始妙记"
                    description="查看原始录音与妙记"
                    url={meeting.sourceLinks.originalMinutes}
                  />
                  <SourceLink
                    label="智能纪要"
                    description="查看飞书生成版本"
                    url={meeting.sourceLinks.smartMinutes}
                  />
                  <SourceLink
                    label="文字记录"
                    description="回到原始上下文"
                    url={meeting.sourceLinks.transcript}
                  />
                  <SourceLink
                    label="行动纪要"
                    description="查看整理后的版本"
                    url={meeting.sourceLinks.generatedDocument}
                  />
                  <SourceLink
                    label="Agent 跟进"
                    description="继续讨论或补充要求"
                    url={meeting.sourceLinks.agentFollowup}
                  />
                </div>
              </div>
            )}
          </section>
        )}
        <section className="meeting-visibility-action">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onIgnoreMeeting(meeting)}
          >
            <EyeOff aria-hidden="true" />
            忽略这场会议
          </Button>
          <p>从会里各处隐藏，不删除飞书原始记录。</p>
        </section>
      </div>
    </aside>
  );
}
