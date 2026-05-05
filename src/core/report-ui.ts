import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import type { AppConfig } from "../config/env.js";
import type { NativeTaskReport } from "./types.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

export async function openTaskReportUi(config: AppConfig, report: NativeTaskReport): Promise<void> {
  await openReportHtmlPath(config, report.reportHtmlPath);
}

export async function openReportHtmlPath(config: AppConfig, reportHtmlPath: string | undefined): Promise<void> {
  if (!config.reportUi.openAfterTask || !reportHtmlPath || process.platform !== "darwin") {
    return;
  }

  try {
    await execFileAsync("open", [reportHtmlPath]);
  } catch (error) {
    logger.warn("Open task report UI failed", {
      reportHtmlPath,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function taskReportUiUrl(report: NativeTaskReport): string {
  return report.reportHtmlPath ? pathToFileURL(report.reportHtmlPath).href : "";
}
