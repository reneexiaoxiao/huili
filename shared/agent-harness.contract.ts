/**
 * Serializable contracts for the controlled Agent harness.
 *
 * These types describe proposals only. They do not grant permissions or execute
 * external effects. Runtime callers must also use the server-side validators and
 * policy gates before presenting or executing a proposal.
 */

export const EVIDENCE_SOURCE_TYPES = [
  'calendar',
  'minutes',
  'message',
  'document',
  'manual_input',
  'agent_result',
] as const;

export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

export type EvidenceAuthority = 'high' | 'standard';

export interface EvidenceRef {
  id: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  /** Stable position within the source, such as an event, paragraph or message id. */
  locator: string;
  observedAt: string;
  authoredAt?: string;
  authority: EvidenceAuthority;
  /** Short factual excerpt or description; never an unsupported conclusion. */
  excerpt: string;
}

export const DISCOVERY_KINDS = [
  'series_candidate',
  'insight',
  'suggestion',
  'generated_view',
] as const;

export type DiscoveryKind = (typeof DISCOVERY_KINDS)[number];

export const DISCOVERY_LIFECYCLE_STATES = [
  'proposed',
  'visible',
  'saved',
  'hidden',
  'corrected',
  'confirmed',
  'rejected',
  'withdrawn',
  'expired',
] as const;

export type DiscoveryLifecycleState =
  (typeof DISCOVERY_LIFECYCLE_STATES)[number];

export const USER_FEEDBACK_KINDS = [
  'save',
  'ignore',
  'correct',
  'prohibit',
  'convert_to_item',
  'generate_document',
  'confirm',
  'reject',
  'merge',
  'split',
  'exclude',
] as const;

export type UserFeedbackKind = (typeof USER_FEEDBACK_KINDS)[number];

export interface UserFeedback {
  id: string;
  kind: UserFeedbackKind;
  createdAt: string;
  /** User-authored correction/reason or a stable reference to its structured payload. */
  detail?: string;
  scope: 'this_proposal' | 'same_object' | 'same_kind';
}

export interface DiscoveryFreshness {
  newestEvidenceAt: string;
  changedSinceLastPresentation: boolean;
  changeSummary?: string;
}

export interface DiscoveryProposal<TPayload = unknown> {
  id: string;
  kind: DiscoveryKind;
  createdAt: string;
  updatedAt: string;
  confidence: number;
  evidence: EvidenceRef[];
  freshness: DiscoveryFreshness;
  lifecycle: DiscoveryLifecycleState;
  feedback: UserFeedback[];
  actionValue: 'none' | 'decision' | 'next_action';
  /** Required when actionValue is not none. */
  userDecisionOrNextAction?: string;
  payload: TPayload;
}

export const SERIES_CORRECTION_OPERATIONS = [
  'confirm',
  'merge',
  'split',
  'exclude',
  'correct',
  'prohibit_auto_grouping',
] as const;

export type SeriesCorrectionOperation =
  (typeof SERIES_CORRECTION_OPERATIONS)[number];

export interface SeriesMeetingRef {
  meetingId: string;
  evidenceRefIds: string[];
}

export interface SeriesCandidate {
  candidateId: string;
  proposedName?: string;
  meetingRefs: SeriesMeetingRef[];
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  matchReasons: string[];
  conflictSignals: string[];
  confidence: number;
  allowedCorrections: SeriesCorrectionOperation[];
  /** Always candidate until a user explicitly confirms it. */
  factStatus: 'candidate';
}

export interface PrimitiveBase {
  id: string;
  title?: string;
  evidenceRefIds: string[];
}

export interface TimelinePrimitive extends PrimitiveBase {
  type: 'timeline';
  items: Array<{ id: string; at: string; label: string; detail?: string }>;
}

export const GRAPH_RELATION_TYPES = [
  'progress',
  'decision',
  'blocker',
  'waiting',
  'output',
  'communication',
  'conflict',
] as const;

export type GraphRelationType = (typeof GRAPH_RELATION_TYPES)[number];
export type GraphRelationCertainty =
  | 'fact'
  | 'strong_inference'
  | 'weak_inference';
export type GraphRelationFreshness = 'current' | 'decaying' | 'stale';

export interface GraphPrimitive extends PrimitiveBase {
  type: 'graph';
  /** A semantic layout family only. Pixel coordinates remain renderer-owned. */
  layoutHint?: 'auto' | 'flow' | 'radial' | 'cluster';
  focusNodeId?: string;
  nodes: Array<{
    id: string;
    label: string;
    objectType: string;
    evidenceRefIds: string[];
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    label?: string;
    evidenceRefIds: string[];
    relationType: GraphRelationType;
    /** Independent-evidence strength normalized by the producer to 0..1. */
    strength: number;
    certainty: GraphRelationCertainty;
    freshness: GraphRelationFreshness;
  }>;
}

export interface BranchPrimitive extends PrimitiveBase {
  type: 'branch';
  question: string;
  options: Array<{ id: string; label: string; consequence: string }>;
}

export interface ComparisonPrimitive extends PrimitiveBase {
  type: 'comparison';
  columns: Array<{
    id: string;
    label: string;
    facts: Array<{ label: string; value: string }>;
  }>;
}

export interface BlockerPrimitive extends PrimitiveBase {
  type: 'blocker';
  chain: Array<{
    id: string;
    label: string;
    status: 'blocked' | 'waiting' | 'ready';
  }>;
}

export interface EvidencePrimitive extends PrimitiveBase {
  type: 'evidence';
  evidenceRefIds: string[];
}

export interface ActionPrimitive extends PrimitiveBase {
  type: 'action';
  label: string;
  /** Reference only; execution is governed by the ActionProposal contract. */
  actionProposalId: string;
}

export interface ConfirmationPrimitive extends PrimitiveBase {
  type: 'confirmation';
  actionProposalId: string;
  prompt: string;
}

export interface SourceDrawerPrimitive extends PrimitiveBase {
  type: 'source_drawer';
  evidenceRefIds: string[];
}

export interface UncertaintyPrimitive extends PrimitiveBase {
  type: 'uncertainty';
  statement: string;
  level: 'low' | 'medium' | 'high';
}

export type InsightPrimitive =
  | TimelinePrimitive
  | GraphPrimitive
  | BranchPrimitive
  | ComparisonPrimitive
  | BlockerPrimitive
  | EvidencePrimitive
  | ActionPrimitive
  | ConfirmationPrimitive
  | SourceDrawerPrimitive
  | UncertaintyPrimitive;

export const INSIGHT_PRIMITIVE_TYPES = [
  'timeline',
  'graph',
  'branch',
  'comparison',
  'blocker',
  'evidence',
  'action',
  'confirmation',
  'source_drawer',
  'uncertainty',
] as const;

export type InsightPrimitiveType = (typeof INSIGHT_PRIMITIVE_TYPES)[number];

export interface InsightView {
  id: string;
  title: string;
  summary?: string;
  primitives: InsightPrimitive[];
}

export const EXTERNAL_ACTION_TYPES = [
  'send_message',
  'create_task',
  'update_task',
  'create_calendar_event',
  'update_calendar_event',
  'create_document',
  'update_document',
  'start_agent',
] as const;

export type ExternalActionType = (typeof EXTERNAL_ACTION_TYPES)[number];

export type ActionConfirmationStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'expired'
  | 'revoked';

export interface ActionTargetPreview {
  objectType: 'person' | 'chat' | 'task' | 'calendar' | 'document' | 'agent';
  objectId: string;
  label: string;
}

export interface ActionImpactPreview {
  operation: ExternalActionType;
  targets: ActionTargetPreview[];
  /** Exact user-visible content or an exact normalized payload representation. */
  exactContent: string;
  consequences: string[];
  sourceEvidenceRefIds: string[];
  payloadDigest: string;
}

export interface ActionConfirmation {
  status: ActionConfirmationStatus;
  previewDigest: string;
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface ActionExecutionReceipt {
  status: 'succeeded' | 'failed';
  executedAt: string;
  externalObjectIds: string[];
  errorCode?: string;
}

export interface ActionProposal {
  id: string;
  type: ExternalActionType;
  createdAt: string;
  evidence: EvidenceRef[];
  preview: ActionImpactPreview;
  idempotencyKey: string;
  confirmation: ActionConfirmation;
  receipt?: ActionExecutionReceipt;
}
