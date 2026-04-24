import path from "node:path";
import type { StepResult, TestReport } from "../core/types.js";
import type { TaskReport, TaskTurnResult } from "../planner/types.js";
import { toPosixPath, writeTextFile } from "../utils/file.js";

export class ReportGenerator {
  constructor(private readonly runDir: string) {}

  async generate(report: TestReport): Promise<TestReport> {
    const reportPath = path.join(this.runDir, "report.md");
    await writeTextFile(reportPath, this.renderMarkdown(report));
    return {
      ...report,
      reportPath
    };
  }

  async generateTask(report: TaskReport): Promise<TaskReport> {
    const reportPath = path.join(this.runDir, "report.md");
    await writeTextFile(reportPath, this.renderTaskMarkdown(report));
    return {
      ...report,
      reportPath
    };
  }

  private renderMarkdown(report: TestReport): string {
    const lines: string[] = [
      `# Scenario: ${report.scenarioName}`,
      "",
      `Run ID: ${report.runId ?? ""}`,
      `Started At: ${report.startedAt}`,
      `Ended At: ${report.endedAt}`,
      `Total Steps: ${report.totalSteps}`,
      `Success Steps: ${report.successSteps}`,
      `Failed Steps: ${report.failedSteps}`,
      `Duration: ${report.durationMs} ms`,
      "",
      "## Steps",
      ""
    ];

    report.stepResults.forEach((step, index) => {
      lines.push(...this.renderStep(step, index));
    });

    return `${lines.join("\n")}\n`;
  }

  private renderStep(step: StepResult, index: number): string[] {
    const action = step.action;
    const beforePath = relativeOrEmpty(this.runDir, step.beforeObservation.screenshotPath);
    const afterPath = relativeOrEmpty(this.runDir, step.afterObservation.screenshotPath);
    const locatePoint = step.locateResult?.point ? `(${step.locateResult.point.x}, ${step.locateResult.point.y})` : "";
    const error = step.errorStage === "locate" ? "Locate failed, action skipped" : step.error ?? "";

    const lines = [
      `### Step ${index + 1}: ${action.description}`,
      "",
      `- Action: ${action.type}`,
      `- Target: ${action.target ?? ""}`,
      `- Position: ${action.position ? `${action.position.x}, ${action.position.y}` : ""}`,
      `- Locate Success: ${step.locateResult?.success ?? ""}`,
      `- Locate Sources: ${step.locateResult?.sources.join(", ") ?? ""}`,
      `- Locate Confidence: ${step.locateResult?.confidence ?? ""}`,
      `- Locate Point: ${locatePoint}`,
      `- Locate Reason: ${step.locateResult?.reason ?? ""}`,
      `- Verification: ${step.verification?.method ?? ""}`,
      `- Success: ${step.success}`,
      `- Duration: ${step.durationMs} ms`,
      `- Before Screenshot: ${toPosixPath(beforePath)}`,
      `- After Screenshot: ${toPosixPath(afterPath)}`,
      `- Error Stage: ${step.errorStage ?? ""}`,
      `- Error: ${error}`,
      ""
    ];

    if (step.locateResult?.rawResponse) {
      lines.push("<details><summary>Locate Raw Response</summary>", "", "```json", step.locateResult.rawResponse, "```", "", "</details>", "");
    }

    return lines;
  }

  private renderTaskMarkdown(report: TaskReport): string {
    const lines: string[] = [
      `# Task: ${report.taskName}`,
      "",
      `Run ID: ${report.runId ?? ""}`,
      `Instruction: ${report.instruction}`,
      `Group Name: ${report.groupName}`,
      `Message Content: ${report.messageContent}`,
      `Send Real Message: ${report.sendRealMessage}`,
      `Final Status: ${report.finalStatus}`,
      `Max Turns: ${report.maxTurns}`,
      `Total Turns: ${report.totalTurns}`,
      `Started At: ${report.startedAt}`,
      `Ended At: ${report.endedAt}`,
      `Duration: ${report.durationMs} ms`,
      "",
      "## Turns",
      ""
    ];

    report.turnResults.forEach((turn) => {
      lines.push(...this.renderTaskTurn(turn));
    });

    return `${lines.join("\n")}\n`;
  }

  private renderTaskTurn(turn: TaskTurnResult): string[] {
    const beforePath = relativeOrEmpty(this.runDir, turn.beforeObservation.screenshotPath);
    const afterPath = relativeOrEmpty(this.runDir, turn.afterObservation.screenshotPath);
    const locatePoint = turn.locateResult?.point ? `(${turn.locateResult.point.x}, ${turn.locateResult.point.y})` : "";
    const decision = turn.decision;

    const lines = [
      `### Turn ${turn.turn}: ${decision?.nextAction ?? "plan_failed"}`,
      "",
      `- Thought: ${decision?.thought ?? ""}`,
      `- Reason: ${decision?.reason ?? ""}`,
      `- Target: ${decision?.target ?? ""}`,
      `- Text: ${decision?.text ?? ""}`,
      `- Hotkeys: ${decision?.hotkeys?.join("+") ?? ""}`,
      `- Success Criteria: ${decision?.successCriteria ?? ""}`,
      `- Locate Success: ${turn.locateResult?.success ?? ""}`,
      `- Locate Sources: ${turn.locateResult?.sources.join(", ") ?? ""}`,
      `- Locate Confidence: ${turn.locateResult?.confidence ?? ""}`,
      `- Locate Point: ${locatePoint}`,
      `- Locate Reason: ${turn.locateResult?.reason ?? ""}`,
      `- Verification: ${turn.verification?.method ?? ""}`,
      `- Success: ${turn.success}`,
      `- Duration: ${turn.durationMs} ms`,
      `- Before Screenshot: ${toPosixPath(beforePath)}`,
      `- After Screenshot: ${toPosixPath(afterPath)}`,
      `- Error Stage: ${turn.errorStage ?? ""}`,
      `- Error: ${turn.error ?? ""}`,
      ""
    ];

    if (turn.plannerResult.rawResponse) {
      lines.push("<details><summary>Planner Raw Response</summary>", "", "```json", turn.plannerResult.rawResponse, "```", "", "</details>", "");
    }
    if (turn.locateResult?.rawResponse) {
      lines.push("<details><summary>Locate Raw Response</summary>", "", "```json", turn.locateResult.rawResponse, "```", "", "</details>", "");
    }

    return lines;
  }
}

function relativeOrEmpty(baseDir: string, filePath: string): string {
  return filePath ? path.relative(baseDir, filePath) : "";
}
