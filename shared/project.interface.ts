export interface ProjectLink {
  id: string;
  name: string;
  url?: string;
  updatedAt?: string;
  startedAt?: string;
  externalKey?: string;
  summary?: string;
}

export interface ProjectEvidence {
  id: string;
  kind: string;
  label: string;
  speaker: string;
  time: string;
  url: string;
  text: string;
}

export interface ProjectFact { text: string; sourceIds: string[] }

export interface ProjectAttentionItem extends ProjectFact {
  owner: 'self' | 'other' | 'agent' | 'unknown';
  ownerName: string;
  priority: 'P1' | 'P2' | 'P3';
  blocked: boolean;
  reason: string;
  dueAt?: string | null;
  assignmentQuote: string;
}

export interface ProjectAttention {
  checkedAt: string;
  state: 'open' | 'clear' | 'uncertain';
  items: ProjectAttentionItem[];
}

export interface ProjectRecord {
  id: string;
  name: string;
  group: string;
  goal: string;
  baseline?: string;
  baselineAt?: string;
  baselineSource?: { name: string; url: string };
  activity: 'recent' | 'history';
  lastActivityAt?: string;
  checkedAt?: string;
  coverage?: string;
  sources?: Array<{ name: string; kind: string; status: string; through?: string }>;
  tasks: ProjectLink[];
  chats: ProjectLink[];
  meetings: ProjectLink[];
  evidence: ProjectEvidence[];
  attention?: ProjectAttention;
  digest?: {
    headline: string;
    stage: string;
    summary: string;
    facts: ProjectFact[];
    nextSteps: ProjectFact[];
    waiting: ProjectFact[];
    changes: ProjectFact[];
    deliverables: Array<{ label: string; url: string; sourceIds: string[] }>;
  };
}

export interface ProjectCatalog {
  version: 1;
  indexedAt: string;
  policy: { dailyAt: string; timezone: string };
  projects: ProjectRecord[];
  inbox: ProjectLink[];
  coverage: { tasks: number; linkedTasks: number; chats: number; meetings: number; chatComplete: boolean; unreadableTasks: number };
}
