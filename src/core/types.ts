export type ProductType = "im" | "docs" | "calendar" | "base" | "vc" | "mail" | "auto";

export type AdvancedEventType =
  | "popup_detected"
  | "permission_blocked"
  | "loading_timeout"
  | "alternate_path"
  | "self_heal_retry"
  | "cross_product_handoff";

export interface AgentTask {
  name: string;
  instruction: string;
  product: ProductType;
  userPrompt: string;
  parsedGoal: string;
  groupName?: string;
  messageContent?: string;
  documentTitle?: string;
  documentBody?: string;
  maxTurns: number;
  stepDelayMs: number;
  sendRealMessage: boolean;
  contextIds?: string[];
}

export interface AdvancedEvent {
  type: AdvancedEventType;
  message: string;
  detectedAt: string;
  phaseId?: string;
  evidence?: string;
}

export interface WorkflowStep {
  id: string;
  title: string;
  product: ProductType;
  instruction: string;
  contextIds?: string[];
  expectedTexts?: string[];
  maxTurns?: number;
  stepDelayMs?: number;
  sendRealMessage?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  title: string;
  entry: "direct" | "im-inbox";
  inboxGroupName?: string;
  autoReplyStatus?: boolean;
  steps: WorkflowStep[];
}

export interface WorkflowPhaseReport {
  id: string;
  title: string;
  product: ProductType;
  attempt: number;
  finalStatus: NativeTaskReport["finalStatus"];
  passed: boolean;
  runId?: string;
  reportPath?: string;
  reportJsonPath?: string;
  durationMs: number;
  totalTurns: number;
  actionCount: number;
  failureReason: string;
}

export interface WorkflowReport {
  workflowRunId: string;
  workflowId: string;
  title: string;
  entry: WorkflowDefinition["entry"];
  inboxGroupName?: string;
  extractedInstruction?: string;
  finalStatus: NativeTaskReport["finalStatus"];
  productTrail: ProductType[];
  workflowPhases: WorkflowPhaseReport[];
  advancedEvents: AdvancedEvent[];
  recoveryCount: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  totalTurns: number;
  actionCount: number;
  actionTypes: string[];
  workflowReportPath?: string;
  workflowReportMarkdownPath?: string;
}

export interface OperationContext {
  id: string;
  product: ProductType;
  title: string;
  triggers: string[];
  whenToUse: string;
  description: string[];
  commonActions: string[];
  safetyRules: string[];
}

export interface NativeGuiTurnResult {
  turn: number;
  status: string;
  prediction?: string;
  parsedPrediction?: unknown;
  screenshotPath?: string;
  screenshotSize?: {
    width: number;
    height: number;
  };
  scaleFactor?: number;
  elapsedMs?: number;
  durationMs?: number;
  error?: string;
}

export interface NativeTaskReport {
  taskName: string;
  instruction: string;
  product: ProductType;
  userPrompt: string;
  parsedGoal: string;
  maxTurns: number;
  finalStatus: "success" | "failed" | "max_turns";
  startedAt: string;
  endedAt: string;
  durationMs: number;
  totalTurns: number;
  actionCount?: number;
  turnResults: NativeGuiTurnResult[];
  runId?: string;
  reportPath?: string;
  reportJsonPath?: string;
  reportHtmlPath?: string;
}
