import path from "node:path";
import type { AppConfig } from "../config/env.js";
import { CUALarkAgent } from "../core/agent.js";
import type { AgentTask, NativeTaskReport, WorkflowReport } from "../core/types.js";
import { createCustomTask } from "../tasks/task-factory.js";
import { WorkflowRunner } from "../workflow/workflow-runner.js";
import { createRunId, nowIso } from "../utils/time.js";
import { loadEvalCases } from "./case-loader.js";
import { buildEvalSummary } from "./metrics.js";
import {
  countExecutableActions,
  nativeReportToEvaluable,
  readOfflineRunReports,
  workflowReportToEvaluable
} from "./report-reader.js";
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
  const cases = await loadEvalCases(evalConfig.caseSetPath, evalConfig.maxCases, evalConfig.caseIds);
  const agent = new CUALarkAgent({
    ...appConfig,
    notification: {
      ...appConfig.notification,
      taskComplete: false
    }
  });
  const workflowRunner = new WorkflowRunner({
    ...appConfig,
    notification: {
      ...appConfig.notification,
      taskComplete: false
    }
  });
  const results: EvalCaseResult[] = [];

  for (const evalCase of cases) {
    const result = evalCase.workflow
      ? await buildWorkflowOnlineResult(evalCase, await workflowRunner.runWorkflow(evalCase.workflow), evalConfig, appConfig)
      : await buildOnlineResult(evalCase, await agent.runTask(createTaskForCase(evalCase, appConfig)), evalConfig, appConfig);
    results.push(result);

    if (evalConfig.stopOnFailure && !result.passed) {
      break;
    }
  }

  const summary = buildEvalSummary(evalRunId, "online", startedAt, nowIso(), results);
  return writeEvaluationArtifacts(summary, outputDir);
}

async function buildWorkflowOnlineResult(
  evalCase: EvalCase,
  report: WorkflowReport,
  evalConfig: EvalConfig,
  appConfig: AppConfig
): Promise<EvalCaseResult> {
  const evaluable = workflowReportToEvaluable(report);
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
    runId: report.workflowRunId,
    finalStatus: report.finalStatus,
    durationMs: report.durationMs,
    turnCount: report.totalTurns,
    actionCount: report.actionCount,
    verification,
    failureReason: verification.reasons[0] ?? firstWorkflowFailure(report),
    reportPath: report.workflowReportMarkdownPath,
    reportJsonPath: report.workflowReportPath,
    productTrail: report.productTrail,
    workflowPhaseCount: report.workflowPhases.length,
    workflowPassedPhaseCount: report.workflowPhases.filter((phase) => phase.passed).length,
    recoveryCount: report.recoveryCount,
    advancedEvents: report.advancedEvents,
    workflowReportPath: report.workflowReportPath,
    workflowReportMarkdownPath: report.workflowReportMarkdownPath
  };
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
    reportJsonPath: report.reportJsonPath,
    reportHtmlPath: report.reportHtmlPath
  };
}

function firstWorkflowFailure(report: WorkflowReport): string {
  return report.workflowPhases.find((phase) => !phase.passed)?.failureReason ?? "";
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
    reportJsonPath: report.reportJsonPath,
    reportHtmlPath: report.reportHtmlPath,
    productTrail: report.productTrail,
    workflowPhaseCount: report.workflowPhaseCount,
    workflowPassedPhaseCount: report.workflowPassedPhaseCount,
    recoveryCount: report.recoveryCount,
    advancedEvents: report.advancedEvents,
    workflowReportPath: report.workflowReportPath,
    workflowReportMarkdownPath: report.workflowReportMarkdownPath
  };
}
