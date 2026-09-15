import type { MeetingActionInbox } from '@shared/api.interface';
import { isExpiredIncompleteAutomaticPreparation } from '../../../../shared/action-timing';

export type InboxAction = MeetingActionInbox['actions'][number];
export type RankedAction = {
  action: InboxAction;
  reasons: string[];
  score: number;
};

const CLOSED_ACTION_STATUSES = new Set(['done', 'deferred', 'cancelled']);

function rankAction(action: InboxAction, now: number): RankedAction {
  const reasons: string[] = [];
  let score = 0;
  const day = 24 * 60 * 60 * 1000;
  const meetingTime = new Date(action.meetingStartedAt).getTime();
  const meetingAge = now - meetingTime;

  if (action.dueAt) {
    const dueIn = new Date(action.dueAt).getTime() - now;
    if (dueIn < 0) { score += 110; reasons.push('已逾期'); }
    else if (dueIn <= day) { score += 90; reasons.push('今天到期'); }
    else if (dueIn <= 3 * day) { score += 72; reasons.push('三天内到期'); }
    else if (dueIn <= 7 * day) { score += 48; reasons.push('一周内到期'); }
  }
  if (action.status === 'awaiting_confirmation') { score += 52; reasons.push('AI 可推进'); }
  if (['queued', 'claimed', 'executing'].includes(action.status)) { score += 26; reasons.push('正在推进'); }
  if (meetingTime > now && meetingTime - now <= 3 * day) { score += 44; reasons.push('即将开会'); }
  else if (meetingAge >= 0 && meetingAge <= 2 * day) { score += 36; reasons.push('最近会议'); }
  else if (meetingAge > 2 * day && meetingAge <= 7 * day) { score += 22; reasons.push('一周内会议'); }
  else if (meetingAge > 7 * day && meetingAge <= 30 * day) score += 8;
  if (action.dependency) { score += 10; reasons.push('有前置依赖'); }
  if (action.deliverable) { score += 6; reasons.push('交付物明确'); }
  if (action.resultLinks.length) { score += 18; reasons.push('有完成产物'); }
  score += Math.min(action.progress, 100) / 10;

  return { action, reasons: reasons.slice(0, 3), score };
}

export function rankActions(
  actions: InboxAction[],
  now = Date.now(),
): RankedAction[] {
  return actions.map((action) => rankAction(action, now)).sort((left, right) => (
    right.score - left.score
    || +new Date(right.action.meetingStartedAt) - +new Date(left.action.meetingStartedAt)
    || left.action.title.localeCompare(right.action.title, 'zh-CN')
  ));
}

export function prioritizeNowActions(
  actions: InboxAction[],
  now = Date.now(),
  limit = 3,
): InboxAction[] {
  return rankActions(
    actions.filter((action) => (
      !CLOSED_ACTION_STATUSES.has(action.status)
      && !isExpiredIncompleteAutomaticPreparation(action, now)
    )),
    now,
  ).slice(0, limit).map((item) => item.action);
}
