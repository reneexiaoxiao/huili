import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, NotebookPen, RefreshCw, Search, Sparkles, Undo2, X } from 'lucide-react';
import { completeMeetingTodo, createCapture, getMeetingActionInbox, reopenCapture, startCapture } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { CaptureMode, MeetingActionInboxItem } from '@shared/api.interface';
import './quick-capture.css';

interface CaptureDraft {
  text: string;
  requestId: string;
  attemptedMode?: CaptureMode;
}

function emptyDraft(): CaptureDraft {
  return { text: '', requestId: crypto.randomUUID() };
}

function readDraft(key?: string): CaptureDraft {
  try {
    const value = key && window.localStorage.getItem(key);
    const draft: unknown = value ? JSON.parse(value) : undefined;
    if (draft && typeof draft === 'object' && 'text' in draft && 'requestId' in draft &&
      typeof draft.text === 'string' && draft.text.length <= 6000 && typeof draft.requestId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(draft.requestId)) {
      return { text: draft.text, requestId: draft.requestId,
        attemptedMode: 'attemptedMode' in draft && (draft.attemptedMode === 'record' || draft.attemptedMode === 'agent')
          ? draft.attemptedMode : undefined };
    }
  } catch { /* A blocked browser store must not prevent recording. */ }
  return emptyDraft();
}

function noteDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function QuickCaptureDialog({ open, onOpenChange, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (mode: CaptureMode) => void;
}) {
  const draftKey = window.userId ? `huili-capture-draft:${window.userId}` : undefined;
  const [draft, setDraft] = useState<CaptureDraft>(() => readDraft(draftKey));
  const [draftStored, setDraftStored] = useState(Boolean(draft.text && draftKey));
  const [notes, setNotes] = useState<MeetingActionInboxItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completingId, setCompletingId] = useState<string>();
  const [undoNote, setUndoNote] = useState<MeetingActionInboxItem>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<'open' | 'agent' | 'done'>('open');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(8);
  const readVersion = useRef(0);
  const saveActive = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const storeDraft = (next: CaptureDraft) => {
    setDraft(next);
    try {
      if (!draftKey) { setDraftStored(false); return; }
      if (next.text) window.localStorage.setItem(draftKey, JSON.stringify(next));
      else window.localStorage.removeItem(draftKey);
      setDraftStored(Boolean(next.text));
    } catch { setDraftStored(false); }
  };

  const refresh = useCallback(async () => {
    const version = ++readVersion.current;
    setLoading(true); setLoadError(false);
    try {
      const inbox = await getMeetingActionInbox();
      if (version !== readVersion.current) return;
      setNotes(inbox.actions.filter(item => item.sourceType === 'capture' &&
        !['cancelled', 'deferred'].includes(item.status))
        .sort((a, b) => b.meetingStartedAt.localeCompare(a.meetingStartedAt)));
      setLoaded(true);
    } catch { if (version === readVersion.current) setLoadError(true); }
    finally { if (version === readVersion.current) setLoading(false); }
  }, []);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);
  const hasRunningTask = notes.some(note => ['queued', 'claimed', 'executing'].includes(note.status));
  useEffect(() => {
    if (!open || !hasRunningTask) return;
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [open, hasRunningTask, refresh]);
  useEffect(() => { setLimit(8); }, [filter, query]);
  useEffect(() => { if (!saving && notice === '已记下') editorRef.current?.focus(); }, [saving, notice]);

  const save = async (mode: CaptureMode) => {
    if (!draft.text.trim() || saveActive.current) return;
    if (draft.attemptedMode && draft.attemptedMode !== mode) return;
    saveActive.current = true; setSaving(true); setError(''); setNotice('');
    const submitted: CaptureDraft = { ...draft, attemptedMode: mode };
    storeDraft(submitted);
    try {
      await createCapture({ clientRequestId: submitted.requestId, text: submitted.text.trim(), mode });
      storeDraft(emptyDraft());
      setNotice(mode === 'record' ? '已记下' : '已交给 Agent，任务创建后会出现在这条记录下');
      setUndoNote(undefined);
      setFilter(mode === 'agent' ? 'agent' : 'open'); setQuery('');
      onSaved('record');
      await refresh();
    } catch {
      setError(mode === 'record'
        ? '保存结果暂未确认，请重试核对这条记录。'
        : '尚未确认是否已交给 Agent，请重试核对。');
    } finally { saveActive.current = false; setSaving(false); }
  };

  const changeNote = async (note: MeetingActionInboxItem, action: 'complete' | 'reopen' | 'start') => {
    if (completingId) return;
    setCompletingId(note.actionId); setError(''); setNotice('');
    try {
      if (action === 'start') await startCapture(note.actionId);
      else if (action === 'reopen') await reopenCapture(note.actionId);
      else await completeMeetingTodo(note.actionId, {});
      setNotes(current => current.map(item => item.actionId === note.actionId ? {
        ...item, status: action === 'start' ? 'queued' : action === 'reopen' ? 'planned' : 'done',
        category: action === 'start' ? 'ai_direct' : item.category,
      } : item));
      setUndoNote(action === 'complete' ? note : undefined);
      setNotice(action === 'start' ? '已交给 Agent，任务创建后会出现在这条记录下' : action === 'reopen' ? '已恢复为未处理' : '已移到已完成');
      if (action !== 'complete') setFilter(action === 'start' ? 'agent' : 'open');
      onSaved('record');
      await refresh();
    } catch { setError(action === 'start' ? '交接结果暂未确认，请刷新记录后重试；同一条记录不会重复创建任务。' : '状态更新尚未确认，请刷新记录后重试。'); }
    finally { setCompletingId(undefined); }
  };

  const pending = notes.filter(note => note.status !== 'done' && note.category === 'user_owned');
  const codexNotes = notes.filter(note => note.status !== 'done' && note.category !== 'user_owned');
  const visible = notes.filter(note => (filter === 'done' ? note.status === 'done' :
    note.status !== 'done' && (filter === 'agent' ? note.category !== 'user_owned' : note.category === 'user_owned')) &&
    `${note.title} ${note.description || ''}`.toLowerCase().includes(query.toLowerCase()));
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="capture-dialog quick-capture-dialog" showCloseButton={false}>
      <button className="quick-capture-close" type="button" aria-label="收起随手记" onClick={() => onOpenChange(false)}><X /></button>
      <DialogHeader>
        <p className="kicker">个人待办</p>
        <DialogTitle>随手记</DialogTitle>
        <DialogDescription>交给 Agent 后，先查找相关背景，再与你对齐。</DialogDescription>
      </DialogHeader>
      <section className="quick-capture-composer" aria-label="记一件事">
        <Textarea ref={editorRef} autoFocus aria-label="随手记内容" value={draft.text} maxLength={6000}
          disabled={saving || Boolean(draft.attemptedMode)}
          onChange={event => { storeDraft({ ...draft, text: event.target.value }); setNotice(''); }}
          onKeyDown={event => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault(); void save(draft.attemptedMode || 'record');
            }
          }} placeholder="刚想到的事，先记在这里…" />
        <div className="quick-capture-draft"><span>{draft.text && (draftStored ? '草稿已保存在这台设备' : '草稿尚未保存，请点记下来')}</span><span>{draft.text.length} / 6000</span></div>
        {draft.attemptedMode && !saving && !error && <p className="quick-capture-error" role="status">上次提交尚未确认，请点重试核对。</p>}
        <div className="quick-capture-actions">
          <Button variant="ghost" disabled={saving || !draft.text.trim() || draft.attemptedMode === 'record'}
            onClick={() => void save('agent')}><Sparkles />{draft.attemptedMode === 'agent' ? '重试交给 Agent' : '交给 Agent'}</Button>
          <Button disabled={saving || !draft.text.trim() || draft.attemptedMode === 'agent'}
            onClick={() => void save('record')}><NotebookPen />{saving ? '正在提交…' : draft.attemptedMode === 'record' ? '重试保存' : '记下来'}</Button>
        </div>
      </section>
      {error && <p className="quick-capture-error" role="alert">{error}</p>}
      {notice && <p className="quick-capture-notice" role="status"><Check aria-hidden="true" />{notice}
        {undoNote && <button type="button" disabled={Boolean(completingId)} onClick={() => void changeNote(undoNote, 'reopen')}>撤销</button>}</p>}
      <section className="quick-capture-notes" aria-label="我的随手记">
        <div className="quick-capture-list-heading">
          <div role="group" aria-label="随手记状态">
            <button type="button" aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>未处理 <span>{pending.length}</span></button>
            <button type="button" aria-pressed={filter === 'agent'} onClick={() => setFilter('agent')}>Agent <span>{codexNotes.length}</span></button>
            <button type="button" aria-pressed={filter === 'done'} onClick={() => setFilter('done')}>已完成 <span>{notes.filter(note => note.status === 'done').length}</span></button>
          </div>
          <button className="quick-capture-refresh" type="button" aria-label="刷新随手记" disabled={loading} onClick={() => void refresh()}><RefreshCw className={loading ? 'animate-spin' : ''} /></button>
        </div>
        {notes.length > 0 && <label className="quick-capture-search"><Search aria-hidden="true" /><input aria-label="搜索随手记" placeholder="找一条记录" value={query} onChange={event => setQuery(event.target.value)} /></label>}
        {loadError && <div className="quick-capture-error" role="alert">记录暂时无法读取，已保存的内容会保留。<button type="button" onClick={() => void refresh()}>重新读取</button></div>}
        {loading && !loaded ? <p className="quick-capture-empty" role="status">正在读取随手记…</p> :
          visible.length ? <ul className="quick-capture-list">{visible.slice(0, limit).map(note => <li key={note.actionId}>
            {note.category === 'user_owned' ? <button type="button" className="quick-capture-check"
              aria-label={`${note.status === 'done' ? '撤销完成' : '标为完成'}：${note.title}`}
              aria-pressed={note.status === 'done'} disabled={Boolean(completingId)}
              onClick={() => void changeNote(note, note.status === 'done' ? 'reopen' : 'complete')}>
              {completingId === note.actionId ? <RefreshCw className="animate-spin" /> : note.status === 'done' ? <Check /> : null}</button> :
              <span className="quick-capture-task-icon"><Sparkles /></span>}
            <div><p className={note.status === 'done' ? 'is-done' : ''}>{note.description || note.title}</p>
              <time dateTime={note.meetingStartedAt}>{noteDate(note.meetingStartedAt)}</time>
              <div className="quick-capture-note-actions">
                {note.category === 'user_owned' ? note.status === 'done' ?
                  <button type="button" disabled={Boolean(completingId)} onClick={() => void changeNote(note, 'reopen')}><Undo2 />撤销完成</button> :
                  <button type="button" disabled={Boolean(completingId)} onClick={() => void changeNote(note, 'start')}><Sparkles />交给 Agent</button> : <>
                    <span>{note.status === 'awaiting_confirmation' ? '待你补充 · 在任务里继续' : note.status === 'failed' ? '背景整理未完成' : note.status === 'done' ? '已完成' : note.status === 'executing' ? '正在查找背景' : '等待本机 Agent 接手'}</span>
                    {note.resultLinks.filter(link => /^(https:\/\/|codex:\/\/threads\/)/iu.test(link.url)).slice(0, 1).map(link =>
                      <a key={link.url} href={link.url}>打开 Agent 任务<ArrowUpRight /></a>)}
                  </>}
              </div>
              {note.category !== 'user_owned' && note.evidenceSummary && <p className="quick-capture-task-summary">{note.evidenceSummary}</p>}
            </div>
          </li>)}</ul> : !loadError && loaded && <p className="quick-capture-empty">{query ? '没有找到这条记录，换个关键词试试。' : filter === 'done' ? '还没有已完成的记录。' : filter === 'agent' ? '还没有交给 Agent 的记录。' : '没有未处理的随手记，想到的事直接记在上面。'}</p>}
        {visible.length > limit && <button type="button" className="quick-capture-more" onClick={() => setLimit(value => value + 8)}>再看 {Math.min(8, visible.length - limit)} 条</button>}
      </section>
    </DialogContent>
  </Dialog>;
}
