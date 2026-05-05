import path from "node:path";
import type { WorkflowReport } from "../core/types.js";
import { toPosixPath, writeTextFile } from "../utils/file.js";

export class WorkflowReportGenerator {
  constructor(private readonly runDir: string) {}

  async generate(report: WorkflowReport): Promise<WorkflowReport> {
    const workflowReportPath = path.join(this.runDir, "workflow-report.json");
    const workflowReportMarkdownPath = path.join(this.runDir, "workflow-report.md");
    const enriched: WorkflowReport = {
      ...report,
      workflowReportPath,
      workflowReportMarkdownPath
    };
    await writeTextFile(workflowReportPath, JSON.stringify(enriched, null, 2));
    await writeTextFile(workflowReportMarkdownPath, this.renderMarkdown(enriched));
    return enriched;
  }

  private renderMarkdown(report: WorkflowReport): string {
    const lines = [
      `# CUA-Lark Workflow Report: ${report.title}`,
      "",
      `Workflow Run ID: ${report.workflowRunId}`,
      `Workflow ID: ${report.workflowId}`,
      `Entry: ${report.entry}`,
      `Inbox Group: ${report.inboxGroupName ?? ""}`,
      `Extracted Instruction: ${report.extractedInstruction ?? ""}`,
      `Final Status: ${report.finalStatus}`,
      `Product Trail: ${report.productTrail.join(" -> ")}`,
      `Recovery Count: ${report.recoveryCount}`,
      `Total Turns: ${report.totalTurns}`,
      `Action Count: ${report.actionCount}`,
      `Started At: ${report.startedAt}`,
      `Ended At: ${report.endedAt}`,
      `Duration: ${report.durationMs} ms`,
      "",
      "## Phases",
      "",
      "| 阶段 | 产品 | 尝试 | 结果 | 状态 | 耗时 | 轮次 | 动作数 | 失败原因 | 报告 |",
      "| --- | --- | ---: | --- | --- | ---: | ---: | ---: | --- | --- |",
      ...report.workflowPhases.map((phase) => {
        const reportPath = phase.reportPath ? toPosixPath(path.relative(this.runDir, phase.reportPath)) : "";
        return [
          phase.id,
          phase.product,
          String(phase.attempt),
          phase.passed ? "通过" : "失败",
          phase.finalStatus,
          `${phase.durationMs}ms`,
          String(phase.totalTurns),
          String(phase.actionCount),
          markdownCell(phase.failureReason),
          reportPath
        ].join(" | ");
      }).map((row) => `| ${row} |`),
      "",
      "## Advanced Events",
      ""
    ];

    if (!report.advancedEvents.length) {
      lines.push("当前没有记录到进阶事件。", "");
    } else {
      lines.push(
        "| 类型 | 阶段 | 时间 | 说明 | 证据 |",
        "| --- | --- | --- | --- | --- |",
        ...report.advancedEvents.map((event) =>
          `| ${event.type} | ${event.phaseId ?? ""} | ${event.detectedAt} | ${markdownCell(event.message)} | ${markdownCell(event.evidence ?? "")} |`
        ),
        ""
      );
    }

    return `${lines.join("\n")}\n`;
  }
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
