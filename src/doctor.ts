import { execFile } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { loadConfig } from "./config/env.js";

const execFileAsync = promisify(execFile);

interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const checks: DoctorCheck[] = [];

  checks.push(await checkNode());
  checks.push(await checkRunsDir(config.runsDir));
  checks.push(checkModelConfig(config.uiTars.apiKey || config.fallbackModel.apiKey, config.uiTars.model || config.fallbackModel.model));
  checks.push(checkTargetApps(config.targetApps));
  checks.push(
    checkNotifications(
      config.notification.taskComplete,
      config.notification.evalComplete,
      config.notification.sound,
      config.notification.completionDialog
    )
  );

  if (process.platform === "darwin") {
    checks.push(await checkAccessibility());
    checks.push(await checkScreenCapture());
  } else {
    checks.push({
      name: "桌面权限",
      ok: true,
      detail: `当前平台为 ${process.platform}，跳过 macOS 专属权限检查。`
    });
  }

  printChecks(checks);
  const failed = checks.filter((item) => !item.ok);
  if (failed.length) {
    process.exitCode = 1;
  }
}

async function checkNode(): Promise<DoctorCheck> {
  const major = Number(process.versions.node.split(".")[0]);
  return {
    name: "Node.js",
    ok: major >= 20,
    detail: `当前版本 ${process.versions.node}，建议 >=20。`
  };
}

async function checkRunsDir(runsDir: string): Promise<DoctorCheck> {
  try {
    await mkdir(runsDir, { recursive: true });
    await access(runsDir);
    return {
      name: "输出目录",
      ok: true,
      detail: runsDir
    };
  } catch (error) {
    return {
      name: "输出目录",
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

function checkModelConfig(apiKey: string | undefined, model: string | undefined): DoctorCheck {
  const hasKey = Boolean(apiKey && apiKey !== "your_api_key_here");
  const hasModel = Boolean(model);
  return {
    name: "模型配置",
    ok: hasKey && hasModel,
    detail: hasKey && hasModel ? `模型 ${model}` : "缺少 UI_TARS_API_KEY/VLM_API_KEY 或模型名称。"
  };
}

function checkTargetApps(targetApps: string[]): DoctorCheck {
  return {
    name: "目标应用",
    ok: targetApps.length > 0,
    detail: targetApps.length ? targetApps.join(", ") : "未配置 CUA_LARK_TARGET_APP。"
  };
}

function checkNotifications(taskComplete: boolean, evalComplete: boolean, sound: string, completionDialog: boolean): DoctorCheck {
  return {
    name: "完成通知",
    ok: true,
    detail: `任务通知 ${formatEnabled(taskComplete)}，评测通知 ${formatEnabled(evalComplete)}，消息框 ${formatEnabled(completionDialog)}，提示音 ${sound || "无"}。`
  };
}

async function checkAccessibility(): Promise<DoctorCheck> {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", 'tell application "System Events" to get UI elements enabled']);
    const enabled = stdout.trim().toLowerCase() === "true";
    return {
      name: "辅助功能权限",
      ok: enabled,
      detail: enabled ? "System Events 可访问 UI 元素。" : "请在系统设置 -> 隐私与安全性 -> 辅助功能中授权。"
    };
  } catch (error) {
    return {
      name: "辅助功能权限",
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

async function checkScreenCapture(): Promise<DoctorCheck> {
  const tempPath = path.join(os.tmpdir(), `cua-lark-doctor-${Date.now()}.png`);
  try {
    await execFileAsync("screencapture", ["-x", tempPath]);
    await access(tempPath);
    return {
      name: "屏幕录制权限",
      ok: true,
      detail: "已成功采集测试截图。"
    };
  } catch (error) {
    return {
      name: "屏幕录制权限",
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await rm(tempPath, { force: true });
  }
}

function printChecks(checks: DoctorCheck[]): void {
  console.log("CUA-Lark 环境检查");
  console.log("");
  for (const check of checks) {
    console.log(`${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.detail}`);
  }
  console.log("");
  const failed = checks.filter((item) => !item.ok);
  if (failed.length) {
    console.log(`发现 ${failed.length} 项需要处理。`);
    return;
  }
  console.log("所有关键检查已通过。");
}

function formatEnabled(value: boolean): string {
  return value ? "开启" : "关闭";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
