import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { loadConfig, type AppConfig } from "../config/env.js";
import { ReportGenerator } from "../reporter/report-generator.js";
import { ensureDir } from "../utils/file.js";
import { createRunId, nowIso, sleep } from "../utils/time.js";
import { logger } from "./logger.js";
import { NativeGuiAgentRunner, nativeFinalStatus } from "./native-gui-agent.js";
import { notifyTaskComplete } from "./notifier.js";
import type { AgentTask, NativeGuiTurnResult, NativeTaskReport } from "./types.js";

const execFileAsync = promisify(execFile);

export class CUALarkAgent {
  private readonly config: AppConfig;

  constructor(config: AppConfig = loadConfig()) {
    this.config = config;
  }

  async runTask(task: AgentTask): Promise<NativeTaskReport> {
    const runId = createRunId();
    const runDir = path.join(this.config.runsDir, runId);
    await ensureDir(runDir);

    const reporter = new ReportGenerator(runDir);
    const runner = new NativeGuiAgentRunner(this.config);

    logger.info("UI-TARS GUIAgent task started", { task: task.name, runId });
    await this.activateTargetApp();

    const startedAt = nowIso();
    const startedMs = Date.now();
    let turnResults: NativeGuiTurnResult[] = [];
    let finalStatus: NativeTaskReport["finalStatus"] = "failed";

    try {
      turnResults = await runner.run(task, runDir);
      finalStatus = nativeFinalStatus(turnResults);
    } catch (caught) {
      const error = formatError(caught);
      logger.error("UI-TARS GUIAgent task failed", { runId, error });
      turnResults = [
        {
          turn: 1,
          status: "error",
          error
        }
      ];
      finalStatus = "failed";
    }

    const endedAt = nowIso();
    const report = await reporter.generateTask({
      taskName: task.name,
      instruction: task.instruction,
      product: task.product,
      userPrompt: task.userPrompt,
      parsedGoal: task.parsedGoal,
      maxTurns: task.maxTurns,
      finalStatus,
      startedAt,
      endedAt,
      durationMs: Date.now() - startedMs,
      totalTurns: turnResults.length,
      turnResults,
      runId
    });

    logger.info("UI-TARS GUIAgent task finished", { runId, finalStatus, reportPath: report.reportPath });
    await notifyTaskComplete(this.config, report);
    return report;
  }

  private async activateTargetApp(): Promise<void> {
    if (!this.config.targetApps.length || process.platform !== "darwin") {
      return;
    }

    const errors: string[] = [];
    for (const appName of this.config.targetApps) {
      try {
        await execFileAsync("open", ["-a", appName]);
        await sleep(this.config.activationDelayMs);
        logger.info("Target app activated", { app: appName });
        return;
      } catch (error) {
        errors.push(`${appName}: ${formatError(error)}`);
      }
    }

    logger.warn("Target app activation failed; continuing with current frontmost window", { errors });
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
