import type { ActionStatus } from './api.interface';

const AUTOMATIC_PREPARATION_PREFIX = 'prep:auto:';

export function isExpiredIncompleteAutomaticPreparation(
  action: {
    actionId: string;
    status: ActionStatus | string;
    meetingStartedAt: Date | string | number;
  },
  now: Date | number = Date.now(),
): boolean {
  const meetingStartedAt = new Date(action.meetingStartedAt).getTime();
  const nowMs = now instanceof Date ? now.getTime() : now;
  return action.actionId.startsWith(AUTOMATIC_PREPARATION_PREFIX)
    && action.status !== 'done'
    && Number.isFinite(meetingStartedAt)
    && meetingStartedAt <= nowMs;
}
