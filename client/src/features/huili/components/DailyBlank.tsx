import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowRight,
  Check,
  CircleHelp,
  Link2,
  MessageCircleMore,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  Tags,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';

import type {
  DailyBlankCompositionElement,
  DailyBlankDisposition,
  DailyBlankDrawRequest,
  DailyBlankFeedback,
  DailyBlankSnapshot,
  DailyBlankVisualSnapshot,
  MeetingRecord,
} from '@shared/api.interface';
import {
  dailyBlankProseParagraphs,
  dailyBlankTakeoverParagraphs,
  isDailyBlankTakeover,
} from '../daily-blank-takeover';
import { getDailyBlankAssetUrl } from '@/api';
import { dailyBlankAssetFileName } from '../daily-blank-assets';

const FEEDBACK_OPTIONS: Array<{
  key: DailyBlankFeedback;
  label: string;
  icon?: typeof Check;
}> = [
  { key: 'missed', label: '没打中' },
  { key: 'useful', label: '有用', icon: Check },
  { key: 'surprising', label: '让我意外', icon: Sparkles },
];

const SUGGESTED_TAGS = [
  '决策提醒',
  '反常识',
  '工作方式',
  '关系线索',
  '值得追问',
];

function dateLabel(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(month)} 月 ${Number(day)} 日`;
}

function blankConversationPrompt(blank: DailyBlankSnapshot): string {
  return blank.conversationStarter
    || `沿着留白“${blank.title ?? ''}”继续聊，让这个有意思的细节或联想再展开一点。区分真实依据和创作联想，不必强行落到工作建议。`;
}

function blankElementPrompt(
  blank: DailyBlankSnapshot,
  element: DailyBlankCompositionElement,
  related: DailyBlankCompositionElement[],
): string {
  if (element.prompt) return element.prompt;
  const subject = element.label || element.text.slice(0, 36);
  const relatedLabels = related
    .map((item) => item.label || item.text.slice(0, 24))
    .join('、');
  return [
    `继续沿今日留白“${blank.title ?? ''}”中的“${subject}”往下聊。`,
    relatedLabels ? `请重点核对它与“${relatedLabels}”的关系。` : '',
    '展开其中值得好奇的细节或联想，保留可回溯依据，并把创作联想和事实分开。不必强行转成会议行动。',
  ].filter(Boolean).join('');
}

function DailyBlankVisual({ visual }: { visual: DailyBlankVisualSnapshot }) {
  const fileName = dailyBlankAssetFileName(visual.imageUrl);
  const [attempt, setAttempt] = useState(0);
  const [imageUrl, setImageUrl] = useState<string>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setImageUrl(undefined);
    const request = fileName ? getDailyBlankAssetUrl(fileName) : Promise.resolve(visual.imageUrl);
    void request.then((url) => {
      if (!cancelled) setImageUrl(url);
    }).catch(() => {
      if (!cancelled) setStatus('error');
    });
    return () => { cancelled = true; };
  }, [visual.imageUrl, fileName, attempt]);

  const isAtmosphere = visual.placement === 'atmosphere';
  return (
    <figure
      aria-label={isAtmosphere ? visual.alt : undefined}
      className={`daily-blank-visual is-${visual.placement} is-${status}`}
      role={isAtmosphere ? 'img' : undefined}
    >
      {!isAtmosphere && status !== 'ready' && (
        <div className="daily-blank-visual-status" role="status">
          <span>{status === 'loading' ? '正在加载图片…' : '图片没有加载出来'}</span>
          {status === 'error' && (
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>重新加载图片</button>
          )}
        </div>
      )}
      {imageUrl && status !== 'error' && (
        <img
          alt={isAtmosphere ? '' : visual.alt}
          aria-hidden={isAtmosphere ? 'true' : undefined}
          loading="lazy"
          src={imageUrl}
          onLoad={() => setStatus('ready')}
          onError={() => {
            // A tab can outlive its signed URL. Renew once before offering retry.
            if (fileName && attempt === 0) setAttempt(1);
            else setStatus('error');
          }}
        />
      )}
    </figure>
  );
}

function canvasDocument(markup: string): string {
  return [
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src \'none\'; font-src \'none\'; connect-src \'none\'; media-src \'none\'; object-src \'none\'; frame-src \'none\'; form-action \'none\'; base-uri \'none\'">',
    '<style>:root{color-scheme:light}*{box-sizing:border-box}html,body{min-height:100%;margin:0;background:transparent}body{overflow-x:hidden;overflow-y:auto;color:#332824;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}button,input,textarea,select{font:inherit}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}</style>',
    '</head><body>',
    markup,
    // Empty summaries are used as CSS artwork toggles; keep their closed cover visible.
    '<style>details:has(>summary:empty)::details-content{content-visibility:visible}summary:empty::after{content:attr(aria-label);font-size:12px;line-height:1.5}</style>',
    '</body></html>',
  ].join('');
}

function DailyBlankArtwork({
  blank,
  onContinue,
  takeover = false,
}: {
  blank: DailyBlankSnapshot;
  onContinue: (prompt: string) => void;
  takeover?: boolean;
}) {
  const [activeElementId, setActiveElementId] = useState<string>();
  const composition = blank.composition;
  const canvasSrcDoc = useMemo(
    () => blank.canvas ? canvasDocument(blank.canvas.markup) : undefined,
    [blank.canvas],
  );

  useEffect(() => {
    setActiveElementId(undefined);
  }, [blank.id]);

  if (blank.canvas && canvasSrcDoc) {
    return (
      <div className="daily-blank-artwork daily-blank-artwork-canvas">
        <h2 className="sr-only" id="daily-blank-title">{blank.title}</h2>
        <iframe
          className={`daily-blank-canvas is-${blank.canvas.height}`}
          loading="lazy"
          sandbox=""
          srcDoc={canvasSrcDoc}
          title={blank.canvas.ariaLabel}
        />
      </div>
    );
  }

  if (takeover) {
    const paragraphs = dailyBlankTakeoverParagraphs(blank);
    return (
      <div className={[
        'daily-blank-artwork',
        'daily-blank-artwork-fallback',
        blank.visual ? `has-visual visual-${blank.visual.placement}` : '',
      ].filter(Boolean).join(' ')}>
        {blank.visual?.placement === 'atmosphere' && <DailyBlankVisual key={blank.visual.imageUrl} visual={blank.visual} />}
        <h2 id="daily-blank-title">{blank.title}</h2>
        {blank.visual?.placement === 'centerpiece' && <DailyBlankVisual key={blank.visual.imageUrl} visual={blank.visual} />}
        <div className="daily-blank-content">
          {paragraphs.map((paragraph: string, index: number) => (
            <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
          ))}
        </div>
      </div>
    );
  }

  if (!composition) {
    const paragraphs = dailyBlankProseParagraphs(blank.content);
    const activeParagraphIndex = activeElementId?.startsWith('paragraph-')
      ? Number(activeElementId.slice('paragraph-'.length))
      : -1;
    const activeParagraph = paragraphs[activeParagraphIndex];
    return (
      <div className={[
        'daily-blank-artwork',
        'daily-blank-artwork-fallback',
        blank.visual ? `has-visual visual-${blank.visual.placement}` : '',
      ].filter(Boolean).join(' ')}>
        {blank.visual?.placement === 'atmosphere' && <DailyBlankVisual key={blank.visual.imageUrl} visual={blank.visual} />}
        <h2 id="daily-blank-title">{blank.title}</h2>
        {blank.visual?.placement === 'centerpiece' && <DailyBlankVisual key={blank.visual.imageUrl} visual={blank.visual} />}
        <div className={`daily-blank-content${activeParagraph ? ' has-selection' : ''}`}>
          {paragraphs.map((paragraph, index) => (
            <button
              aria-label={`展开“${paragraph.slice(0, 24)}”`}
              aria-pressed={activeParagraphIndex === index}
              className={activeParagraphIndex === index ? 'is-selected' : ''}
              key={`${index}-${paragraph.slice(0, 24)}`}
              type="button"
              onClick={() => setActiveElementId((current) => (
                current === `paragraph-${index}` ? undefined : `paragraph-${index}`
              ))}
            >
              {paragraph}
            </button>
          ))}
        </div>
        {activeParagraph && (
          <section className="daily-blank-element-focus daily-blank-fallback-focus" aria-live="polite">
            <header>
              <div>
                <small>从这一段继续</small>
                <strong>{activeParagraph.slice(0, 48)}</strong>
              </div>
              <button
                aria-label="收起当前内容"
                type="button"
                onClick={() => setActiveElementId(undefined)}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <button
              className="daily-blank-element-continue"
              type="button"
              onClick={() => onContinue(blankElementPrompt(blank, {
                id: `paragraph-${activeParagraphIndex}`,
                role: 'statement',
                text: activeParagraph,
                linksTo: [],
              }, []))}
            >
              沿这里继续<MessageCircleMore aria-hidden="true" />
            </button>
          </section>
        )}
      </div>
    );
  }
  const labelsById = new Map(composition.elements.map((element) => [
    element.id,
    element.label || element.text.slice(0, 18),
  ]));
  const activeElement = composition.elements.find((element) => element.id === activeElementId);
  const relatedElements = activeElement
    ? composition.elements.filter((element) => (
      activeElement.linksTo.includes(element.id) || element.linksTo.includes(activeElement.id)
    ))
    : [];
  const relatedIds = new Set(relatedElements.map((element) => element.id));
  return (
    <div className={[
      'daily-blank-artwork',
      `daily-blank-artwork-${composition.layout}`,
      blank.visual ? `has-visual visual-${blank.visual.placement}` : '',
    ].filter(Boolean).join(' ')}>
      {blank.visual?.placement === 'atmosphere' && <DailyBlankVisual key={blank.visual.imageUrl} visual={blank.visual} />}
      <div className="daily-blank-artwork-title">
        <span>{composition.formName}</span>
        <h2 id="daily-blank-title">{blank.title}</h2>
      </div>
      {blank.visual?.placement === 'centerpiece' && <DailyBlankVisual key={blank.visual.imageUrl} visual={blank.visual} />}
      <div className={`daily-blank-composition${activeElement ? ' has-selection' : ''}`}>
        {composition.elements.map((element, index) => (
          <button
            aria-label={`展开“${element.label || element.text.slice(0, 24)}”`}
            aria-pressed={activeElement?.id === element.id}
            className={[
              'daily-blank-element',
              `is-${element.role}`,
              `is-${element.emphasis ?? 'normal'}`,
              `lane-${element.lane ?? 2}`,
              activeElement?.id === element.id ? 'is-selected' : '',
              activeElement && relatedIds.has(element.id) ? 'is-connected' : '',
              activeElement && activeElement.id !== element.id && !relatedIds.has(element.id)
                ? 'is-receded'
                : '',
            ].filter(Boolean).join(' ')}
            key={element.id}
            type="button"
            onClick={() => setActiveElementId((current) => (
              current === element.id ? undefined : element.id
            ))}
          >
            <span className="daily-blank-element-index">{String(index + 1).padStart(2, '0')}</span>
            <div>
              {element.label && <small>{element.label}</small>}
              <p>{element.text}</p>
              {element.linksTo.length > 0 && (
                <span className="daily-blank-element-links">
                  {element.linksTo.map((id) => labelsById.get(id)).filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      {activeElement && (
        <section className="daily-blank-element-focus" aria-live="polite">
          <header>
            <div>
              <small>{composition.formName}</small>
              <strong>{activeElement.label || activeElement.text.slice(0, 48)}</strong>
            </div>
            <button
              aria-label="收起当前内容"
              type="button"
              onClick={() => setActiveElementId(undefined)}
            >
              <X aria-hidden="true" />
            </button>
          </header>
          {activeElement.detail && <p>{activeElement.detail}</p>}
          {relatedElements.length > 0 && (
            <div className="daily-blank-element-related">
              <span>相连</span>
              {relatedElements.map((element) => (
                <button key={element.id} type="button" onClick={() => setActiveElementId(element.id)}>
                  {element.label || element.text.slice(0, 28)}
                </button>
              ))}
            </div>
          )}
          <button
            className="daily-blank-element-continue"
            type="button"
            onClick={() => onContinue(blankElementPrompt(blank, activeElement, relatedElements))}
          >
            沿这里继续<MessageCircleMore aria-hidden="true" />
          </button>
        </section>
      )}
    </div>
  );
}

export function DailyBlank({
  dailyBlank,
  drawer,
  drawRequest,
  meetings,
  onOpenMeeting,
  onContinue,
  onFeedback,
  onSaveAndRedraw,
  onDisposition,
  onRefresh,
}: {
  dailyBlank?: DailyBlankSnapshot;
  drawer: DailyBlankSnapshot[];
  drawRequest?: DailyBlankDrawRequest;
  meetings: MeetingRecord[];
  onOpenMeeting: (meetingId: string) => void;
  onContinue: (prompt: string) => void;
  onFeedback: (feedback: DailyBlankFeedback) => Promise<void>;
  onSaveAndRedraw: (blankId: string, tags: string[]) => Promise<void>;
  onDisposition: (blankId: string, action: DailyBlankDisposition) => Promise<void>;
  onRefresh: () => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState<DailyBlankFeedback>();
  const [feedbackError, setFeedbackError] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [savingCard, setSavingCard] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [changingDisposition, setChangingDisposition] = useState<DailyBlankDisposition>();
  const [dispositionError, setDispositionError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hudOpen, setHudOpen] = useState(false);
  const [activeTag, setActiveTag] = useState('全部');
  const [expandedCardId, setExpandedCardId] = useState<string>();
  const [drawNow, setDrawNow] = useState(() => Date.now());

  useEffect(() => {
    if (drawRequest?.state !== 'pending') return undefined;
    setDrawNow(Date.now());
    const interval = window.setInterval(() => setDrawNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [drawRequest?.id, drawRequest?.state]);

  useEffect(() => {
    setShowWhy(false);
    setShowEvidence(false);
    setHudOpen(false);
    setTagging(false);
    setSelectedTags([]);
    setCustomTag('');
    setSaveError(false);
    setDispositionError('');
    setFeedbackError(false);
  }, [dailyBlank?.id, dailyBlank?.discardedAt]);

  useEffect(() => {
    if (!hudOpen || drawerOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setHudOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, hudOpen]);

  const meetingsByExternalKey = useMemo(
    () => new Map(meetings.map((meeting) => [meeting.externalKey, meeting])),
    [meetings],
  );
  const evidenceMeetings = useMemo(() => (
    (dailyBlank?.evidenceExternalKeys ?? [])
      .map((externalKey) => meetingsByExternalKey.get(externalKey))
      .filter((meeting): meeting is MeetingRecord => Boolean(meeting))
      .sort((left, right) => +new Date(right.startedAt) - +new Date(left.startedAt))
  ), [dailyBlank, meetingsByExternalKey]);
  const drawerTags = useMemo(() => Array.from(new Set(
    drawer.flatMap((card) => card.tags),
  )), [drawer]);
  const visibleDrawerCards = useMemo(
    () => activeTag === '全部'
      ? drawer
      : drawer.filter((card) => card.tags.includes(activeTag)),
    [activeTag, drawer],
  );

  const submitFeedback = async (feedback: DailyBlankFeedback) => {
    setSavingFeedback(feedback);
    setFeedbackError(false);
    try {
      await onFeedback(feedback);
    } catch {
      setFeedbackError(true);
    } finally {
      setSavingFeedback(undefined);
    }
  };

  const changeDisposition = async (action: DailyBlankDisposition) => {
    if (!dailyBlank) return;
    setChangingDisposition(action);
    setDispositionError('');
    try {
      await onDisposition(dailyBlank.id, action);
    } catch {
      setDispositionError(action === 'restore'
        ? '没有撤销成功，请重试；如果留白已更新，请刷新页面。'
        : '没有丢弃成功，请重试；如果留白已更新，请刷新页面。');
    } finally {
      setChangingDisposition(undefined);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((current) => current.includes(tag)
      ? current.filter((item) => item !== tag)
      : [...current, tag].slice(0, 5));
  };

  const saveAndDraw = async () => {
    const nextTags = Array.from(new Set([
      ...selectedTags,
      ...(customTag.trim() ? [customTag.trim().slice(0, 20)] : []),
    ])).slice(0, 5);
    setSavingCard(true);
    setSaveError(false);
    try {
      if (!dailyBlank) return;
      await onSaveAndRedraw(dailyBlank.id, nextTags);
      setTagging(false);
    } catch {
      setSaveError(true);
    } finally {
      setSavingCard(false);
    }
  };

  const drawerPanel = drawerOpen && (
    <div className="daily-blank-drawer-backdrop" role="presentation" onMouseDown={() => setDrawerOpen(false)}>
      <aside
        className="daily-blank-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-blank-drawer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="kicker">长期收藏</p>
            <h2 id="daily-blank-drawer-title">留白抽屉</h2>
            <span>{drawer.length} 件留白</span>
          </div>
          <button type="button" aria-label="关闭留白抽屉" onClick={() => setDrawerOpen(false)}>
            <X aria-hidden="true" />
          </button>
        </header>
        {drawerTags.length > 0 && (
          <nav className="daily-blank-drawer-tags" aria-label="按标签筛选">
            {['全部', ...drawerTags].map((tag) => (
              <button
                className={activeTag === tag ? 'is-selected' : ''}
                key={tag}
                type="button"
                aria-pressed={activeTag === tag}
                onClick={() => setActiveTag(tag)}
              >
                {tag}
              </button>
            ))}
          </nav>
        )}
        <div className="daily-blank-drawer-cards">
          {visibleDrawerCards.length > 0 ? visibleDrawerCards.map((card, index) => {
            const expanded = expandedCardId === card.id;
            const cardMeetings = card.evidenceExternalKeys
              .map((externalKey) => meetingsByExternalKey.get(externalKey))
              .filter((meeting): meeting is MeetingRecord => Boolean(meeting));
            return (
              <article className={expanded ? 'is-expanded' : ''} key={card.id}>
                <button
                  className="daily-blank-drawer-card-main"
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedCardId(expanded ? undefined : card.id)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <small>{dateLabel(card.date)}</small>
                    <strong>{card.title}</strong>
                    <p>{card.content}</p>
                    {card.tags.length > 0 && (
                      <div>{card.tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
                    )}
                  </div>
                  <ArrowRight aria-hidden="true" />
                </button>
                {expanded && (
                  <div className="daily-blank-drawer-card-detail">
                    {card.canvas && (
                      <iframe
                        className="daily-blank-drawer-canvas"
                        loading="lazy"
                        sandbox=""
                        srcDoc={canvasDocument(card.canvas.markup)}
                        title={card.canvas.ariaLabel}
                      />
                    )}
                    {card.visual && (
                      <img
                        alt={card.visual.alt}
                        className="daily-blank-drawer-visual"
                        loading="lazy"
                        src={card.visual.imageUrl}
                      />
                    )}
                    {card.whyNow && <p><strong>当时为什么出现</strong>{card.whyNow}</p>}
                    <div>
                      {cardMeetings.slice(0, 4).map((meeting) => (
                        <button key={meeting.id} type="button" onClick={() => onOpenMeeting(meeting.id)}>
                          {meeting.title}<ArrowRight aria-hidden="true" />
                        </button>
                      ))}
                      <button type="button" onClick={() => onContinue(blankConversationPrompt(card))}>
                        继续聊<MessageCircleMore aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          }) : (
            <div className="daily-blank-drawer-empty">
              <Archive aria-hidden="true" />
              <h3>这个标签下还没有留白</h3>
              <button type="button" onClick={() => setActiveTag('全部')}>查看全部</button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );

  if (!dailyBlank && drawRequest?.state === 'pending') {
    const elapsedSeconds = Math.max(0, Math.floor(
      (drawNow - new Date(drawRequest.requestedAt).getTime()) / 1_000,
    ));
    const canRefresh = elapsedSeconds >= 90;
    return (
      <>
        <section className="daily-blank daily-blank-drawing" aria-live="polite">
          <div className="daily-blank-deck" aria-hidden="true"><i /><i /><i /></div>
          <div>
            <p className="kicker">换个角度</p>
            <h2>正在重新生成</h2>
            <p>这一次会重新漫游、重新选题，也可能换一种呈现。你可以先离开，做好后会出现在此刻。</p>
            <small>
              {elapsedSeconds < 60
                ? '通常需要几分钟，完成后会自动出现'
                : `已等待 ${Math.floor(elapsedSeconds / 60)} 分 ${elapsedSeconds % 60} 秒`}
            </small>
          </div>
          <div className="daily-blank-drawing-actions">
            <button type="button" onClick={() => setDrawerOpen(true)}>
              <Archive aria-hidden="true" />打开抽屉 · {drawer.length}
            </button>
            {canRefresh && (
              <button type="button" onClick={onRefresh}>
                <RefreshCw aria-hidden="true" />刷新进度
              </button>
            )}
          </div>
        </section>
        {drawerPanel}
      </>
    );
  }

  if (!dailyBlank) return null;
  if (dailyBlank.discardedAt) {
    return (
      <>
        <section className="daily-blank daily-blank-discarded" aria-label="已丢弃的留白" aria-live="polite">
          <div>
            <p className="kicker">今日留白</p>
            <p>这件已丢弃。今天先留白也可以。</p>
          </div>
          <div className="daily-blank-actions">
            <button disabled={Boolean(changingDisposition)} type="button" onClick={() => void changeDisposition('restore')}>
              <Undo2 aria-hidden="true" />{changingDisposition === 'restore' ? '正在撤销…' : '撤销丢弃'}
            </button>
            <button disabled={Boolean(changingDisposition)} type="button" onClick={() => void changeDisposition('discard_and_redraw')}>
              <RefreshCw aria-hidden="true" />{changingDisposition === 'discard_and_redraw' ? '正在开始…' : '再来一件'}
            </button>
            {drawer.length > 0 && <button type="button" onClick={() => setDrawerOpen(true)}><Archive aria-hidden="true" />留白抽屉 · {drawer.length}</button>}
          </div>
          {dispositionError && <small role="alert">{dispositionError}</small>}
        </section>
        {drawerPanel}
      </>
    );
  }
  const takeover = isDailyBlankTakeover(dailyBlank);
  const whyPanel = showWhy && dailyBlank.whyNow && (
    <div className="daily-blank-reveal">
      <strong>为什么是现在</strong>
      <p>{dailyBlank.whyNow}</p>
    </div>
  );
  const evidencePanel = showEvidence && (
    <div className="daily-blank-reveal daily-blank-evidence">
      <strong>来自这些会议</strong>
      <div>
        {evidenceMeetings.map((meeting: MeetingRecord) => (
          <button key={meeting.id} type="button" onClick={() => onOpenMeeting(meeting.id)}>
            <span>{meeting.title}</span><ArrowRight aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
  const taggingPanel = tagging && (
    <div className="daily-blank-tagging" role="group" aria-labelledby="daily-blank-tagging-title">
      <header>
        <div><Tags aria-hidden="true" /><strong id="daily-blank-tagging-title">给这件留白贴个签</strong></div>
        <button type="button" aria-label="取消保存" onClick={() => setTagging(false)}><X /></button>
      </header>
      <p>下次可以按这些标签，从抽屉里把它找回来。</p>
      <div className="daily-blank-tag-options">
        {SUGGESTED_TAGS.map((tag: string) => (
          <button
            className={selectedTags.includes(tag) ? 'is-selected' : ''}
            key={tag}
            type="button"
            aria-pressed={selectedTags.includes(tag)}
            onClick={() => toggleTag(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
      <label>
        <span>自定义标签</span>
        <input
          maxLength={20}
          placeholder="例如：下次周会"
          value={customTag}
          onChange={(event) => setCustomTag(event.target.value)}
        />
      </label>
      <div className="daily-blank-tagging-actions">
        <small>{saveError ? '这件留白还没收好，请再试一次。' : '标签可以留空，最多保存 5 个。'}</small>
        <button disabled={savingCard || Boolean(changingDisposition) || Boolean(savingFeedback)} type="button" onClick={() => void saveAndDraw()}>
          {savingCard ? <RefreshCw className="is-spinning" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {savingCard ? '正在收好…' : '收好并再来一件'}
        </button>
      </div>
    </div>
  );
  const feedbackControls = (
    <>
      <span className="daily-blank-discard-actions">
        <button disabled={Boolean(changingDisposition) || Boolean(savingFeedback) || savingCard} type="button" onClick={() => void changeDisposition('discard')}>
          <Trash2 aria-hidden="true" />{changingDisposition === 'discard' ? '正在丢弃…' : '丢弃'}
        </button>
        <button disabled={Boolean(changingDisposition) || Boolean(savingFeedback) || savingCard} type="button" onClick={() => void changeDisposition('discard_and_redraw')}>
          <RefreshCw aria-hidden="true" />{changingDisposition === 'discard_and_redraw' ? '正在开始…' : '丢弃并再来一件'}
        </button>
      </span>
      <div>
        {FEEDBACK_OPTIONS.map(({
          key,
          label,
          icon: Icon,
        }: (typeof FEEDBACK_OPTIONS)[number]) => (
          <button
            className={dailyBlank.feedback === key ? 'is-selected' : ''}
            disabled={Boolean(savingFeedback) || Boolean(changingDisposition) || savingCard}
            key={key}
            type="button"
            aria-pressed={dailyBlank.feedback === key}
            onClick={() => void submitFeedback(key)}
          >
            {Icon && <Icon aria-hidden="true" />}
            {savingFeedback === key
              ? '保存中…'
              : label}
          </button>
        ))}
      </div>
      {feedbackError && <small role="alert">反馈没有保存，请再试一次。</small>}
      {dispositionError && <small role="alert">{dispositionError}</small>}
    </>
  );
  if (dailyBlank.state === 'quiet') {
    return (
      <>
        <section className="daily-blank daily-blank-quiet" aria-labelledby="daily-blank-title">
          <div className="daily-blank-mark"><Sparkles aria-hidden="true" /></div>
          <div>
            <p className="kicker">今日留白 · {dateLabel(dailyBlank.date)}</p>
            <h2 id="daily-blank-title">今天，先留一块空白</h2>
            <p>新的会议线索出现后，再看看有没有值得展开的东西。</p>
          </div>
          {drawer.length > 0 && (
            <button className="daily-blank-drawer-trigger" type="button" onClick={() => setDrawerOpen(true)}>
              <Archive aria-hidden="true" />留白抽屉 · {drawer.length}
            </button>
          )}
        </section>
        {drawerPanel}
      </>
    );
  }

  if (takeover) {
    return (
      <>
        <section className="daily-blank daily-blank-takeover" aria-labelledby="daily-blank-title">
          <header className="daily-blank-signature">
            <p className="kicker">今日留白</p>
            <time dateTime={dailyBlank.date}>{dateLabel(dailyBlank.date)}</time>
          </header>
          <DailyBlankArtwork
            blank={dailyBlank}
            onContinue={onContinue}
            takeover
          />
          <footer className="daily-blank-feedback" aria-label="今日留白反馈">
            {feedbackControls}
          </footer>
          <div className="daily-blank-hud">
            <button
              className="daily-blank-hud-toggle"
              type="button"
              aria-expanded={hudOpen}
              aria-controls="daily-blank-hud-menu"
              aria-haspopup="true"
              aria-label={hudOpen ? '关闭今日留白菜单' : '打开今日留白菜单'}
              onClick={() => setHudOpen((open: boolean) => !open)}
            >
              {hudOpen
                ? <X aria-hidden="true" />
                : <MoreHorizontal aria-hidden="true" />}
            </button>
            <div
              className="daily-blank-hud-menu"
              hidden={!hudOpen}
              id="daily-blank-hud-menu"
              role="region"
              aria-label="今日留白操作"
            >
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(true);
                  setHudOpen(false);
                }}
              >
                <Archive aria-hidden="true" />留白抽屉 · {drawer.length}
              </button>
              <button
                type="button"
                aria-expanded={showWhy}
                onClick={() => setShowWhy((value: boolean) => !value)}
              >
                <CircleHelp aria-hidden="true" />为什么现在给我看
              </button>
              <button
                type="button"
                aria-expanded={showEvidence}
                onClick={() => setShowEvidence((value: boolean) => !value)}
              >
                <Link2 aria-hidden="true" />查看依据
              </button>
              <button
                type="button"
                onClick={() => {
                  setHudOpen(false);
                  onContinue(blankConversationPrompt(dailyBlank));
                }}
              >
                <MessageCircleMore aria-hidden="true" />继续聊<ArrowRight aria-hidden="true" />
              </button>
              <button
                className="daily-blank-draw-button"
                type="button"
                onClick={() => {
                  setTagging(true);
                  setHudOpen(false);
                }}
              >
                <Archive aria-hidden="true" />收进抽屉，再来一件
              </button>
              {whyPanel}
              {evidencePanel}
            </div>
          </div>
          {taggingPanel}
        </section>
        {drawerPanel}
      </>
    );
  }

  return (
    <>
      <section className="daily-blank" aria-labelledby="daily-blank-title">
        <header className="daily-blank-header">
          <div>
            <p className="kicker">今日留白 · {dateLabel(dailyBlank.date)}</p>
            <span>今日第 {drawer.filter((card) => card.date === dailyBlank.date).length + 1} 件</span>
          </div>
          <button className="daily-blank-drawer-trigger" type="button" onClick={() => setDrawerOpen(true)}>
            <Archive aria-hidden="true" />留白抽屉 · {drawer.length}
          </button>
        </header>
        <DailyBlankArtwork blank={dailyBlank} onContinue={onContinue} />
        <div className="daily-blank-actions" aria-label="今日留白操作">
          <button type="button" aria-expanded={showWhy} onClick={() => setShowWhy((value) => !value)}>
            <CircleHelp aria-hidden="true" />为什么现在给我看
          </button>
          <button type="button" aria-expanded={showEvidence} onClick={() => setShowEvidence((value) => !value)}>
            <Link2 aria-hidden="true" />查看依据
          </button>
          <button type="button" onClick={() => onContinue(blankConversationPrompt(dailyBlank))}>
            <MessageCircleMore aria-hidden="true" />继续聊<ArrowRight aria-hidden="true" />
          </button>
          <button className="daily-blank-draw-button" type="button" onClick={() => setTagging(true)}>
            <Archive aria-hidden="true" />收进抽屉，再来一件
          </button>
        </div>
        {whyPanel}
        {evidencePanel}
        {taggingPanel}
        <footer className="daily-blank-feedback">
          {feedbackControls}
        </footer>
      </section>
      {drawerPanel}
    </>
  );
}
