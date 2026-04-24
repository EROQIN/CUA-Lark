import path from "node:path";
import { loadConfig, type AppConfig } from "../config/env.js";
import { ActionExecutor } from "../executor/action-executor.js";
import { HybridLocator } from "../locator/hybrid-locator.js";
import { PlannerService } from "../planner/planner-service.js";
import type { AgentTask, PlannerDecision, PlannerTurnSummary, TaskReport, TaskTurnResult } from "../planner/types.js";
import { ScreenObserver } from "../observer/screen-observer.js";
import { ReportGenerator } from "../reporter/report-generator.js";
import { StateVerifier } from "../verifier/state-verifier.js";
import { ensureDir } from "../utils/file.js";
import { createRunId, nowIso, sleep } from "../utils/time.js";
import { VLMClient } from "../vlm/vlm-client.js";
import { VLMGroundingService } from "../vlm/vlm-grounding.js";
import { logger } from "./logger.js";
import type { AgentAction, LocateResult, Observation, StepResult, TestReport, TestScenario, VerificationResult } from "./types.js";
import { UiTarsDesktopOperator } from "./ui-tars-operator.js";

export class CUALarkAgent {
  private readonly config: AppConfig;

  constructor(config: AppConfig = loadConfig()) {
    this.config = config;
  }

  async runScenario(scenario: TestScenario): Promise<TestReport> {
    const runId = createRunId();
    const runDir = path.join(this.config.runsDir, runId);
    await ensureDir(runDir);

    const desktopOperator = new UiTarsDesktopOperator({
      screenshotFallback: this.config.screenshotFallback,
      actionFallback: this.config.actionFallback
    });
    const vlmClient = new VLMClient(this.config.vlm);
    const vlmGroundingService = new VLMGroundingService(vlmClient);
    const observer = new ScreenObserver(runDir, desktopOperator);
    const locator = new HybridLocator(vlmGroundingService);
    const executor = new ActionExecutor(desktopOperator);
    const verifier = new StateVerifier();
    const reporter = new ReportGenerator(runDir);

    logger.info("Scenario started", { scenario: scenario.name, runId });
    await this.activateTargetApp(desktopOperator);
    const startedAt = nowIso();
    const startedMs = Date.now();
    const stepResults: StepResult[] = [];

    for (const [index, action] of scenario.actions.entries()) {
      const stepStartedMs = Date.now();
      let error: string | undefined;
      let errorStage: StepResult["errorStage"] | undefined;
      let locateResult: LocateResult | undefined;

      logger.info("Step started", { index, action: action.type, description: action.description });
      let beforeObservation: Observation;
      try {
        beforeObservation = await observer.capture({ stepIndex: index, phase: "before" });
      } catch (caught) {
        error = formatError(caught);
        errorStage = "screenshot";
        logger.error("Step before screenshot failed", { index, error });
        beforeObservation = failedObservation(error);
      }

      if (!error) {
        try {
          if (shouldLocate(action)) {
            locateResult = await locator.locate({
              target: action.target,
              actionType: action.type,
              screenContext: beforeObservation,
              hints: {
                manualPosition: action.position
              }
            });

            if (requiresLocation(action.type) && !locateResult.success) {
              errorStage = "locate";
              throw new Error(`Locate failed, action skipped: ${locateResult.reason ?? locateResult.error ?? "unknown reason"}`);
            }
          }

          await executor.execute(action, locateResult);
        } catch (caught) {
          error = formatError(caught);
          errorStage ??= requiresLocation(action.type) && locateResult && !locateResult.success ? "locate" : "execute";
          logger.error("Step execution failed", { index, errorStage, error });
        }
      }

      let afterObservation: Observation;
      try {
        afterObservation = await observer.capture({ stepIndex: index, phase: "after" });
      } catch (caught) {
        const screenshotError = formatError(caught);
        afterObservation = failedObservation(screenshotError);
        error ??= screenshotError;
        errorStage ??= "screenshot";
        logger.error("Step after screenshot failed", { index, error: screenshotError });
      }

      let verification: VerificationResult = {
        success: false,
        method: "skipped",
        reason: "Execution failed before verification."
      };
      if (!error) {
        try {
          verification = await verifier.verify(action, beforeObservation, afterObservation);
          if (!verification.success) {
            error = verification.reason ?? "Verification failed";
            errorStage = "verify";
          }
        } catch (caught) {
          error = formatError(caught);
          errorStage = "verify";
          verification = {
            success: false,
            method: "error",
            reason: error
          };
          logger.error("Step verification failed", { index, error });
        }
      }

      const success = !error && verification.success;
      stepResults.push({
        action,
        beforeObservation,
        afterObservation,
        success,
        durationMs: Date.now() - stepStartedMs,
        errorStage,
        error,
        verification,
        locateResult
      });
      logger.info("Step finished", { index, success });
    }

    const endedAt = nowIso();
    const durationMs = Date.now() - startedMs;
    const successSteps = stepResults.filter((step) => step.success).length;
    const report = await reporter.generate({
      scenarioName: scenario.name,
      startedAt,
      endedAt,
      totalSteps: stepResults.length,
      successSteps,
      failedSteps: stepResults.length - successSteps,
      durationMs,
      stepResults,
      runId
    });

    logger.info("Scenario finished", {
      runId,
      successSteps: report.successSteps,
      failedSteps: report.failedSteps,
      reportPath: report.reportPath
    });

    return report;
  }

  async runTask(task: AgentTask): Promise<TaskReport> {
    const runId = createRunId();
    const runDir = path.join(this.config.runsDir, runId);
    await ensureDir(runDir);

    const desktopOperator = new UiTarsDesktopOperator({
      screenshotFallback: this.config.screenshotFallback,
      actionFallback: this.config.actionFallback
    });
    const vlmClient = new VLMClient(this.config.vlm);
    const vlmGroundingService = new VLMGroundingService(vlmClient);
    const observer = new ScreenObserver(runDir, desktopOperator);
    const locator = new HybridLocator(vlmGroundingService);
    const executor = new ActionExecutor(desktopOperator);
    const reporter = new ReportGenerator(runDir);
    const planner = new PlannerService(vlmClient);

    logger.info("Task started", { task: task.name, runId });
    await this.activateTargetApp(desktopOperator);

    const startedAt = nowIso();
    const startedMs = Date.now();
    const turnResults: TaskTurnResult[] = [];
    const history: PlannerTurnSummary[] = [];
    let finalStatus: TaskReport["finalStatus"] = "max_turns";

    for (let turn = 1; turn <= task.maxTurns; turn += 1) {
      const turnStartedMs = Date.now();
      let error: string | undefined;
      let errorStage: TaskTurnResult["errorStage"] | undefined;
      let locateResult: LocateResult | undefined;
      let action: AgentAction | undefined;

      logger.info("Task turn started", { turn });
      let beforeObservation: Observation;
      try {
        beforeObservation = await observer.capture({ stepIndex: turn - 1, phase: "before" });
      } catch (caught) {
        error = formatError(caught);
        errorStage = "screenshot";
        beforeObservation = failedObservation(error);
      }

      const plannerResult = error
        ? { success: false, rawResponse: "", error }
        : await planner.planNext({
            task,
            turn,
            screenshotPath: beforeObservation.screenshotPath,
            history
          });
      const decision = plannerResult.decision;

      if (!plannerResult.success || !decision) {
        error = plannerResult.error ?? "Planner failed";
        errorStage = errorStage ?? "plan";
        finalStatus = "failed";
      } else if (decision.nextAction === "finish") {
        finalStatus = "success";
      } else if (decision.nextAction === "fail") {
        error = decision.reason;
        errorStage = "plan";
        finalStatus = "failed";
      } else {
        try {
          action = actionFromDecision(turn, decision);
          if (decision.nextAction === "locate_and_click") {
            locateResult = await locator.locate({
              target: action.target,
              actionType: action.type,
              screenContext: beforeObservation,
              hints: {}
            });

            if (!locateResult.success) {
              errorStage = "locate";
              throw new Error(`Locate failed, action skipped: ${locateResult.reason ?? locateResult.error ?? "unknown reason"}`);
            }
          }

          await executor.execute(action, locateResult);
        } catch (caught) {
          error = formatError(caught);
          errorStage ??= locateResult && !locateResult.success ? "locate" : "execute";
          logger.error("Task turn execution failed", { turn, errorStage, error });
        }
      }

      let afterObservation: Observation;
      try {
        afterObservation = await observer.capture({ stepIndex: turn - 1, phase: "after" });
      } catch (caught) {
        const screenshotError = formatError(caught);
        afterObservation = failedObservation(screenshotError);
        error ??= screenshotError;
        errorStage ??= "screenshot";
      }

      const success = !error && plannerResult.success;
      const verification = {
        success,
        method: decision?.nextAction === "finish" ? "planner-visual-finish" : "planner-step",
        reason: decision?.successCriteria ?? decision?.reason
      };

      const turnResult: TaskTurnResult = {
        turn,
        beforeObservation,
        afterObservation,
        plannerResult,
        decision,
        locateResult,
        success,
        durationMs: Date.now() - turnStartedMs,
        errorStage,
        error,
        verification
      };
      turnResults.push(turnResult);
      history.push({
        turn,
        action: decision?.nextAction ?? "fail",
        target: decision?.target,
        text: decision?.text,
        success,
        error
      });

      logger.info("Task turn finished", { turn, success, action: decision?.nextAction });
      if (finalStatus === "success" || finalStatus === "failed") {
        break;
      }

      await sleep(task.stepDelayMs);
    }

    if (finalStatus === "max_turns" && turnResults.length >= task.maxTurns) {
      const lastTurn = turnResults[turnResults.length - 1];
      if (lastTurn) {
        lastTurn.errorStage ??= "max_turns";
        lastTurn.error ??= `Reached max turns: ${task.maxTurns}`;
      }
    }

    const endedAt = nowIso();
    const report = await reporter.generateTask({
      taskName: task.name,
      instruction: task.instruction,
      groupName: task.groupName,
      messageContent: task.messageContent,
      sendRealMessage: task.sendRealMessage,
      maxTurns: task.maxTurns,
      finalStatus,
      startedAt,
      endedAt,
      durationMs: Date.now() - startedMs,
      totalTurns: turnResults.length,
      turnResults,
      runId
    });

    logger.info("Task finished", { runId, finalStatus, reportPath: report.reportPath });
    return report;
  }

  private async activateTargetApp(desktopOperator: UiTarsDesktopOperator): Promise<void> {
    if (!this.config.targetApps.length) {
      return;
    }

    try {
      const activatedApp = await desktopOperator.activateFirstAvailableApplication(
        this.config.targetApps,
        this.config.activationDelayMs
      );
      logger.info("Target app activated", { app: activatedApp });
    } catch (error) {
      logger.warn("Target app activation failed; continuing with current frontmost window", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

function requiresLocation(type: string): boolean {
  return type === "click" || type === "double_click" || type === "right_click";
}

function shouldLocate(action: { type: string; position?: unknown }): boolean {
  return Boolean(action.position) || requiresLocation(action.type);
}

function actionFromDecision(turn: number, decision: PlannerDecision): AgentAction {
  switch (decision.nextAction) {
    case "locate_and_click":
      return {
        id: `m2-${turn}`,
        type: "click",
        description: decision.reason,
        target: decision.target
      };
    case "type_text":
      return {
        id: `m2-${turn}`,
        type: "type_text",
        description: decision.reason,
        text: decision.text,
        target: decision.target
      };
    case "hotkey":
      return {
        id: `m2-${turn}`,
        type: "hotkey",
        description: decision.reason,
        hotkeys: decision.hotkeys,
        target: decision.target
      };
    case "wait":
      return {
        id: `m2-${turn}`,
        type: "wait",
        description: decision.reason,
        timeoutMs: decision.timeoutMs ?? 1000,
        target: decision.target
      };
    case "screenshot":
      return {
        id: `m2-${turn}`,
        type: "screenshot",
        description: decision.reason,
        target: decision.target
      };
    default:
      throw new Error(`Unsupported executable planner action: ${decision.nextAction}`);
  }
}

function failedObservation(error: string): Observation {
  return {
    timestamp: nowIso(),
    screenshotPath: "",
    extra: {
      error
    }
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
