import { BookOpen, CalendarDays, Compass, Eye, FolderOpen, ListChecks, PenLine, Sparkles } from 'lucide-react';

import type { HuiliView } from './types';

const NAV_ITEMS = [
  { key: 'now', label: '此刻', icon: Sparkles },
  { key: 'progress', label: '推进', icon: ListChecks },
  { key: 'projects', label: '项目', icon: FolderOpen },
  { key: 'calendar', label: '日历', icon: CalendarDays },
  { key: 'explore', label: '漫游', icon: Compass },
  { key: 'insights', label: '洞察', icon: Eye },
  { key: 'memory', label: '记忆', icon: BookOpen },
] as const;

export function AppShell({
  view,
  progressCount,
  onNavigate,
  onCapture,
  children,
}: {
  view: HuiliView;
  progressCount: number;
  onNavigate: (view: HuiliView) => void;
  onCapture: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="meeting-hub-shell">
      <header className="hub-topbar">
        <button className="brand" type="button" onClick={() => onNavigate('now')}>
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>会里</strong><small>个人工作推进台</small></span>
        </button>
        <nav className="view-tabs" aria-label="会里主导航">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              aria-current={view === key || (view === 'people' && key === 'insights') ? 'page' : undefined}
              className={`view-tab ${view === key || (view === 'people' && key === 'insights') ? 'active' : ''}`}
              key={key}
              type="button"
              onClick={() => onNavigate(key)}
            >
              <Icon aria-hidden="true" />
              {label}
              {key === 'progress' && progressCount > 0 && <span>{progressCount}</span>}
            </button>
          ))}
        </nav>
        <div className="topbar-actions">
          <button className="capture-button" type="button" onClick={onCapture}>
            <PenLine aria-hidden="true" />
            <span>随手记</span>
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
