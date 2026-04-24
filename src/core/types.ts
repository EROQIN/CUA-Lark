export type ActionType =
  | "click"
  | "double_click"
  | "right_click"
  | "type_text"
  | "hotkey"
  | "scroll"
  | "wait"
  | "screenshot";

export interface Position {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AgentAction {
  id: string;
  type: ActionType;
  description: string;
  target?: string;
  position?: Position;
  text?: string;
  hotkeys?: string[];
  scrollDelta?: number;
  timeoutMs?: number;
}

export interface Observation {
  timestamp: string;
  screenshotPath: string;
  windowTitle?: string;
  extra?: Record<string, unknown>;
}

export interface LocateRequest {
  target?: string;
  actionType: ActionType;
  screenContext: Observation;
  hints?: {
    manualPosition?: Position;
    [key: string]: unknown;
  };
}

export interface LocateResult {
  success: boolean;
  target?: string;
  bbox?: BoundingBox;
  point?: Position;
  confidence: number;
  sources: string[];
  reason?: string;
  rawResponse?: string;
  candidates?: unknown[];
  error?: string;
}

export interface VerificationResult {
  success: boolean;
  method: string;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface StepResult {
  action: AgentAction;
  beforeObservation: Observation;
  afterObservation: Observation;
  success: boolean;
  durationMs: number;
  errorStage?: "screenshot" | "locate" | "execute" | "verify";
  error?: string;
  verification?: VerificationResult;
  locateResult?: LocateResult;
}

export interface TestReport {
  scenarioName: string;
  startedAt: string;
  endedAt: string;
  totalSteps: number;
  successSteps: number;
  failedSteps: number;
  durationMs: number;
  stepResults: StepResult[];
  reportPath?: string;
  runId?: string;
}

export interface TestScenario {
  name: string;
  actions: AgentAction[];
}

export interface RunContext {
  runId: string;
  runDir: string;
}
