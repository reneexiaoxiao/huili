import type { MeetingRecord } from '@shared/api.interface';

export const CALENDAR_VISIBLE_EVENT_LIMIT = 3;

export function calendarEventsForDay(
  meetingsByDay: Map<string, MeetingRecord[]>,
  dayKey: string,
): MeetingRecord[] {
  return [...(meetingsByDay.get(dayKey) ?? [])].sort((left, right) => (
    +new Date(left.startedAt) - +new Date(right.startedAt)
    || left.title.localeCompare(right.title, 'zh-CN')
  ));
}

export function hiddenCalendarEventCount(events: MeetingRecord[]): number {
  return Math.max(0, events.length - CALENDAR_VISIBLE_EVENT_LIMIT);
}
