export type ActionCategory = 'ai_direct' | 'user_owned' | 'ai_after_confirm';

export type ActionStatus =
  | 'planned'
  | 'awaiting_confirmation'
  | 'queued'
  | 'claimed'
  | 'executing'
  | 'done'
  | 'deferred'
  | 'cancelled'
  | 'failed';

export type MeetingActionOrigin = 'recognized' | 'user_added';

export type MeetingStatus =
  | 'upcoming'
  | 'ready'
  | 'awaiting_confirmation'
  | 'in_progress'
  | 'done'
  | 'ignored';

export type MeetingRecordType = 'scheduled' | 'minutes';
export type MeetingInvitationStatus = 'accepted' | 'invited';

export interface ActionResultLink {
  label: string;
  url: string;
  description?: string;
  kind?: 'deliverable' | 'source';
}

export interface MeetingSourceLinks {
  originalMinutes?: string;
  smartMinutes?: string;
  transcript?: string;
  generatedDocument?: string;
  agentFollowup?: string;
  calendarEvent?: string;
  joinMeeting?: string;
}

export interface MeetingAction {
  id: string;
  actionId: string;
  category: ActionCategory;
  title: string;
  description?: string;
  deliverable?: string;
  dependency?: string;
  dueAt?: string;
  status: ActionStatus;
  progress: number;
  confirmationRequired: boolean;
  origin?: MeetingActionOrigin;
  evidenceSummary?: string;
  resultLinks: ActionResultLink[];
}

export interface MeetingRecord {
  id: string;
  externalKey: string;
  recordType: MeetingRecordType;
  invitationStatus?: MeetingInvitationStatus;
  title: string;
  project?: string;
  startedAt: string;
  endedAt?: string;
  durationMinutes?: number;
  status: MeetingStatus;
  headline: string;
  summary?: string;
  decisions: string[];
  risks: string[];
  sourceLinks: MeetingSourceLinks;
  actions: MeetingAction[];
}

export interface MeetingHubOverview {
  meetings: MeetingRecord[];
  counts: {
    meetings: number;
    awaitingConfirmation: number;
    inProgress: number;
    done: number;
    upcoming: number;
  };
  agent: {
    paired: boolean;
    deviceName?: string;
    lastSeenAt?: string;
  };
}

export type MeetingSeriesSyncStatus =
  | 'not_started'
  | 'initializing'
  | 'ready'
  | 'degraded';

export type MeetingSeriesSyncMode = 'full' | 'incremental';

export type DailyBlankState = 'artifact' | 'quiet';

export type DailyBlankFeedback =
  | 'missed'
  | 'useful'
  | 'surprising'
  | 'remembered';

export type DailyBlankCompositionLayout =
  | 'flow'
  | 'spatial'
  | 'split'
  | 'sequence'
  | 'letter'
  | 'editorial'
  | 'constellation';

export type DailyBlankCompositionRole =
  | 'anchor'
  | 'statement'
  | 'question'
  | 'turn'
  | 'choice'
  | 'aside';

export interface DailyBlankCompositionElement {
  id: string;
  role: DailyBlankCompositionRole;
  label?: string;
  text: string;
  /** Optional expansion revealed when the user opens this part of the artifact. */
  detail?: string;
  /** Optional model-authored prompt used when continuing from this part. */
  prompt?: string;
  lane?: 1 | 2 | 3;
  emphasis?: 'normal' | 'accent' | 'quiet';
  linksTo: string[];
}

export interface DailyBlankComposition {
  /** The model invents this description; it is not a product template name. */
  formName: string;
  /** Layout is only a safe rendering primitive. */
  layout: DailyBlankCompositionLayout;
  elements: DailyBlankCompositionElement[];
}

export type DailyBlankVisualPlacement = 'centerpiece' | 'atmosphere';

export interface DailyBlankVisualSnapshot {
  /** Optional visual material authored by the same Agent run as this artifact. */
  type: 'image';
  source: 'agent';
  imageUrl: string;
  alt: string;
  placement: DailyBlankVisualPlacement;
}

export type DailyBlankCanvasHeight = 'compact' | 'standard' | 'immersive';

/**
 * A sandboxed HTML/CSS transport authored by Agent for this one artifact.
 * It is deliberately a transport, not a product layout or template name.
 */
export interface DailyBlankCanvasSnapshot {
  type: 'html';
  source: 'agent';
  markup: string;
  ariaLabel: string;
  height: DailyBlankCanvasHeight;
}

export interface DailyBlankSnapshot {
  id: string;
  date: string;
  state: DailyBlankState;
  title?: string;
  content?: string;
  whyNow?: string;
  conversationStarter?: string;
  composition?: DailyBlankComposition;
  visual?: DailyBlankVisualSnapshot;
  canvas?: DailyBlankCanvasSnapshot;
  contractVersion?: string;
  evidenceExternalKeys: string[];
  feedback?: DailyBlankFeedback;
  tags: string[];
  savedAt?: string;
  discardedAt?: string;
  generatedAt: string;
  expiresAt: string;
}

export type DailyBlankDrawState = 'pending' | 'ready';

export interface DailyBlankDrawRequest {
  id: string;
  sourceBlankId: string;
  state: DailyBlankDrawState;
  requestedAt: string;
  completedAt?: string;
  currentBlankId?: string;
}

export interface DailyBlankModelSubmission {
  state: DailyBlankState;
  title?: string;
  content?: string;
  whyNow?: string;
  conversationStarter?: string;
  composition?: DailyBlankComposition;
  visual?: DailyBlankVisualSnapshot;
  canvas?: DailyBlankCanvasSnapshot;
  contractVersion?: string;
  evidenceExternalKeys: string[];
  rawModelOutput: string;
}

export interface UploadDailyBlankAssetResponse {
  imageUrl: string;
  filePath: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  size: number;
}

export interface UpdateDailyBlankFeedbackRequest {
  feedback: DailyBlankFeedback;
}

export interface UpdateDailyBlankFeedbackResponse {
  dailyBlank: DailyBlankSnapshot;
  drawer?: DailyBlankSnapshot[];
  drawRequest?: DailyBlankDrawRequest;
}

export interface SaveAndRedrawDailyBlankRequest {
  tags: string[];
}

export type DailyBlankDisposition = 'discard' | 'discard_and_redraw' | 'restore';

export interface UpdateDailyBlankDispositionRequest {
  action: DailyBlankDisposition;
}

export interface UpdateDailyBlankDispositionResponse {
  dailyBlank: DailyBlankSnapshot;
  drawer: DailyBlankSnapshot[];
  drawRequest?: DailyBlankDrawRequest;
}

export interface SaveAndRedrawDailyBlankResponse {
  drawer: DailyBlankSnapshot[];
  drawRequest: DailyBlankDrawRequest;
}

export interface DailyBlankDrawRequestResponse {
  drawRequest?: DailyBlankDrawRequest;
}

export type OwnerInsightDimension =
  | 'communication'
  | 'work_style'
  | 'upward'
  | 'downward';

export type OwnerInsightBasis =
  | 'meeting_behavior'
  | 'thinking_pattern'
  | 'collaboration_pattern';

export interface OwnerInsightAdviceSnapshot {
  coach: string;
  supportive: string;
  advisory: string;
  balanced: string;
}

export interface OwnerInsightSnapshot {
  id: string;
  dimension: OwnerInsightDimension;
  basis: OwnerInsightBasis;
  observation: string;
  advice: OwnerInsightAdviceSnapshot;
  evidenceExternalKeys: string[];
  confidence: number;
}

export interface MeetingSeriesCandidateSnapshot {
  id: string;
  label: string;
  themeCluster?: string;
  meetingExternalKeys: string[];
  strength: number;
  confidence: number;
  matchReasons: string[];
  conflictSignals: string[];
  currentProgress?: string;
  nextConclusion?: string;
  matterInsight?: string;
  peopleInsight?: string;
  ownerInsights?: OwnerInsightSnapshot[];
}

export interface MeetingSeriesSnapshot {
  status: MeetingSeriesSyncStatus;
  generation: number;
  candidates: MeetingSeriesCandidateSnapshot[];
  meetingCount: number;
  sourceFingerprint?: string;
  historyFrom?: string;
  lastAttemptAt?: string;
  lastSuccessfulAt?: string;
  lastError?: string;
  model?: string;
  reasoningEffort?: string;
  dailyBlank?: DailyBlankSnapshot;
  dailyBlankDrawer: DailyBlankSnapshot[];
  dailyBlankDrawRequest?: DailyBlankDrawRequest;
}

export interface MeetingSeriesReadResponse {
  snapshot: MeetingSeriesSnapshot;
  meetings: MeetingRecord[];
}

export interface MeetingSeriesSourceRequest {
  mode?: MeetingSeriesSyncMode;
}

export interface MeetingSeriesSourceResponse extends MeetingSeriesReadResponse {
  sourceFingerprint: string;
  meetingFingerprints: Record<string, string>;
  changedExternalKeys: string[];
  actionPreferenceProfile: MeetingActionPreferenceProfile;
  recentDailyBlanks: DailyBlankSnapshot[];
}

export interface MeetingActionPreferenceSignal {
  count: number;
  examples: string[];
}

export interface MeetingActionPreferenceProfile {
  assignedRecognized: MeetingActionPreferenceSignal;
  cancelledRecognized: MeetingActionPreferenceSignal;
  userAdded: MeetingActionPreferenceSignal;
  updatedAt?: string;
}

export interface UpsertMeetingSeriesSnapshotRequest {
  mode: MeetingSeriesSyncMode;
  sourceFingerprint: string;
  sourceMeetingCount: number;
  meetingFingerprints: Record<string, string>;
  candidates: MeetingSeriesCandidateSnapshot[];
  completionEvidence?: MeetingActionCompletionEvidence[];
  dailyBlank?: DailyBlankModelSubmission;
  dailyBlankDrawRequestId?: string;
  dailyBlankRefresh?: boolean;
  model: string;
  reasoningEffort: 'low' | 'medium' | 'high';
}

export interface MeetingActionCompletionEvidence {
  actionId: string;
  evidenceMeetingExternalKey: string;
  evidenceSummary: string;
  confidence: number;
}

export interface UpsertMeetingSeriesSnapshotResponse {
  status: Extract<MeetingSeriesSyncStatus, 'ready'>;
  generation: number;
  candidateCount: number;
  retainedCount: number;
  completedActionCount: number;
  sourceFingerprint: string;
  meetingFingerprints: Record<string, string>;
  lastSuccessfulAt: string;
}

export interface MeetingActionInboxItem extends MeetingAction {
  meetingId: string;
  meetingTitle: string;
  meetingStartedAt: string;
  meetingSourceLinks: MeetingSourceLinks;
  sourceType: 'meeting' | 'capture';
}

export interface MeetingActionInbox {
  actions: MeetingActionInboxItem[];
  counts: {
    myTodos: number;
    awaitingConfirmation: number;
    aiInProgress: number;
    completed: number;
  };
}

export interface PairingCodeResponse {
  code: string;
  expiresAt: string;
}

export interface ConfirmActionResponse {
  actionId: string;
  status: Extract<ActionStatus, 'queued' | 'executing'>;
  commandId: string;
}

export interface ConfirmActionRequest {
  instruction?: string;
}

export interface CancelActionResponse {
  actionId: string;
  status: Extract<ActionStatus, 'cancelled'>;
}

export interface CreateMeetingAiTaskRequest {
  clientRequestId: string;
  instruction: string;
}

export interface CreateMeetingAiTaskResponse extends ConfirmActionResponse {}

export interface IgnoreMeetingActionsResponse {
  meetingId: string;
  ignoredCount: number;
  activeCount: number;
}

export interface IgnoredMeetingSummary {
  id: string;
  externalKey: string;
  title: string;
  startedAt: string;
  durationMinutes?: number;
}

export interface IgnoredMeetingsResponse {
  meetings: IgnoredMeetingSummary[];
}

export interface UpdateMeetingVisibilityResponse {
  meetingId: string;
  affectedRecordCount: number;
  visibility: 'ignored' | 'visible';
}

export type CaptureMode = 'record' | 'agent';

export interface CreateCaptureRequest {
  clientRequestId: string;
  text: string;
  mode: CaptureMode;
}

export interface CreateCaptureResponse {
  actionId: string;
  status: Extract<ActionStatus, 'planned' | 'queued'>;
  commandId?: string;
}

export interface StartCaptureResponse {
  actionId: string;
  status: ActionStatus;
  commandId: string;
}

export interface ReopenCaptureResponse {
  actionId: string;
  status: 'planned';
}

export type MeetingPreparationMode = 'quick' | 'deep';
export type MeetingPreparationOutput = 'brief' | 'lark_document';

export interface CreateMeetingPreparationRequest {
  force?: boolean;
  mode?: MeetingPreparationMode;
  output?: MeetingPreparationOutput;
  instruction?: string;
}

export interface CompleteUserActionRequest {
  evidenceSummary?: string;
  resultLinks?: ActionResultLink[];
}

export interface PairDeviceRequest {
  pairingCode: string;
  deviceName: string;
}

export interface PairDeviceResponse {
  deviceId: string;
  deviceToken: string;
}

export interface UpsertMeetingRequest {
  externalKey: string;
  /** Existing segment records explicitly confirmed to belong to this meeting. */
  supersedesExternalKeys?: string[];
  title: string;
  project?: string;
  startedAt: string;
  endedAt?: string;
  durationMinutes?: number;
  status: MeetingStatus;
  recordType?: MeetingRecordType;
  invitationStatus?: MeetingInvitationStatus;
  headline: string;
  summary?: string;
  decisions?: string[];
  risks?: string[];
  sourceLinks?: MeetingSourceLinks;
  /** Authoritative calendar instance keys for the supplied bounded window. */
  calendarSnapshot?: {
    windowStart: string;
    windowEnd: string;
    activeExternalKeys: string[];
  };
  /** Final role-filtered action snapshot. Missing pending actions may be deferred. */
  actionsAuthoritative?: boolean;
  actions?: Array<{
    actionId: string;
    category: ActionCategory;
    title: string;
    description?: string;
    deliverable?: string;
    dependency?: string;
    dueAt?: string;
    status?: ActionStatus;
    progress?: number;
    evidenceSummary?: string;
    resultLinks?: ActionResultLink[];
  }>;
}

export interface UpsertMeetingResponse {
  meetingId: string;
  created: boolean;
  actionCount: number;
  mergedCount?: number;
  removedCount?: number;
}

export interface ClaimCommandsRequest {
  limit?: number;
}

export interface AgentCommand {
  id: string;
  actionId: string;
  meetingId: string;
  /** Completion is accepted only after a generated Lark document is linked. */
  requiresDocument: boolean;
  title: string;
  meetingTitle: string;
  meetingStartedAt?: string;
  meetingDocumentUrl?: string;
  originalMinutesUrl?: string;
  deliverable?: string;
  dependency?: string;
  userInstruction?: string;
  preparationMode?: MeetingPreparationMode;
  preparationOutput?: MeetingPreparationOutput;
  relatedMeetings?: Array<{
    meetingId: string;
    title: string;
    startedAt: string;
    headline: string;
    summary?: string;
    decisions: string[];
    risks: string[];
    documentUrl?: string;
  }>;
  status: Extract<ActionStatus, 'queued' | 'claimed' | 'executing'>;
  leaseUntil?: string;
}

export interface ClaimCommandsResponse {
  commands: AgentCommand[];
}

export interface UpdateCommandRequest {
  status: Extract<ActionStatus, 'executing' | 'awaiting_confirmation' | 'done' | 'failed'>;
  progress?: number;
  evidenceSummary?: string;
  errorSummary?: string;
  resultLinks?: ActionResultLink[];
}

export interface UpdateCommandProgressRequest extends UpdateCommandRequest {
  commandId: string;
}

export interface UpdateCommandResponse {
  commandId: string;
  status: ActionStatus;
}
