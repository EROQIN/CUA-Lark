import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { NativeGuiTurnResult, NativeTaskReport, ProductType, WorkflowReport } from "../core/types.js";
import type { EvaluableRunReport } from "./types.js";

const productTypes = new Set(["im", "docs", "calendar", "base", "vc", "mail", "auto"]);
const finalStatuses = new Set(["success", "failed", "max_turns"]);

export async function readOfflineRunReports(runsDir: string, maxReports?: number): Promise<EvaluableRunReport[]> {
  const entries = await readdir(runsDir, { withFileTypes: true });
  const runDirs = entries
    .filter((entry) => entry.isDirectory() && entry.name !== "evaluations")
    .map((entry) => path.join(runsDir, entry.name))
    .sort();

  const reports: EvaluableRunReport[] = [];
  for (const runDir of runDirs) {
    const report = await readRunReport(runDir);
    if (report) {
      reports.push(report);
      if (maxReports && reports.length >= maxReports) {
        break;
      }
    }
  }
  return reports;
}

export async function readRunReport(runDir: string): Promise<EvaluableRunReport | undefined> {
  const workflowJsonPath = path.join(runDir, "workflow-report.json");
  if (await fileExists(workflowJsonPath)) {
    const raw = await readFile(workflowJsonPath, "utf8");
    const parsed = JSON.parse(raw) as WorkflowReport;
    return workflowReportToEvaluable(parsed, {
      runId: parsed.workflowRunId ?? path.basename(runDir),
      workflowReportPath: parsed.workflowReportPath ?? workflowJsonPath,
      workflowReportMarkdownPath: parsed.workflowReportMarkdownPath ?? path.join(runDir, "workflow-report.md")
    });
  }

  const jsonPath = path.join(runDir, "report.json");
  if (await fileExists(jsonPath)) {
    const raw = await readFile(jsonPath, "utf8");
    const parsed = JSON.parse(raw) as NativeTaskReport;
    const defaultReportHtmlPath = path.join(runDir, "index.html");
    const parsedReportHtmlPath =
      parsed.reportHtmlPath && (await fileExists(parsed.reportHtmlPath)) ? parsed.reportHtmlPath : undefined;
    const reportHtmlPath = parsedReportHtmlPath ?? ((await fileExists(defaultReportHtmlPath)) ? defaultReportHtmlPath : undefined);
    return nativeReportToEvaluable(parsed, {
      runId: parsed.runId ?? path.basename(runDir),
      reportPath: parsed.reportPath ?? path.join(runDir, "report.md"),
      reportJsonPath: parsed.reportJsonPath ?? jsonPath,
      reportHtmlPath
    });
  }

  const markdownPath = path.join(runDir, "report.md");
  if (await fileExists(markdownPath)) {
    return markdownReportToEvaluable(await readFile(markdownPath, "utf8"), markdownPath, path.basename(runDir));
  }

  return undefined;
}

export function workflowReportToEvaluable(
  report: WorkflowReport,
  defaults: Partial<
    Pick<EvaluableRunReport, "runId" | "workflowReportPath" | "workflowReportMarkdownPath">
  > = {}
): EvaluableRunReport {
  return {
    taskName: report.title,
    instruction: report.extractedInstruction || report.title,
    product: "auto",
    userPrompt: report.extractedInstruction ?? "",
    parsedGoal: report.title,
    finalStatus: normalizeFinalStatus(report.finalStatus),
    startedAt: report.startedAt,
    endedAt: report.endedAt,
    durationMs: report.durationMs,
    totalTurns: report.totalTurns,
    turnResults: [],
    runId: report.workflowRunId ?? defaults.runId,
    reportPath: report.workflowReportMarkdownPath ?? defaults.workflowReportMarkdownPath,
    reportJsonPath: report.workflowReportPath ?? defaults.workflowReportPath,
    sourceText: buildWorkflowSourceText(report),
    actionTypes: report.actionTypes ?? [],
    productTrail: report.productTrail,
    workflowPhaseCount: report.workflowPhases.length,
    workflowPassedPhaseCount: report.workflowPhases.filter((phase) => phase.passed).length,
    recoveryCount: report.recoveryCount,
    advancedEvents: report.advancedEvents,
    workflowReportPath: report.workflowReportPath ?? defaults.workflowReportPath,
    workflowReportMarkdownPath: report.workflowReportMarkdownPath ?? defaults.workflowReportMarkdownPath
  };
}

export function nativeReportToEvaluable(
  report: NativeTaskReport,
  defaults: Partial<Pick<EvaluableRunReport, "runId" | "reportPath" | "reportJsonPath" | "reportHtmlPath">> = {}
): EvaluableRunReport {
  const actionTypes = extractActionTypesFromTurns(report.turnResults);
  return {
    taskName: report.taskName,
    instruction: report.instruction,
    product: normalizeProduct(report.product),
    userPrompt: report.userPrompt,
    parsedGoal: report.parsedGoal,
    maxTurns: report.maxTurns,
    finalStatus: normalizeFinalStatus(report.finalStatus),
    startedAt: report.startedAt,
    endedAt: report.endedAt,
    durationMs: report.durationMs,
    totalTurns: report.totalTurns,
    turnResults: report.turnResults,
    runId: report.runId ?? defaults.runId,
    reportPath: report.reportPath ?? defaults.reportPath,
    reportJsonPath: report.reportJsonPath ?? defaults.reportJsonPath,
    reportHtmlPath: report.reportHtmlPath ?? defaults.reportHtmlPath,
    sourceText: buildNativeSourceText(report),
    actionTypes
  };
}

function markdownReportToEvaluable(markdown: string, reportPath: string, runId: string): EvaluableRunReport {
  const taskName = readHeading(markdown) || "Historical Run";
  const totalSteps = readNumberField(markdown, "Total Steps");
  const failedSteps = readNumberField(markdown, "Failed Steps");
  const finalStatus = readField(markdown, "Final Status");
  const product = readField(markdown, "Product");
  const actionTypes = extractActionTypesFromMarkdown(markdown);

  return {
    taskName,
    instruction: readField(markdown, "Instruction") || readField(markdown, "Scenario") || taskName,
    product: normalizeProduct(product),
    userPrompt: readField(markdown, "User Prompt") || "",
    parsedGoal: readField(markdown, "Parsed Goal") || "",
    maxTurns: readNumberField(markdown, "Max Turns"),
    finalStatus: finalStatus ? normalizeFinalStatus(finalStatus) : failedSteps && failedSteps > 0 ? "failed" : "success",
    startedAt: readField(markdown, "Started At") || undefined,
    endedAt: readField(markdown, "Ended At") || undefined,
    durationMs: readNumberField(markdown, "Duration") ?? 0,
    totalTurns: readNumberField(markdown, "Total Turns") ?? totalSteps ?? actionTypes.length,
    turnResults: [],
    runId: readField(markdown, "Run ID") || runId,
    reportPath,
    sourceText: markdown,
    actionTypes
  };
}

export function countExecutableActions(actionTypes: string[]): number {
  return actionTypes.filter((actionType) => actionType !== "finished").length;
}

export function extractActionTypesFromTurns(turns: NativeGuiTurnResult[]): string[] {
  return turns.flatMap((turn) => extractActionTypes(turn.parsedPrediction));
}

function extractActionTypes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(extractActionTypes);
  }
  if (!isRecord(value)) {
    return [];
  }
  const ownAction = typeof value.action_type === "string" ? [value.action_type] : [];
  return [...ownAction, ...Object.values(value).flatMap(extractActionTypes)];
}

function extractActionTypesFromMarkdown(markdown: string): string[] {
  const actionTypes: string[] = [];
  for (const match of markdown.matchAll(/"action_type"\s*:\s*"([^"]+)"/g)) {
    actionTypes.push(match[1]);
  }
  for (const match of markdown.matchAll(/^Action:\s*([a-zA-Z_]+)/gm)) {
    actionTypes.push(match[1]);
  }
  for (const match of markdown.matchAll(/^- Action:\s*([a-zA-Z_]+)/gm)) {
    actionTypes.push(match[1]);
  }
  return actionTypes;
}

function buildNativeSourceText(report: NativeTaskReport): string {
  return [
    report.taskName,
    report.instruction,
    report.userPrompt,
    report.parsedGoal,
    report.finalStatus,
    ...report.turnResults.flatMap((turn) => [
      turn.status,
      turn.prediction ?? "",
      turn.error ?? "",
      turn.parsedPrediction === undefined ? "" : JSON.stringify(turn.parsedPrediction)
    ])
  ].join("\n");
}

function buildWorkflowSourceText(report: WorkflowReport): string {
  return [
    report.title,
    report.workflowId,
    report.entry,
    report.inboxGroupName ?? "",
    report.extractedInstruction ?? "",
    report.finalStatus,
    report.productTrail.join(" -> "),
    ...report.workflowPhases.flatMap((phase) => [
      phase.id,
      phase.title,
      phase.product,
      phase.finalStatus,
      phase.failureReason,
      phase.reportPath ?? ""
    ]),
    ...report.advancedEvents.flatMap((event) => [
      event.type,
      event.phaseId ?? "",
      event.message,
      event.evidence ?? ""
    ])
  ].join("\n");
}

function readHeading(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+(?:UI-TARS GUIAgent Task:\s*)?(?:Scenario:\s*)?(.+)$/m);
  return match?.[1]?.trim();
}

function readField(markdown: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^${escaped}:\\s*(.*)$`, "m"));
  return match?.[1]?.trim();
}

function readNumberField(markdown: string, label: string): number | undefined {
  const raw = readField(markdown, label);
  if (!raw) {
    return undefined;
  }
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return undefined;
  }
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : undefined;
}

function normalizeProduct(value: unknown): ProductType {
  return typeof value === "string" && productTypes.has(value) ? (value as ProductType) : "auto";
}

function normalizeFinalStatus(value: unknown): NativeTaskReport["finalStatus"] {
  return typeof value === "string" && finalStatuses.has(value) ? (value as NativeTaskReport["finalStatus"]) : "failed";
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
