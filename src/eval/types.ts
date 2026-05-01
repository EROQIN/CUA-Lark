import type { NativeGuiTurnResult, NativeTaskReport, ProductType } from "../core/types.js";

export type EvalMode = "online" | "offline";

export interface EvalExpected {
  finalStatus?: NativeTaskReport["finalStatus"];
  maxDurationMs?: number;
  maxTurns?: number;
  requiredTexts?: string[];
  requiredActionTypes?: string[];
  forbiddenTexts?: string[];
}

export interface EvalCase {
  id: string;
  title: string;
  product: ProductType;
  instruction: string;
  tags: string[];
  maxTurns?: number;
  stepDelayMs?: number;
  sendRealMessage?: boolean;
  contextIds?: string[];
  expected?: EvalExpected;
}

export interface EvalConfig {
  mode: EvalMode;
  caseSetPath: string;
  outputDir: string;
  maxCases?: number;
  stopOnFailure: boolean;
  vlmVerify: boolean;
}

export interface EvaluableRunReport {
  taskName: string;
  instruction: string;
  product: ProductType;
  userPrompt: string;
  parsedGoal: string;
  maxTurns?: number;
  finalStatus: NativeTaskReport["finalStatus"];
  startedAt?: string;
  endedAt?: string;
  durationMs: number;
  totalTurns: number;
  turnResults: NativeGuiTurnResult[];
  runId?: string;
  reportPath?: string;
  reportJsonPath?: string;
  sourceText: string;
  actionTypes: string[];
}

export interface VerificationResult {
  passed: boolean;
  method: "rules" | "rules+vlm";
  reasons: string[];
  rule: {
    passed: boolean;
    reasons: string[];
  };
  vlm?: {
    enabled: boolean;
    passed?: boolean;
    reason?: string;
  };
}

export interface EvalCaseResult {
  caseId: string;
  title: string;
  product: ProductType;
  tags: string[];
  passed: boolean;
  runId?: string;
  finalStatus: NativeTaskReport["finalStatus"];
  durationMs: number;
  turnCount: number;
  actionCount: number;
  verification: VerificationResult;
  failureReason: string;
  reportPath?: string;
  reportJsonPath?: string;
}

export interface EvalMetricTotals {
  caseCount: number;
  passed: number;
  failed: number;
  successRate: number;
  avgDurationMs: number;
  avgTurns: number;
  avgActions: number;
}

export interface EvalSummary {
  evalRunId: string;
  mode: EvalMode;
  startedAt: string;
  endedAt: string;
  totals: EvalMetricTotals & {
    failureReasons: Record<string, number>;
  };
  byProduct: Record<string, EvalMetricTotals>;
  cases: EvalCaseResult[];
  artifacts?: {
    summaryJsonPath?: string;
    summaryMarkdownPath?: string;
    dashboardPath?: string;
  };
}
