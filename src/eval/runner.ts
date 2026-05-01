import path from "node:path";
import type { AppConfig } from "../config/env.js";
import { CUALarkAgent } from "../core/agent.js";
import type { AgentTask, NativeTaskReport } from "../core/types.js";
import { createCustomTask } from "../tasks/task-factory.js";
import { createRunId, nowIso } from "../utils/time.js";
import { loadEvalCases } from "./case-loader.js";
import { buildEvalSummary } from "./metrics.js";
import { countExecutableActions, nativeReportToEvaluable, readOfflineRunReports } from "./report-reader.js";
import { writeEvaluationArtifacts } from "./reporting.js";
import type { EvaluableRunReport, EvalCase, EvalCaseResult, EvalConfig, EvalSummary } from "./types.js";
import { verifyRunReport } from "./verifier.js";

export async function runEvaluation(evalConfig: EvalConfig, appConfig: AppConfig): Promise<EvalSummary> {
  return evalConfig.mode === "offline"
    ? runOfflineEvaluation(evalConfig, appConfig)
    : runOnlineEvaluation(evalConfig, appConfig);
}

async function runOnlineEvaluation(evalConfig: EvalConfig, appConfig: AppConfig): Promise<EvalSummary> {
  const evalRunId = createRunId();
  const outputDir = path.join(evalConfig.outputDir, evalRunId);
  const startedAt = nowIso();
  const cases = await loadEvalCases(evalConfig.caseSetPath, evalConfig.maxCases);
  const agent = new CUALarkAgent(appConfig);
  const results: EvalCaseResult[] = [];

  for (const evalCase of cases) {
    const task = createTaskForCase(evalCase, appConfig);
    const report = await agent.runTask(task);
    const result = await buildOnlineResult(evalCase, report, evalConfig, appConfig);
    results.push(result);

    if (evalConfig.stopOnFailure && !result.passed) {
      break;
    }
  }

  const summary = buildEvalSummary(evalRunId, "online", startedAt, nowIso(), results);
  return writeEvaluationArtifacts(summary, outputDir);
}

async function runOfflineEvaluation(evalConfig: EvalConfig, appConfig: AppConfig): Promise<EvalSummary> {
  const evalRunId = createRunId();
  const outputDir = path.join(evalConfig.outputDir, evalRunId);
  const startedAt = nowIso();
  const reports = await readOfflineRunReports(appConfig.runsDir, evalConfig.maxCases);
  const results: EvalCaseResult[] = [];

  for (const report of reports) {
    const result = await buildOfflineResult(report, evalConfig, appConfig);
    results.push(result);

    if (evalConfig.stopOnFailure && !result.passed) {
      break;
    }
  }

  const summary = buildEvalSummary(evalRunId, "offline", startedAt, nowIso(), results);
  return writeEvaluationArtifacts(summary, outputDir);
}

function createTaskForCase(evalCase: EvalCase, appConfig: AppConfig): AgentTask {
  const base = createCustomTask(appConfig, evalCase.instruction);
  return {
    ...base,
    name: `Eval ${evalCase.id}: ${evalCase.title}`,
    instruction: evalCase.instruction,
    userPrompt: evalCase.instruction,
    product: evalCase.product,
    parsedGoal: base.parsedGoal || evalCase.title,
    maxTurns: evalCase.maxTurns ?? base.maxTurns,
    stepDelayMs: evalCase.stepDelayMs ?? base.stepDelayMs,
    sendRealMessage: evalCase.sendRealMessage ?? base.sendRealMessage,
    contextIds: evalCase.contextIds?.length ? evalCase.contextIds : base.contextIds
  };
}

async function buildOnlineResult(
  evalCase: EvalCase,
  report: NativeTaskReport,
  evalConfig: EvalConfig,
  appConfig: AppConfig
): Promise<EvalCaseResult> {
  const evaluable = nativeReportToEvaluable(report);
  const verification = await verifyRunReport(evaluable, evalCase.expected, {
    vlmVerify: evalConfig.vlmVerify,
    appConfig
  });

  return {
    caseId: evalCase.id,
    title: evalCase.title,
    product: evalCase.product,
    tags: evalCase.tags,
    passed: verification.passed,
    runId: report.runId,
    finalStatus: report.finalStatus,
    durationMs: report.durationMs,
    turnCount: report.totalTurns,
    actionCount: countExecutableActions(evaluable.actionTypes),
    verification,
    failureReason: verification.reasons[0] ?? "",
    reportPath: report.reportPath,
    reportJsonPath: report.reportJsonPath
  };
}

async function buildOfflineResult(
  report: EvaluableRunReport,
  evalConfig: EvalConfig,
  appConfig: AppConfig
): Promise<EvalCaseResult> {
  const verification = await verifyRunReport(report, undefined, {
    vlmVerify: evalConfig.vlmVerify,
    appConfig
  });

  return {
    caseId: report.runId ?? report.taskName,
    title: report.taskName,
    product: report.product,
    tags: ["offline"],
    passed: verification.passed,
    runId: report.runId,
    finalStatus: report.finalStatus,
    durationMs: report.durationMs,
    turnCount: report.totalTurns,
    actionCount: countExecutableActions(report.actionTypes),
    verification,
    failureReason: verification.reasons[0] ?? "",
    reportPath: report.reportPath,
    reportJsonPath: report.reportJsonPath
  };
}
