import type { EvalCaseResult, EvalMetricTotals, EvalMode, EvalSummary } from "./types.js";

export function buildEvalSummary(
  evalRunId: string,
  mode: EvalMode,
  startedAt: string,
  endedAt: string,
  cases: EvalCaseResult[]
): EvalSummary {
  return {
    evalRunId,
    mode,
    startedAt,
    endedAt,
    totals: {
      ...computeTotals(cases),
      failureReasons: computeFailureReasons(cases)
    },
    byProduct: computeByProduct(cases),
    cases
  };
}

function computeByProduct(cases: EvalCaseResult[]): Record<string, EvalMetricTotals> {
  const grouped = new Map<string, EvalCaseResult[]>();
  for (const item of cases) {
    grouped.set(item.product, [...(grouped.get(item.product) ?? []), item]);
  }
  return Object.fromEntries([...grouped.entries()].map(([product, items]) => [product, computeTotals(items)]));
}

function computeTotals(cases: EvalCaseResult[]): EvalMetricTotals {
  const caseCount = cases.length;
  const passed = cases.filter((item) => item.passed).length;
  const failed = caseCount - passed;
  return {
    caseCount,
    passed,
    failed,
    successRate: caseCount ? round((passed / caseCount) * 100) : 0,
    avgDurationMs: round(avg(cases.map((item) => item.durationMs))),
    avgTurns: round(avg(cases.map((item) => item.turnCount))),
    avgActions: round(avg(cases.map((item) => item.actionCount)))
  };
}

function computeFailureReasons(cases: EvalCaseResult[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const item of cases) {
    if (!item.passed) {
      const reason = item.failureReason || "unknown";
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

function avg(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
