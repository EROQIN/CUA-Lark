import path from "node:path";
import { loadConfig } from "../config/env.js";
import { notifyEvaluationComplete } from "../core/notifier.js";
import { loadEvalConfig } from "./config.js";
import { runEvaluation } from "./runner.js";

const caseSets = [
  {
    label: "M4 Smoke",
    path: "eval/cases/m4-smoke.json"
  },
  {
    label: "M5 Advanced",
    path: "eval/cases/m5-advanced.json"
  }
];

async function main(): Promise<void> {
  const appConfig = loadConfig();
  const baseEvalConfig = loadEvalConfig("online");
  let lastSummary: Awaited<ReturnType<typeof runEvaluation>> | undefined;

  for (const caseSet of caseSets) {
    console.log(`\n=== ${caseSet.label} 开始 ===`);
    const summary = await runEvaluation(
      {
        ...baseEvalConfig,
        mode: "online",
        caseSetPath: path.resolve(process.cwd(), caseSet.path),
        caseIds: []
      },
      {
        ...appConfig,
        notification: {
          ...appConfig.notification,
          evalComplete: false
        }
      }
    );
    lastSummary = summary;
    console.log(`${caseSet.label} 完成。看板：${summary.artifacts?.dashboardUrl}`);
    console.log(`全量历史：${summary.artifacts?.historyDashboardUrl}`);
    console.log(`成功率：${summary.totals.successRate}%（${summary.totals.passed}/${summary.totals.caseCount}）`);
    console.log(
      `核心指标：总耗时 ${formatDuration(summary.totals.totalDurationMs)}，平均耗时 ${formatDuration(
        summary.totals.avgDurationMs
      )}，总轮次 ${summary.totals.totalTurns}，总动作数 ${summary.totals.totalActions}`
    );

    if (baseEvalConfig.stopOnFailure && summary.totals.failed > 0) {
      console.log("EVAL_STOP_ON_FAILURE=true，已停止后续评测。");
      break;
    }
  }

  if (lastSummary) {
    await notifyEvaluationComplete(appConfig, lastSummary);
    console.log(`\n全部评测结束。最新看板：${lastSummary.artifacts?.latestDashboardUrl}`);
    console.log(`全量历史：${lastSummary.artifacts?.historyDashboardUrl}`);
  }
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
