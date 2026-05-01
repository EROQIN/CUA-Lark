import { readFile } from "node:fs/promises";
import type { EvalCase, EvalExpected } from "./types.js";

const productTypes = new Set(["im", "docs", "calendar", "base", "vc", "mail", "auto"]);
const finalStatuses = new Set(["success", "failed", "max_turns"]);

export async function loadEvalCases(caseSetPath: string, maxCases?: number): Promise<EvalCase[]> {
  const raw = await readFile(caseSetPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const cases = Array.isArray(parsed) ? parsed : readCasesProperty(parsed);
  const validated = cases.map((item, index) => validateEvalCase(item, index));
  return maxCases ? validated.slice(0, maxCases) : validated;
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
    expected: validateExpected(value.expected, id)
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
