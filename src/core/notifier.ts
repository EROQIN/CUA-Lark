import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AppConfig } from "../config/env.js";
import type { NativeTaskReport } from "./types.js";
import type { EvalSummary } from "../eval/types.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

interface NotificationPayload {
  title: string;
  subtitle?: string;
  message: string;
}

export async function notifyTaskComplete(config: AppConfig, report: NativeTaskReport): Promise<void> {
  if (!config.notification.taskComplete) {
    return;
  }

  await sendNotification(config, {
    title: "CUA-Lark 任务执行结束",
    subtitle: `状态：${formatFinalStatus(report.finalStatus)}`,
    message: [report.taskName, `耗时 ${formatDuration(report.durationMs)}，报告界面已生成`, report.reportHtmlPath]
      .filter(Boolean)
      .join("\n")
  });
}

export async function notifyEvaluationComplete(config: AppConfig, summary: EvalSummary): Promise<void> {
  if (!config.notification.evalComplete) {
    return;
  }

  await sendNotification(config, {
    title: "CUA-Lark 评测执行结束",
    subtitle: `成功率：${summary.totals.successRate}%`,
    message: [
      `通过 ${summary.totals.passed}/${summary.totals.caseCount} · 总耗时 ${formatDuration(summary.totals.totalDurationMs)} · 平均耗时 ${formatDuration(summary.totals.avgDurationMs)}`,
      "看板已生成",
      summary.artifacts?.historyDashboardUrl ?? summary.artifacts?.latestDashboardUrl
    ]
      .filter(Boolean)
      .join("\n")
  });
}

async function sendNotification(config: AppConfig, payload: NotificationPayload): Promise<void> {
  try {
    if (process.platform === "darwin") {
      await execFileAsync("osascript", ["-e", buildMacCompletionScript(payload, config)]);
      return;
    }

    process.stdout.write("\u0007");
    logger.info("Notification fallback emitted", {
      title: payload.title,
      subtitle: payload.subtitle,
      message: payload.message
    });
  } catch (error) {
    logger.warn("Desktop notification failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function buildMacCompletionScript(payload: NotificationPayload, config: AppConfig): string {
  return [
    buildMacNotificationScript(payload, config.notification.sound),
    config.notification.completionDialog ? buildMacDialogScript(payload, config.notification.dialogTimeoutSec) : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildMacNotificationScript(payload: NotificationPayload, sound: string): string {
  const parts = [
    `display notification "${escapeAppleScript(payload.message)}"`,
    `with title "${escapeAppleScript(payload.title)}"`
  ];

  if (payload.subtitle) {
    parts.push(`subtitle "${escapeAppleScript(payload.subtitle)}"`);
  }
  if (sound) {
    parts.push(`sound name "${escapeAppleScript(sound)}"`);
  }

  return parts.join(" ");
}

function buildMacDialogScript(payload: NotificationPayload, timeoutSec: number): string {
  const lines = [
    `display dialog "${escapeAppleScript([payload.subtitle, payload.message].filter(Boolean).join("\n"))}"`,
    `with title "${escapeAppleScript(payload.title)}"`,
    'buttons {"知道了"}',
    'default button "知道了"',
    `giving up after ${Math.max(1, Math.round(timeoutSec))}`
  ];
  return lines.join(" ");
}

function escapeAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatFinalStatus(status: string): string {
  if (status === "success") {
    return "成功";
  }
  if (status === "failed") {
    return "失败";
  }
  if (status === "max_turns") {
    return "达到最大轮次";
  }
  return status;
}

function formatDuration(value: number): string {
  if (value >= 1000) {
    return `${Math.round(value / 100) / 10}s`;
  }
  return `${value}ms`;
}
