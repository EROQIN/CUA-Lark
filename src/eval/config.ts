import path from "node:path";
import type { EvalConfig, EvalMode } from "./types.js";

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return defaultValue;
  }
  return !["0", "false", "no", "off"].includes(raw.toLowerCase());
}

function envNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function envList(name: string): string[] {
  const raw = process.env[name];
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveMode(cliMode: string | undefined): EvalMode {
  const raw = (cliMode ?? process.env.EVAL_MODE ?? "online").toLowerCase();
  if (raw === "offline") {
    return "offline";
  }
  return "online";
}

export function loadEvalConfig(cliMode?: string): EvalConfig {
  return {
    mode: resolveMode(cliMode),
    caseSetPath: path.resolve(process.cwd(), process.env.EVAL_CASE_SET ?? "eval/cases/m4-smoke.json"),
    outputDir: path.resolve(process.cwd(), process.env.EVAL_OUTPUT_DIR ?? "runs/evaluations"),
    maxCases: envNumber("EVAL_MAX_CASES"),
    caseIds: envList("EVAL_CASE_IDS"),
    stopOnFailure: envFlag("EVAL_STOP_ON_FAILURE", false),
    vlmVerify: envFlag("EVAL_VLM_VERIFY", false)
  };
}
