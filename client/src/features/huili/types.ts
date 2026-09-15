import type { MeetingAction, MeetingRecord } from '@shared/api.interface';

export type HuiliView = 'now' | 'progress' | 'projects' | 'calendar' | 'explore' | 'insights' | 'people' | 'memory';
export type ActionFilter = 'my_todos' | 'awaiting' | 'executing' | 'completed';

const MEETING_SERIES_VIEWS = new Set<HuiliView>(['now', 'calendar', 'explore', 'insights', 'people', 'memory']);

export function viewUsesMeetingSeries(view: HuiliView): boolean {
  return MEETING_SERIES_VIEWS.has(view);
}

export interface MeetingActionHandlers {
  onConfirm: (action: MeetingAction) => void;
  onDefer: (action: MeetingAction) => void;
  onCancel: (action: MeetingAction) => void;
  onComplete: (action: MeetingAction) => void;
}

export interface MeetingSelection {
  meeting?: MeetingRecord;
  onSelectMeeting: (meetingId: string) => void;
}
