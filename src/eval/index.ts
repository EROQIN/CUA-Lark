import { loadConfig } from "../config/env.js";
import { loadEvalConfig } from "./config.js";
import { runEvaluation } from "./runner.js";

async function main(): Promise<void> {
  const evalConfig = loadEvalConfig(process.argv[2]);
  const appConfig = loadConfig();
  const summary = await runEvaluation(evalConfig, appConfig);
  console.log(`M4 evaluation finished. Dashboard: ${summary.artifacts?.dashboardPath}`);
  console.log(`Summary JSON: ${summary.artifacts?.summaryJsonPath}`);
  console.log(`Success rate: ${summary.totals.successRate}% (${summary.totals.passed}/${summary.totals.caseCount})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
