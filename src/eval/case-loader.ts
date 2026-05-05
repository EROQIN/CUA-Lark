import { readFile } from "node:fs/promises";
import type { WorkflowDefinition, WorkflowStep } from "../core/types.js";
import type { EvalCase, EvalExpected } from "./types.js";

const productTypes = new Set(["im", "docs", "calendar", "base", "vc", "mail", "auto"]);
const finalStatuses = new Set(["success", "failed", "max_turns"]);
const workflowEntries = new Set(["direct", "im-inbox"]);

export async function loadEvalCases(caseSetPath: string, maxCases?: number, caseIds: string[] = []): Promise<EvalCase[]> {
  const raw = await readFile(caseSetPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const cases = Array.isArray(parsed) ? parsed : readCasesProperty(parsed);
  const validated = cases.map((item, index) => validateEvalCase(item, index));
  const filtered = filterByCaseIds(validated, caseIds);
  return maxCases ? filtered.slice(0, maxCases) : filtered;
}

function filterByCaseIds(cases: EvalCase[], caseIds: string[]): EvalCase[] {
  if (!caseIds.length) {
    return cases;
  }
  const idSet = new Set(caseIds);
  const filtered = cases.filter((item) => idSet.has(item.id));
  const missing = caseIds.filter((id) => !cases.some((item) => item.id === id));
  if (missing.length) {
    throw new Error(`Eval case id not found: ${missing.join(", ")}`);
  }
  return filtered;
}

function readCasesProperty(value: unknown): unknown[] {
  if (!isRecord(value) || !Array.isArray(value.cases)) {
    throw new Error("Eval case set must be an array or an object with a cases array.");
  }
  return value.cases;
}

function validateEvalCase(value: unknown, index: number): EvalCase {
  if (!isRecord(value)) {
    throw new Error(`Eval case at index ${index} must be an object.`);
  }

  const id = readRequiredString(value, "id", index);
  const title = readRequiredString(value, "title", index);
  const product = readRequiredString(value, "product", index);
  const instruction = readRequiredString(value, "instruction", index);

  if (!productTypes.has(product)) {
    throw new Error(`Eval case ${id} has unsupported product: ${product}`);
  }

  return {
    id,
    title,
    product: product as EvalCase["product"],
    instruction,
    tags: readStringArray(value.tags, "tags", id, true),
    maxTurns: readOptionalPositiveNumber(value.maxTurns, "maxTurns", id),
    stepDelayMs: readOptionalPositiveNumber(value.stepDelayMs, "stepDelayMs", id),
    sendRealMessage: readOptionalBoolean(value.sendRealMessage, "sendRealMessage", id),
    contextIds: readStringArray(value.contextIds, "contextIds", id, true),
    expected: validateExpected(value.expected, id),
    workflow: validateWorkflow(value.workflow, id)
  };
}

function validateWorkflow(value: unknown, caseId: string): WorkflowDefinition | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`Eval case ${caseId} workflow must be an object.`);
  }

  const id = readRequiredWorkflowString(value, "id", caseId);
  const title = readRequiredWorkflowString(value, "title", caseId);
  const entry = readRequiredWorkflowString(value, "entry", caseId);
  if (!workflowEntries.has(entry)) {
    throw new Error(`Eval case ${caseId} has unsupported workflow.entry: ${entry}`);
  }
  if (!Array.isArray(value.steps) || !value.steps.length) {
    throw new Error(`Eval case ${caseId} workflow.steps must be a non-empty array.`);
  }

  return {
    id,
    title,
    entry: entry as WorkflowDefinition["entry"],
    inboxGroupName: readOptionalString(value.inboxGroupName, "workflow.inboxGroupName", caseId),
    autoReplyStatus: readOptionalBoolean(value.autoReplyStatus, "workflow.autoReplyStatus", caseId),
    steps: value.steps.map((item, index) => validateWorkflowStep(item, caseId, index))
  };
}

function validateWorkflowStep(value: unknown, caseId: string, index: number): WorkflowStep {
  if (!isRecord(value)) {
    throw new Error(`Eval case ${caseId} workflow step at index ${index} must be an object.`);
  }
  const id = readRequiredWorkflowString(value, "id", caseId);
  const title = readRequiredWorkflowString(value, "title", caseId);
  const product = readRequiredWorkflowString(value, "product", caseId);
  const instruction = readRequiredWorkflowString(value, "instruction", caseId);
  if (!productTypes.has(product)) {
    throw new Error(`Eval case ${caseId} workflow step ${id} has unsupported product: ${product}`);
  }

  return {
    id,
    title,
    product: product as WorkflowStep["product"],
    instruction,
    contextIds: readStringArray(value.contextIds, "workflow.steps.contextIds", caseId, true),
    expectedTexts: readStringArray(value.expectedTexts, "workflow.steps.expectedTexts", caseId, true),
    maxTurns: readOptionalPositiveNumber(value.maxTurns, "workflow.steps.maxTurns", caseId),
    stepDelayMs: readOptionalPositiveNumber(value.stepDelayMs, "workflow.steps.stepDelayMs", caseId),
    sendRealMessage: readOptionalBoolean(value.sendRealMessage, "workflow.steps.sendRealMessage", caseId)
  };
}

function validateExpected(value: unknown, caseId: string): EvalExpected | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`Eval case ${caseId} expected must be an object.`);
  }
  const finalStatus = value.finalStatus;
  if (finalStatus !== undefined && (typeof finalStatus !== "string" || !finalStatuses.has(finalStatus))) {
    throw new Error(`Eval case ${caseId} has unsupported expected.finalStatus: ${String(finalStatus)}`);
  }

  return {
    finalStatus: finalStatus as EvalExpected["finalStatus"] | undefined,
    maxDurationMs: readOptionalPositiveNumber(value.maxDurationMs, "expected.maxDurationMs", caseId),
    maxTurns: readOptionalPositiveNumber(value.maxTurns, "expected.maxTurns", caseId),
    requiredTexts: readStringArray(value.requiredTexts, "expected.requiredTexts", caseId, true),
    requiredActionTypes: readStringArray(value.requiredActionTypes, "expected.requiredActionTypes", caseId, true),
    forbiddenTexts: readStringArray(value.forbiddenTexts, "expected.forbiddenTexts", caseId, true)
  };
}

function readRequiredString(value: Record<string, unknown>, key: string, index: number): string {
  const raw = value[key];
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(`Eval case at index ${index} requires a non-empty ${key}.`);
  }
  return raw.trim();
}

function readRequiredWorkflowString(value: Record<string, unknown>, key: string, caseId: string): string {
  const raw = value[key];
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(`Eval case ${caseId} workflow requires a non-empty ${key}.`);
  }
  return raw.trim();
}

function readOptionalString(value: unknown, key: string, caseId: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Eval case ${caseId} ${key} must be a string.`);
  }
  return value.trim() || undefined;
}

function readStringArray(value: unknown, key: string, caseId: string, defaultEmpty: boolean): string[] {
  if (value === undefined && defaultEmpty) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Eval case ${caseId} ${key} must be a string array.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function readOptionalPositiveNumber(value: unknown, key: string, caseId: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Eval case ${caseId} ${key} must be a positive number.`);
  }
  return value;
}

function readOptionalBoolean(value: unknown, key: string, caseId: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Eval case ${caseId} ${key} must be a boolean.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
