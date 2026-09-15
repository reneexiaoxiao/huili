import type { ProjectAttentionItem, ProjectRecord } from '@shared/project.interface';

export function attentionItems(project: ProjectRecord, at = Date.now()): ProjectAttentionItem[] {
  return (project.attention?.items || []).map(item => {
    const times = project.evidence.filter(e => item.sourceIds.includes(e.id)).map(e => Date.parse(e.time));
    const latest = Math.max(...times);
    const due = item.dueAt ? Date.parse(item.dueAt) : undefined;
    const old = !Number.isFinite(latest) || at - latest >= 14 * 86400000 || (due !== undefined && due < at - 2 * 86400000 && latest < due);
    if (old || item.owner === 'unknown') return { ...item, owner: 'unknown' as const, priority: 'P3' as const, blocked: false };
    if (due !== undefined && due <= at + 2 * 86400000) return { ...item, priority: 'P1' as const };
    return item;
  }).sort((a, b) => attentionRank(a) - attentionRank(b));
}

export function attentionRank(item: ProjectAttentionItem): number {
  if (item.owner === 'unknown') return 100;
  return ({ P1: 0, P2: 20, P3: 40 }[item.priority]) + ({ self: 0, other: 4, agent: 8 }[item.owner]) - (item.blocked ? 1 : 0);
}

export function projectRank(project: ProjectRecord, at = Date.now()): number {
  const items = attentionItems(project, at);
  return items.length ? attentionRank(items[0]) : project.attention?.state === 'clear' ? 150 : 110;
}

export function filteredAttention(project: ProjectRecord, filter: string, at = Date.now()): ProjectAttentionItem[] {
  const owner = ({ mine: 'self', others: 'other', agent: 'agent', uncertain: 'unknown' } as Record<string, string>)[filter];
  return attentionItems(project, at).filter(item => !owner || item.owner === owner);
}

export function ownerLabel(item: ProjectAttentionItem): string {
  if (item.owner === 'self') return item.blocked ? '卡在我这' : '待我处理';
  if (item.owner === 'other') return `等${item.ownerName}`;
  return item.owner === 'agent' ? 'Agent 推进' : '待核对';
}
