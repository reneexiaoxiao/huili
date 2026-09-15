import { logger } from '@/lib/logger';
import { axiosForBackend } from '@/lib/transport';
import type { ProjectCatalog } from '@shared/project.interface';

export async function getProjectCatalog(): Promise<ProjectCatalog> {
  const response = await axiosForBackend({ url: '/api/hub/projects', method: 'GET' });
  return response.data as ProjectCatalog;
}

import type {
  CancelActionResponse,
  ConfirmActionRequest,
  ConfirmActionResponse,
  CompleteUserActionRequest,
  CreateCaptureRequest,
  CreateCaptureResponse,
  StartCaptureResponse,
  ReopenCaptureResponse,
  CreateMeetingAiTaskRequest,
  CreateMeetingAiTaskResponse,
  CreateMeetingPreparationRequest,
  DailyBlankFeedback,
  DailyBlankDisposition,
  UpdateDailyBlankDispositionResponse,
  IgnoreMeetingActionsResponse,
  IgnoredMeetingsResponse,
  MeetingActionInbox,
  MeetingHubOverview,
  MeetingSeriesReadResponse,
  PairingCodeResponse,
  SaveAndRedrawDailyBlankResponse,
  UpdateMeetingVisibilityResponse,
  UpdateDailyBlankFeedbackResponse,
} from '@shared/api.interface';

export async function getMeetingSeries(): Promise<MeetingSeriesReadResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/hub/series',
      method: 'GET',
    });
    return response.data as MeetingSeriesReadResponse;
  } catch (error) {
    logger.error('加载会议脉络失败', error);
    throw error;
  }
}

export async function startCapture(actionId: string): Promise<StartCaptureResponse> {
  const response = await axiosForBackend({
    url: `/api/hub/captures/${encodeURIComponent(actionId)}/start`, method: 'POST', data: {},
  });
  return response.data as StartCaptureResponse;
}

export async function reopenCapture(actionId: string): Promise<ReopenCaptureResponse> {
  const response = await axiosForBackend({
    url: `/api/hub/captures/${encodeURIComponent(actionId)}/reopen`, method: 'POST', data: {},
  });
  return response.data as ReopenCaptureResponse;
}

export async function updateDailyBlankDisposition(
  blankId: string,
  action: DailyBlankDisposition,
): Promise<UpdateDailyBlankDispositionResponse> {
  const response = await axiosForBackend({
    url: `/api/hub/daily-blank/${encodeURIComponent(blankId)}/disposition`,
    method: 'PATCH',
    data: { action },
  });
  return response.data as UpdateDailyBlankDispositionResponse;
}

export async function getDailyBlankAssetUrl(fileName: string): Promise<string> {
  const response = await axiosForBackend({
    url: `/api/hub/daily-blank-assets/${encodeURIComponent(fileName)}`,
    method: 'GET',
  });
  const imageUrl: unknown = response.data?.imageUrl;
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) {
    throw new Error('留白图片地址暂不可用');
  }
  return imageUrl;
}

export async function updateDailyBlankFeedback(
  blankId: string,
  feedback: DailyBlankFeedback,
): Promise<UpdateDailyBlankFeedbackResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/hub/daily-blank/${blankId}/feedback`,
      method: 'PATCH',
      data: { feedback },
    });
    return response.data as UpdateDailyBlankFeedbackResponse;
  } catch (error) {
    logger.error('保存今日留白反馈失败', error);
    throw error;
  }
}

export async function saveAndRedrawDailyBlank(
  blankId: string,
  tags: string[],
): Promise<SaveAndRedrawDailyBlankResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/hub/daily-blank/${blankId}/save-and-redraw`,
      method: 'POST',
      data: { tags },
    });
    return response.data as SaveAndRedrawDailyBlankResponse;
  } catch (error) {
    logger.error('收好留白卡并抽取下一张失败', error);
    throw error;
  }
}

export async function getMeetingHubOverview(
  from: string,
  to: string,
): Promise<MeetingHubOverview> {
  try {
    const response = await axiosForBackend({
      url: '/api/hub/overview',
      method: 'GET',
      params: { from, to },
    });
    return response.data as MeetingHubOverview;
  } catch (error) {
    logger.error('加载会议推进台失败', error);
    throw error;
  }
}

export async function getMeetingActionInbox(): Promise<MeetingActionInbox> {
  try {
    const response = await axiosForBackend({
      url: '/api/hub/actions',
      method: 'GET',
    });
    return response.data as MeetingActionInbox;
  } catch (error) {
    logger.error('加载行动清单失败', error);
    throw error;
  }
}

export async function confirmMeetingAction(
  actionId: string,
  body: ConfirmActionRequest,
): Promise<ConfirmActionResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/hub/actions/${actionId}/confirm`,
      method: 'POST',
      data: body,
    });
    return response.data as ConfirmActionResponse;
  } catch (error) {
    logger.error('确认行动失败', error);
    throw error;
  }
}

export async function createCapture(
  body: CreateCaptureRequest,
): Promise<CreateCaptureResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/hub/captures',
      method: 'POST',
      data: body,
    });
    return response.data as CreateCaptureResponse;
  } catch (error) {
    logger.error('写入个人工作台失败', error);
    throw error;
  }
}

export async function createMeetingPreparation(
  meetingId: string,
  body: CreateMeetingPreparationRequest,
): Promise<CreateCaptureResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/hub/meetings/${meetingId}/prepare`,
      method: 'POST',
      data: body,
    });
    return response.data as CreateCaptureResponse;
  } catch (error) {
    logger.error('创建会前准备失败', error);
    throw error;
  }
}

export async function deferMeetingAction(actionId: string): Promise<void> {
  try {
    await axiosForBackend({
      url: `/api/hub/actions/${actionId}/defer`,
      method: 'POST',
    });
  } catch (error) {
    logger.error('暂缓行动失败', error);
    throw error;
  }
}

export async function cancelMeetingAction(
  actionId: string,
): Promise<CancelActionResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/hub/actions/${actionId}/cancel`,
      method: 'POST',
    });
    return response.data as CancelActionResponse;
  } catch (error) {
    logger.error('取消行动失败', error);
    throw error;
  }
}

export async function createMeetingAiTask(
  meetingId: string,
  body: CreateMeetingAiTaskRequest,
): Promise<CreateMeetingAiTaskResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/hub/meetings/${meetingId}/ai-tasks`,
      method: 'POST',
      data: body,
    });
    return response.data as CreateMeetingAiTaskResponse;
  } catch (error) {
    logger.error('添加会议 AI 任务失败', error);
    throw error;
  }
}

export async function ignoreMeetingActions(
  meetingId: string,
): Promise<IgnoreMeetingActionsResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/hub/meetings/${meetingId}/actions/ignore`,
      method: 'POST',
    });
    return response.data as IgnoreMeetingActionsResponse;
  } catch (error) {
    logger.error('批量忽略会议待办失败', error);
    throw error;
  }
}

export async function getIgnoredMeetings(): Promise<IgnoredMeetingsResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/hub/meetings/ignored',
      method: 'GET',
    });
    return response.data as IgnoredMeetingsResponse;
  } catch (error) {
    logger.error('加载已忽略会议失败', error);
    throw error;
  }
}

export async function ignoreMeeting(
  meetingId: string,
): Promise<UpdateMeetingVisibilityResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/hub/meetings/${meetingId}/ignore`,
      method: 'POST',
    });
    return response.data as UpdateMeetingVisibilityResponse;
  } catch (error) {
    logger.error('忽略会议失败', error);
    throw error;
  }
}

export async function restoreMeeting(
  meetingId: string,
): Promise<UpdateMeetingVisibilityResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/hub/meetings/${meetingId}/restore`,
      method: 'POST',
    });
    return response.data as UpdateMeetingVisibilityResponse;
  } catch (error) {
    logger.error('恢复会议失败', error);
    throw error;
  }
}

export async function completeMeetingTodo(
  actionId: string,
  body: CompleteUserActionRequest,
): Promise<void> {
  try {
    await axiosForBackend({
      url: `/api/hub/actions/${actionId}/complete`,
      method: 'POST',
      data: body,
    });
  } catch (error) {
    logger.error('完成待办失败', error);
    throw error;
  }
}
