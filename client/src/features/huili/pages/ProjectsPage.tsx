import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Copy, ExternalLink, FileText, GitBranch, MessageCircle, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getProjectCatalog } from '@/api';
import type { ProjectAttentionItem, ProjectCatalog, ProjectEvidence, ProjectFact, ProjectLink, ProjectRecord } from '@shared/project.interface';
import { attentionItems, attentionRank, filteredAttention, ownerLabel, projectRank } from '../project-attention';
import './projects.css';

function date(value?: string) {
  if (!value || new Date(value).getFullYear() < 2000) return '尚无记录';
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function linkUrl(url?: string) {
  if (url && /^(https:\/\/|codex:\/\/threads\/)/.test(url)) return url;
  return undefined;
}

function matches(project: ProjectRecord, filter: string) {
  if (filter === 'all' || filter === 'inbox') return true;
  if (filteredAttention(project, filter).length) return true;
  return filter === 'uncertain' && (!project.attention || project.attention.state === 'uncertain');
}

function filteredRank(project: ProjectRecord, filter: string) {
  const first = filteredAttention(project, filter)[0];
  return first ? attentionRank(first) : projectRank(project);
}

function Sources({ facts, evidence }: { facts: ProjectFact[]; evidence: ProjectEvidence[] }) {
  return <ul className="project-facts">{facts.map((fact, index) => <li key={index}>
    <p>{fact.text}</p>
    <span>{fact.sourceIds.map(id => evidence.find(item => item.id === id)).filter(Boolean).slice(0, 3).map(item =>
      <a key={item!.id} href={linkUrl(item!.url)} target="_blank" rel="noreferrer">{item!.label} · {date(item!.time)} <ExternalLink aria-hidden="true" /></a>)}</span>
  </li>)}</ul>;
}

function Links({ items, empty, onMeeting }: { items: ProjectLink[]; empty: string; onMeeting?: (id: string) => void }) {
  if (!items.length) return <p className="project-empty-inline">{empty}</p>;
  return <div className="project-links">{items.map(item => <div key={item.id}>
    {onMeeting ? <button type="button" onClick={() => onMeeting(item.id)}>{item.name}<ArrowRight aria-hidden="true" /></button> :
      <a href={linkUrl(item.url)} target="_blank" rel="noreferrer">{item.name}<ExternalLink aria-hidden="true" /></a>}
    {(item.updatedAt || item.startedAt) && <small>{date(item.updatedAt || item.startedAt)}</small>}
  </div>)}</div>;
}

function PriorityItems({ project, items, onSelect }: { project: ProjectRecord; items: ProjectAttentionItem[]; onSelect?: () => void }) {
  return <>{items.map((item, index) => <article className="project-priority-item" key={`${item.owner}-${index}`}>
    <span className={`project-priority-badge priority-${item.owner === 'unknown' ? 'unknown' : item.priority}`}>{item.owner === 'unknown' ? '—' : item.priority}</span>
    <div className="project-priority-content">
      {onSelect && <small>{project.name}</small>}
      {onSelect ? <button type="button" className="project-priority-title" onClick={onSelect}><span>{item.text}</span><ArrowRight aria-hidden="true" /></button> : <h3>{item.text}</h3>}
      <div className="project-responsibility"><span data-owner={item.owner}>{ownerLabel(item)}</span>{item.dueAt && <span>{Date.parse(item.dueAt) < Date.now() ? '原定' : '时限'} {date(item.dueAt)}</span>}</div>
      <p>{item.reason}</p>
      <div className="project-priority-sources">{item.sourceIds.map(id => project.evidence.find(e => e.id === id)).filter(Boolean).slice(0, 2).map(e => <a key={e!.id} href={linkUrl(e!.url)} target="_blank" rel="noreferrer" title={item.assignmentQuote || undefined}>{e!.label} · {date(e!.time)}<ExternalLink aria-hidden="true" /></a>)}</div>
    </div>
  </article>)}</>;
}

function Detail({ project, onBack, onOpenMeeting }: { project: ProjectRecord; onBack: () => void; onOpenMeeting: (id: string) => void }) {
  const [tab, setTab] = useState('progress');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const d = project.digest;
  const priorityItems = attentionItems(project);
  const latest = project.evidence.find(r => r.speaker === '用户');
  useEffect(() => { setTab('progress'); setCopied(false); }, [project.id]);
  const copy = async () => {
    const text = [`# ${project.name}`, project.goal, `资料日期：${project.checkedAt || project.baselineAt || project.lastActivityAt || '尚未核对'}`,
      d?.summary || project.baseline || '', ...priorityItems.map(item => `${item.priority} · ${ownerLabel(item)}：${item.text}。${item.reason}`), '下一步：', ...(d?.nextSteps || []).map(x => '- ' + x.text),
      '关联任务：', ...project.tasks.map(x => `${x.name} ${x.url}`), '相关群聊：', ...project.chats.map(x => `${x.name} ${x.url}`),
      '请继承当前任务的授权和最新决定，先核对新增进展。'].join('\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); setCopyError(false); } catch { setCopyError(true); }
  };
  return <main className="hub-workspace project-workspace">
    <button className="project-back" onClick={onBack}><ArrowLeft aria-hidden="true" />全部项目</button>
    <header className="project-heading project-detail-heading"><div><p className="kicker">{project.group}</p><h1>{project.name}</h1><p>{project.goal}</p></div>
      <div className="project-heading-actions"><Button variant="outline" onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? '已复制接续材料' : '复制接续材料'}</Button>
        {project.tasks[0] && <Button asChild><a href={project.tasks[0].url}>打开原任务<ArrowRight /></a></Button>}
        {copyError && <p role="alert">未能复制，请重试。</p>}
      </div>
    </header>
    {priorityItems.length > 0 && <section className="project-priority-detail" aria-label="责任与优先级"><div className="project-section-heading"><h2>接下来等谁</h2><small>核对于 {date(project.attention?.checkedAt)}</small></div><PriorityItems project={project} items={priorityItems} /></section>}
    <div className="project-detail-tabs" role="tablist" aria-label="项目资料">
      {[['progress', '进展'], ['tasks', `Agent 任务 ${project.tasks.length}`], ['meetings', `会议 ${project.meetings.length}`], ['chats', `群聊 ${project.chats.length}`], ['deliverables', '交付物']].map(([key, label]) => <button role="tab" aria-selected={tab === key} key={key} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    <section className="project-detail-body" role="tabpanel">
      {project.sources?.some(s => s.status !== 'complete') && <p className="project-source-gap">{project.sources.filter(s => s.status !== 'complete').map(s => s.name).join('、')}：尚未完成本次核对，保留已有资料。</p>}
      {tab === 'progress' && <div className="project-progress-layout"><section>
        <p className="kicker">{d ? '当前进展' : '已知进展'} · {date(project.checkedAt || project.baselineAt)}</p>
        {d ? <><h2>{d.headline}</h2><p className="project-summary">{d.summary}</p><Sources facts={d.facts} evidence={project.evidence} /></> :
          <><h2>{project.name}</h2><p className="project-summary">{project.baseline || '尚未汇总进展，可先查看关联任务。'}</p>
            {project.baselineSource && <a className="project-source" href={project.baselineSource.url}>{project.baselineSource.name}<ExternalLink /></a>}
            {latest && <details className="project-latest"><summary>最近的推进要求 · {date(latest.time)}<ChevronDown /></summary><p>{latest.text}</p><a href={latest.url}>打开原任务 <ExternalLink /></a></details>}
          </>}
      </section><aside>
        <h2>下一步</h2>{d?.nextSteps.length ? <Sources facts={d.nextSteps} evidence={project.evidence} /> : <p className="project-empty-inline">尚未提取下一步，打开原任务核对。</p>}
        {!!d?.waiting.length && <><h2>等待与未定</h2><Sources facts={d.waiting} evidence={project.evidence} /></>}
        <div className="project-related"><h3>相关群聊</h3><Links items={project.chats} empty="尚未关联群聊。" /></div>
      </aside></div>}
      {tab === 'tasks' && <Links items={project.tasks} empty="尚未关联 Agent 任务。" />}
      {tab === 'meetings' && <Links items={project.meetings} empty="尚未关联会议。" onMeeting={onOpenMeeting} />}
      {tab === 'chats' && <><Links items={project.chats} empty="尚未关联群聊。" />{project.evidence.filter(r => r.kind === 'chat').slice(-12).reverse().map(r => <details className="project-latest" key={r.id}><summary>{r.speaker} · {date(r.time)}<ChevronDown /></summary><p>{r.text}</p><a href={linkUrl(r.url)} target="_blank" rel="noreferrer">打开消息<ExternalLink /></a></details>)}</>}
      {tab === 'deliverables' && <Links items={(d?.deliverables || []).map((item, i) => ({ id: String(i), name: item.label, url: item.url }))} empty="尚未整理交付物，可在关联任务中查看。" />}
    </section>
  </main>;
}

export function ProjectsPage({ selectedId, onSelect, onOpenMeeting, onOpenCalendar }: { selectedId?: string; onSelect: (id?: string) => void; onOpenMeeting: (id: string) => void; onOpenCalendar: () => void }) {
  const [catalog, setCatalog] = useState<ProjectCatalog>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [period, setPeriod] = useState('all');
  const [sort, setSort] = useState('priority');
  const load = async () => { setLoading(true); setError(false); try { setCatalog(await getProjectCatalog()); } catch { setError(true); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const selected = catalog?.projects.find(p => p.id === selectedId);
  const projects = useMemo(() => (catalog?.projects || []).filter(p => matches(p, filter) && (period === 'all' || p.activity === period) && [p.name, p.group, p.goal, ...attentionItems(p).map(i => i.text + i.ownerName), ...p.tasks.map(t => t.name), ...p.chats.map(t => t.name)].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a, b) => (sort === 'priority' ? filteredRank(a, filter) - filteredRank(b, filter) : 0) || (b.lastActivityAt || '').localeCompare(a.lastActivityAt || '')), [catalog, filter, period, query, sort]);
  const mine = (catalog?.projects || []).flatMap(p => attentionItems(p).filter(i => i.owner === 'self').map(item => ({ project: p, item }))).sort((a, b) => attentionRank(a.item) - attentionRank(b.item) || (a.item.dueAt || 'z').localeCompare(b.item.dueAt || 'z'));
  if (selected) return <Detail project={selected} onBack={() => onSelect()} onOpenMeeting={onOpenMeeting} />;
  return <main className="hub-workspace project-workspace">
    <header className="project-heading"><div><p className="kicker">我的工作脉络</p><h1>项目 <span>{catalog?.projects.length ?? '—'}</span></h1></div>
      <div className="project-update"><p>{catalog?.policy.dailyAt ? `每日 ${catalog.policy.dailyAt} 汇总` : '按需汇总'}</p><small>目录更新于 {date(catalog?.indexedAt)}</small><Button variant="ghost" size="sm" title="读取上次汇总结果" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? 'animate-spin' : ''} />刷新结果</Button></div>
    </header>
    {error && <div className="project-load-error" role="alert">项目暂时无法读取，请检查登录后重试。<Button variant="outline" onClick={() => void load()}>重试</Button></div>}
    {filter === 'all' && !query && mine.length > 0 && <section className="project-focus" aria-label="优先处理的事项"><div className="project-section-heading"><h2>待你处理 <span>{mine.length} 项</span></h2><button type="button" onClick={() => setFilter('mine')}>查看全部<ArrowRight aria-hidden="true" /></button></div>
      <div className="project-focus-grid">{mine.slice(0, 3).map(({ project, item }, i) => <PriorityItems key={`${project.id}-${i}`} project={project} items={[item]} onSelect={() => onSelect(project.id)} />)}</div>
    </section>}
    <div className="project-toolbar"><div className="project-filters" role="group" aria-label="项目范围">
      {[['all', '全部'], ['mine', '待我处理'], ['others', '等他人反馈'], ['agent', 'Agent 推进'], ['uncertain', '待核对'], ['inbox', '待归类任务']].map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<span>{key === 'inbox' ? catalog?.inbox.length ?? 0 : catalog?.projects.filter(p => matches(p, key)).length ?? 0}</span></button>)}
    </div><label className="project-search"><Search aria-hidden="true"/><input aria-label="搜索项目、事项或联系人" placeholder="搜索项目、事项或联系人" value={query} onChange={e => setQuery(e.target.value)}/></label></div>
    <div className="project-sort-bar"><span>{filter === 'inbox' ? '尚未确定所属项目' : `${catalog ? projects.length : '—'} 个项目`}</span>{filter !== 'inbox' && <div><select aria-label="项目排序" value={sort} onChange={e => setSort(e.target.value)}><option value="priority">按优先级</option><option value="recent">按最近记录</option></select><select aria-label="项目时间范围" value={period} onChange={e => setPeriod(e.target.value)}><option value="all">全部时间</option><option value="recent">近两周有记录</option><option value="history">更早的项目</option></select></div>}</div>
    {loading && !catalog ? <p className="project-empty" role="status">正在读取项目目录…</p> : !catalog && error ? null : filter === 'inbox' ? <Links items={(catalog?.inbox || []).filter(t => t.name.toLowerCase().includes(query.toLowerCase()))} empty="没有待归类的任务。" /> :
      projects.length ? <div className="project-index"><div className="project-index-heading" aria-hidden="true"><span>优先级</span><span>项目与下一步</span><span>接下来等谁</span><span>关联资料</span><span>时限 / 最近记录</span></div>{projects.map(p => {
        const items = filteredAttention(p, filter); const first = items[0];
        return <button className="project-index-row" key={p.id} onClick={() => onSelect(p.id)}>
          <span className={`project-priority-badge priority-${!first || first.owner === 'unknown' ? 'unknown' : first.priority}`}>{first && first.owner !== 'unknown' ? first.priority : '—'}</span>
          <span className="project-index-title"><small>{p.group}</small><strong>{p.name}</strong><span>{first?.text || p.goal}</span></span>
          <span className="project-responsibility project-index-owner">{first ? [...new Set(items.map(ownerLabel))].map(label => <span data-owner={items.find(i => ownerLabel(i) === label)?.owner} key={label}>{label}</span>) : <span>{p.attention?.state === 'clear' ? '暂无明确待办' : '待核对'}</span>}</span>
          <span className="project-index-links"><span><GitBranch />{p.tasks.length} 个任务</span><span><CalendarDays />{p.meetings.length} 场会议</span><span><MessageCircle />{p.chats.length} 个群聊</span></span>
          <span className="project-index-date"><small>{first?.dueAt ? '事项时限' : '最近推进记录'}</small>{date(first?.dueAt || p.lastActivityAt)}</span><ArrowRight className="project-index-arrow" aria-hidden="true" />
        </button>;
      })}</div> : <div className="project-empty"><FileText /><p>{query ? '没有找到匹配项目。' : catalog?.projects.length ? '当前范围没有匹配项目。' : '当前个人空间还没有项目资料。'}</p>{query || filter !== 'all' || period !== 'all' ? <Button variant="outline" onClick={() => { setQuery(''); setFilter('all'); setPeriod('all'); }}>查看全部项目</Button> : <Button variant="outline" onClick={onOpenCalendar}>查看会议</Button>}</div>}
    {catalog && <details className="project-coverage"><summary>查看收录范围与优先级<ChevronDown /></summary><p>P1：临近明确时限或已阻挡下一步；P2：近期应处理；P3：常规。责任或结果不明确时标为「待核对」。各项均保留出处与日期。</p><p>检查了 {catalog.coverage.tasks} 个工作任务、{catalog.coverage.chats} 个可见聊天和 {catalog.coverage.meetings} 场会里会议；{catalog.coverage.linkedTasks} 个任务已关联项目。</p><p>未确定归属的任务保留在「待归类任务」。</p>{!!catalog.coverage.unreadableTasks && <p>{catalog.coverage.unreadableTasks} 个任务的本机记录暂不可读。</p>}</details>}
  </main>;
}
