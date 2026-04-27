import path from "node:path";
import type { NativeTaskReport } from "../core/types.js";
import { toPosixPath, writeTextFile } from "../utils/file.js";

export class ReportGenerator {
  constructor(private readonly runDir: string) {}

  async generateTask(report: NativeTaskReport): Promise<NativeTaskReport> {
    const reportPath = path.join(this.runDir, "report.md");
    await writeTextFile(reportPath, this.renderTaskMarkdown(report));
    return {
      ...report,
      reportPath
    };
  }

  private renderTaskMarkdown(report: NativeTaskReport): string {
    const lines: string[] = [
      `# UI-TARS GUIAgent Task: ${report.taskName}`,
      "",
      `Run ID: ${report.runId ?? ""}`,
      `Instruction: ${report.instruction}`,
      `Product: ${report.product}`,
      `User Prompt: ${report.userPrompt}`,
      `Parsed Goal: ${report.parsedGoal}`,
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

    for (const turn of report.turnResults) {
      const screenshotPath = turn.screenshotPath ? toPosixPath(path.relative(this.runDir, turn.screenshotPath)) : "";
      lines.push(
        `### Turn ${turn.turn}: ${turn.status}`,
        "",
        `- Status: ${turn.status}`,
        `- Screenshot: ${screenshotPath}`,
        `- Screenshot Size: ${turn.screenshotSize ? `${turn.screenshotSize.width}x${turn.screenshotSize.height}` : ""}`,
        `- Scale Factor: ${turn.scaleFactor ?? ""}`,
        `- Duration: ${turn.durationMs ?? ""} ms`,
        `- Error: ${turn.error ?? ""}`,
        ""
      );

      if (turn.prediction) {
        lines.push("<details><summary>Raw Prediction</summary>", "", "```text", turn.prediction, "```", "", "</details>", "");
      }

      if (turn.parsedPrediction !== undefined) {
        lines.push(
          "<details><summary>Parsed Prediction</summary>",
          "",
          "```json",
          JSON.stringify(turn.parsedPrediction, null, 2),
          "```",
          "",
          "</details>",
          ""
        );
      }
    }

    return `${lines.join("\n")}\n`;
  }
}
