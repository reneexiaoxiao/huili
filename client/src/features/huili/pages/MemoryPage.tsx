import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ArrowRight, BookOpen, Brain, CalendarDays, CircleAlert, FileText, GitBranch, Link2, Network, Search, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { MeetingRecord } from '@shared/api.interface';
import {
  buildMemoryEntries,
  buildMemoryGraphEdges,
  filterMemoryEntries,
  memoryKindLabel,
  selectMemoryGraphEntries,
  type MemoryFilter,
  type MemoryKind,
} from '../memory';
import type { SeriesCandidate } from '../series';

const ORGANIC_VISUAL_URL = '';
const KIND_ICONS: Record<MemoryKind, typeof BookOpen> = {
  thread: Network,
  decision: GitBranch,
  risk: CircleAlert,
  artifact: FileText,
  meeting: CalendarDays,
};

const MEMORY_GRAPH_POSITIONS = [
  { x: 50, y: 50 },
  { x: 15, y: 18 },
  { x: 50, y: 14 },
  { x: 84, y: 20 },
  { x: 89, y: 50 },
  { x: 83, y: 81 },
  { x: 50, y: 86 },
  { x: 17, y: 82 },
  { x: 10, y: 51 },
];

function graphPath(source: { x: number; y: number }, target: { x: number; y: number }, index: number): string {
  const startX = source.x * 10;
  const startY = source.y * 6.8;
  const endX = target.x * 10;
  const endY = target.y * 6.8;
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.hypot(dx, dy) || 1;
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const sweep = [38, -48, 56, -34, 45, -58, 30][index % 7];
  return `M ${startX} ${startY} C ${startX + dx * 0.28 + normalX * sweep} ${startY + dy * 0.28 + normalY * sweep}, ${startX + dx * 0.72 + normalX * sweep} ${startY + dy * 0.72 + normalY * sweep}, ${endX} ${endY}`;
}

export function MemoryPage({
  meetings,
  seriesCandidates,
  seriesLoading,
  seriesError,
  onOpenMeeting,
  onOpenSeries,
  onExplore,
  onOpenCalendar,
}: {
  meetings: MeetingRecord[];
  seriesCandidates: SeriesCandidate[];
  seriesLoading: boolean;
  seriesError?: string;
  onOpenMeeting: (meetingId: string) => void;
  onOpenSeries: (seriesId: string) => void;
  onExplore: (prompt: string) => void;
  onOpenCalendar: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MemoryFilter>('all');
  const [selectedId, setSelectedId] = useState<string>();
  const detailRef = useRef<HTMLElement>(null);
  const entries = useMemo(() => buildMemoryEntries(meetings, seriesCandidates), [meetings, seriesCandidates]);
  const filtered = useMemo(() => filterMemoryEntries(entries, query, filter), [entries, filter, query]);
  const graphEntries = useMemo(() => selectMemoryGraphEntries(filtered, selectedId), [filtered, selectedId]);
  const graphEdges = useMemo(() => buildMemoryGraphEdges(graphEntries), [graphEntries]);
  const graphPositions = useMemo(() => new Map(graphEntries.map((entry, index) => [entry.id, MEMORY_GRAPH_POSITIONS[index]])), [graphEntries]);
  const selected = graphEntries[0];
  const recordedMeetings = meetings.filter((meeting) => meeting.recordType !== 'scheduled');
  const availableKinds = (Object.keys(KIND_ICONS) as MemoryKind[]).filter((kind) => entries.some((entry) => entry.kind === kind));
  const oldest = recordedMeetings.reduce<MeetingRecord | undefined>((current, meeting) => (
    !current || +new Date(meeting.startedAt) < +new Date(current.startedAt) ? meeting : current
  ), undefined);

  useEffect(() => {
    setSelectedId(undefined);
  }, [filter, query]);

  useEffect(() => {
    if (!selectedId || window.matchMedia('(min-width: 921px)').matches) return;
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedId]);

  if (recordedMeetings.length === 0) {
    return <main className="page-workspace memory-page memory-page-empty">
      {ORGANIC_VISUAL_URL && <img className="organic-visual organic-visual-memory" src={ORGANIC_VISUAL_URL} alt="" aria-hidden="true" />}
      <BookOpen aria-hidden="true" />
      <p className="kicker">可回溯记录</p>
      <h1>会议同步后，记忆会从这里生长</h1>
      <p>纪要、决定、阻塞和产物进入你的个人空间后，才会形成可查找的索引。</p>
      <Button variant="outline" onClick={onOpenCalendar}>查看日历</Button>
    </main>;
  }

  return <main className="page-workspace memory-page">
    {ORGANIC_VISUAL_URL && <img className="organic-visual organic-visual-memory" src={ORGANIC_VISUAL_URL} alt="" aria-hidden="true" />}
    <header className="memory-heading">
      <div>
        <p className="kicker">你的会议线索库</p>
        <h1>记忆</h1>
        <p>把会议里形成的判断、阻塞、产物和连续主题留成可回看的线索。</p>
      </div>
      <div className="memory-range" aria-label="记忆覆盖范围">
        <span>{recordedMeetings.length}</span>
        <strong>场会议已收录</strong>
        <small>{oldest ? `最早可回溯至 ${format(new Date(oldest.startedAt), 'yyyy 年 M 月 d 日')}` : ''}</small>
      </div>
    </header>

    <section className="memory-tools" aria-label="查找和筛选记忆">
      <label className="memory-search"><Search aria-hidden="true" /><span className="sr-only">搜索记忆</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索会议、判断、阻塞或产物" /></label>
      <div className="memory-filters">
        <button aria-pressed={filter === 'all'} className={filter === 'all' ? 'active' : ''} type="button" onClick={() => setFilter('all')}>全部 <span>{entries.length}</span></button>
        {availableKinds.map((kind) => {
          const Icon = KIND_ICONS[kind];
          const count = entries.filter((entry) => entry.kind === kind).length;
          return <button aria-pressed={filter === kind} className={filter === kind ? 'active' : ''} key={kind} type="button" onClick={() => setFilter(kind)}><Icon aria-hidden="true" />{memoryKindLabel(kind)} <span>{count}</span></button>;
        })}
      </div>
    </section>

    {(seriesLoading || seriesError) && <div className={`memory-series-state ${seriesError ? 'is-warning' : ''}`}>
      {seriesError ? <CircleAlert aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
      <span>{seriesError ? '连续主题暂不可用；会议、决定、阻塞和产物仍可正常查找。' : '连续主题整理中…'}</span>
    </div>}

    {filtered.length > 0 && selected ? <section className="memory-layout memory-graph-layout">
      <div className="memory-map-panel">
        <header className="memory-map-heading">
          <div><p className="kicker">跨会议关联图</p><h2>判断、阻塞和产物如何彼此关联？</h2></div>
          <p>显示 {graphEntries.length} 条主要线索{filtered.length > graphEntries.length ? `，其余 ${filtered.length - graphEntries.length} 条可用搜索定位` : ''}</p>
        </header>
        <div className="memory-map-canvas" aria-label="会议判断、阻塞、产物与来源会议的关联图">
          <svg className="memory-map-links" viewBox="0 0 1000 680" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <filter id="memoryPencil"><feTurbulence baseFrequency="0.018 0.12" numOctaves="3" seed="23" type="fractalNoise" result="noise" /><feDisplacementMap in="SourceGraphic" in2="noise" scale="2.4" /></filter>
              <filter id="memoryFiber"><feTurbulence baseFrequency="0.035 0.2" numOctaves="2" seed="31" type="fractalNoise" result="fiber" /><feDisplacementMap in="SourceGraphic" in2="fiber" scale="1.2" /></filter>
            </defs>
            {graphEdges.map((edge, index) => {
              const source = graphPositions.get(edge.sourceId);
              const target = graphPositions.get(edge.targetId);
              if (!source || !target) return null;
              const path = graphPath(source, target, index);
              return <g className={`memory-link-group memory-link-${edge.kind}`} key={edge.id}>
                <path className="memory-link-echo" d={path} />
                <path className="memory-link-line" d={path} id={`memory-line-${index}`} />
                {index < 8 && <text className="memory-link-label"><textPath href={`#memory-line-${index}`} startOffset="50%" textAnchor="middle">{edge.label}</textPath></text>}
              </g>;
            })}
          </svg>
          {graphEntries.map((entry, index) => {
            const Icon = KIND_ICONS[entry.kind];
            const position = MEMORY_GRAPH_POSITIONS[index];
            return <button
              className={`memory-map-node memory-${entry.kind} ${index === 0 ? 'selected focus' : ''}`}
              key={entry.id}
              style={{ '--memory-node-x': `${position.x}%`, '--memory-node-y': `${position.y}%` } as React.CSSProperties}
              type="button"
              onClick={() => setSelectedId(entry.id)}
            >
              <span className="memory-item-icon"><Icon aria-hidden="true" /></span>
              <span className="memory-map-node-copy">
                <small>{entry.label}</small>
                <strong>{entry.title}</strong>
                <em>{entry.evidence.length > 1 ? `${entry.evidence.length} 场会议共同形成` : format(new Date(entry.updatedAt), 'M 月 d 日形成')}</em>
              </span>
            </button>;
          })}
          <div className="memory-map-legend" aria-label="图例"><span className="legend-thread">系列背景</span><span className="legend-decision">决定</span><span className="legend-risk">阻塞</span><span className="legend-artifact">产物</span></div>
        </div>
      </div>

      <aside className={`memory-detail memory-detail-${selected.kind}`} ref={detailRef} tabIndex={-1}>
        <header><span><Brain aria-hidden="true" />当前线索</span><small>{format(new Date(selected.updatedAt), 'yyyy 年 M 月 d 日')}</small></header>
        <p className="kicker">{selected.label}</p>
        <h2>{selected.title}</h2>
        <p className="memory-detail-summary">{selected.summary}</p>
        {selected.detail && <div className="memory-detail-notes">{selected.detail.split('\n').map((paragraph, index) => <p key={`${selected.id}-note-${index}`}>{paragraph}</p>)}</div>}
        <div className="memory-evidence">
          <div><strong>来源会议</strong><span>{selected.evidence.length} 条依据</span></div>
          {selected.evidence.map((evidence) => <button key={evidence.meetingId} type="button" onClick={() => onOpenMeeting(evidence.meetingId)}>
            <span><CalendarDays aria-hidden="true" /></span>
            <span><small>{format(new Date(evidence.startedAt), 'M 月 d 日')}</small><strong>{evidence.title}</strong><em>{evidence.headline}</em></span>
            <ArrowRight aria-hidden="true" />
          </button>)}
        </div>
        <div className="memory-detail-actions">
          {selected.seriesId && <Button variant="outline" onClick={() => onOpenSeries(selected.seriesId!)}><Network />查看完整脉络</Button>}
          {selected.sourceUrl && <Button asChild variant="outline"><a href={selected.sourceUrl} target="_blank" rel="noreferrer"><Link2 />{selected.sourceLabel ?? '打开来源'}</a></Button>}
          <Button onClick={() => onExplore(`围绕「${selected.title}」继续梳理：核对相关会议的变化、仍未解决的问题和下一步，不要补写没有证据的事实。`)}><Sparkles />沿这条继续探索</Button>
        </div>
      </aside>
    </section> : <div className="memory-no-results"><Search aria-hidden="true" /><h2>没有找到这条线索</h2><p>换一个关键词或筛选范围试试。</p><Button variant="outline" onClick={() => { setQuery(''); setFilter('all'); }}>查看全部</Button></div>}
  </main>;
}
