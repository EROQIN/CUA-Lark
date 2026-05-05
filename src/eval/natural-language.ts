import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../config/env.js";
import { notifyEvaluationComplete } from "../core/notifier.js";
import { openReportHtmlPath } from "../core/report-ui.js";
import { createCustomTask } from "../tasks/task-factory.js";
import { loadEvalConfig } from "./config.js";
import { runEvaluation } from "./runner.js";
import type { EvalCase } from "./types.js";

async function main(): Promise<void> {
  const instruction = process.argv.slice(2).join(" ").trim();
  if (!instruction) {
    throw new Error('Usage: pnpm eval:nl "自然语言测试命令"');
  }

  const appConfig = loadConfig();
  const evalConfig = loadEvalConfig("online");
  const baseTask = createCustomTask(appConfig, instruction);
  const caseSetPath = await writeTemporaryCaseSet(buildNaturalLanguageCase(instruction, baseTask.product, appConfig.task.maxTurns));
  const summary = await runEvaluation(
    {
      ...evalConfig,
      mode: "online",
      caseSetPath,
      maxCases: undefined,
      caseIds: []
    },
    appConfig
  );

  const result = summary.cases[0];
  console.log("\n自然语言测试执行完成");
  console.log(`测试命令：${instruction}`);
  console.log(`识别产品：${formatProduct(result?.product ?? baseTask.product)}`);
  console.log(`校验结果：${result?.passed ? "通过" : "失败"}`);
  console.log(`最终状态：${formatFinalStatus(result?.finalStatus ?? "failed")}`);
  console.log(`耗时：${formatDuration(result?.durationMs ?? 0)}`);
  console.log(`步骤/动作：${result?.turnCount ?? 0} 轮 / ${result?.actionCount ?? 0} 个动作`);
  console.log(`失败原因：${result?.failureReason || "无"}`);
  console.log(`单次报告界面：${result?.reportHtmlPath ?? result?.reportPath ?? ""}`);
  console.log(`单次 Markdown：${result?.reportPath ?? ""}`);
  console.log(`结构化摘要：${summary.artifacts?.summaryJsonPath}`);
  console.log(`中文看板：${summary.artifacts?.dashboardUrl}`);
  console.log(`最新看板：${summary.artifacts?.latestDashboardUrl}`);
  console.log(`全量历史：${summary.artifacts?.historyDashboardUrl}`);
  await openReportHtmlPath(appConfig, result?.reportHtmlPath);
  await notifyEvaluationComplete(appConfig, summary);
}

function buildNaturalLanguageCase(instruction: string, product: EvalCase["product"], maxTurns: number): EvalCase {
  return {
    id: `nl-${Date.now().toString(36)}`,
    title: process.env.EVAL_NL_TITLE || "自然语言临时测试",
    product,
    instruction,
    tags: ["natural-language", "adhoc"],
    maxTurns: readNumber("EVAL_NL_MAX_TURNS", maxTurns),
    stepDelayMs: readNumber("EVAL_NL_STEP_DELAY_MS", readNumber("TASK_STEP_DELAY_MS", 800)),
    sendRealMessage: readFlag("TASK_SEND_REAL_MESSAGE", true),
    contextIds: readList("EVAL_NL_CONTEXT_IDS"),
    expected: {
      finalStatus: "success",
      maxDurationMs: readNumber("EVAL_NL_MAX_DURATION_MS", 300000),
      maxTurns: readNumber("EVAL_NL_EXPECTED_MAX_TURNS", Math.max(maxTurns * 4, maxTurns + 8)),
      requiredTexts: readList("EVAL_NL_REQUIRED_TEXTS"),
      requiredActionTypes: readActionTypes(),
      forbiddenTexts: readList("EVAL_NL_FORBIDDEN_TEXTS")
    }
  };
}

async function writeTemporaryCaseSet(evalCase: EvalCase): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cua-lark-nl-"));
  const filePath = path.join(dir, "case.json");
  await writeFile(filePath, JSON.stringify({ cases: [evalCase] }, null, 2), "utf8");
  return filePath;
}

function readActionTypes(): string[] {
  const raw = process.env.EVAL_NL_REQUIRED_ACTION_TYPES;
  if (raw?.toLowerCase() === "none") {
    return [];
  }
  return raw === undefined ? ["finished"] : readList("EVAL_NL_REQUIRED_ACTION_TYPES");
}

function readList(name: string): string[] {
  const raw = process.env[name];
  if (!raw) {
    return [];
  }
  const separator = raw.includes("|") ? "|" : ",";
  return raw
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return defaultValue;
  }
  return !["0", "false", "no", "off"].includes(raw.toLowerCase());
}

function readNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function formatProduct(product: string): string {
  const labels: Record<string, string> = {
    auto: "自动识别",
    im: "IM 即时通讯",
    docs: "云文档",
    calendar: "日历",
    base: "多维表格",
    vc: "视频会议",
    mail: "邮箱"
  };
  return labels[product] ?? product;
}

function formatFinalStatus(status: string): string {
  const labels: Record<string, string> = {
    success: "成功",
    failed: "失败",
    max_turns: "达到最大轮次"
  };
  return labels[status] ?? status;
}

function formatDuration(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0ms";
  }
  if (value >= 1000) {
    return `${Math.round(value / 100) / 10}s`;
  }
  return `${value}ms`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
