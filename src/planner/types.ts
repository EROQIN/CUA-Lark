import type { LocateResult, Observation } from "../core/types.js";

export type PlannerActionType = "locate_and_click" | "type_text" | "hotkey" | "wait" | "screenshot" | "finish" | "fail";

export interface AgentTask {
  name: string;
  instruction: string;
  groupName: string;
  messageContent: string;
  maxTurns: number;
  stepDelayMs: number;
  sendRealMessage: boolean;
}

export interface PlannerDecision {
  thought: string;
  nextAction: PlannerActionType;
  target?: string;
  text?: string;
  hotkeys?: string[];
  timeoutMs?: number;
  successCriteria?: string;
  reason: string;
}

export interface PlannerTurnSummary {
  turn: number;
  action: PlannerActionType;
  target?: string;
  text?: string;
  success: boolean;
  error?: string;
}

export interface PlannerState {
  task: AgentTask;
  turn: number;
  screenshotPath: string;
  history: PlannerTurnSummary[];
}

export interface PlannerResult {
  success: boolean;
  rawResponse: string;
  decision?: PlannerDecision;
  error?: string;
}

export interface TaskTurnResult {
  turn: number;
  beforeObservation: Observation;
  afterObservation: Observation;
  plannerResult: PlannerResult;
  decision?: PlannerDecision;
  locateResult?: LocateResult;
  success: boolean;
  durationMs: number;
  errorStage?: "screenshot" | "plan" | "locate" | "execute" | "verify" | "max_turns";
  error?: string;
  verification?: {
    success: boolean;
    method: string;
    reason?: string;
  };
}

export interface TaskReport {
  taskName: string;
  instruction: string;
  groupName: string;
  messageContent: string;
  sendRealMessage: boolean;
  maxTurns: number;
  finalStatus: "success" | "failed" | "max_turns";
  startedAt: string;
  endedAt: string;
  durationMs: number;
  totalTurns: number;
  turnResults: TaskTurnResult[];
  runId?: string;
  reportPath?: string;
}
