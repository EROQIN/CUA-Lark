export type ProductType = "im" | "docs" | "calendar" | "base" | "vc" | "mail" | "auto";

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
}
