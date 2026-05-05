import { loadConfig } from "../config/env.js";
import { notifyEvaluationComplete } from "../core/notifier.js";
import { loadEvalConfig } from "./config.js";
import { runEvaluation } from "./runner.js";

async function main(): Promise<void> {
  const evalConfig = loadEvalConfig(process.argv[2]);
  const appConfig = loadConfig();
  const summary = await runEvaluation(evalConfig, appConfig);
  console.log(`CUA-Lark 评测完成。看板：${summary.artifacts?.dashboardPath}`);
  console.log(`看板链接：${summary.artifacts?.dashboardUrl}`);
  console.log(`最新看板：${summary.artifacts?.latestDashboardUrl}`);
  console.log(`全量历史：${summary.artifacts?.historyDashboardUrl}`);
  console.log(`结构化摘要：${summary.artifacts?.summaryJsonPath}`);
  console.log(`成功率：${summary.totals.successRate}%（${summary.totals.passed}/${summary.totals.caseCount}）`);
  console.log(
    `核心指标：总耗时 ${formatDuration(summary.totals.totalDurationMs)}，平均耗时 ${formatDuration(
      summary.totals.avgDurationMs
    )}，总轮次 ${summary.totals.totalTurns}，总动作数 ${summary.totals.totalActions}`
  );
  await notifyEvaluationComplete(appConfig, summary);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

function formatDuration(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0ms";
  }
  if (value >= 1000) {
    return `${Math.round(value / 100) / 10}s`;
  }
  return `${value}ms`;
}
