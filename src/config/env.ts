import path from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv();

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface AppConfig {
  runsDir: string;
  targetApps: string[];
  activationDelayMs: number;
  notification: {
    taskComplete: boolean;
    evalComplete: boolean;
    sound: string;
    completionDialog: boolean;
    dialogTimeoutSec: number;
  };
  reportUi: {
    openAfterTask: boolean;
  };
  task: {
    maxTurns: number;
    stepDelayMs: number;
    groupName: string;
    inboxGroupName: string;
    statusMessagePrefix: string;
    autoReplyStatus: boolean;
    selfHealRetries: number;
    sendRealMessage: boolean;
    contextIds: string[];
  };
  uiTars: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
  fallbackModel: ModelConfig;
}

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return defaultValue;
  }
  return !["0", "false", "no", "off"].includes(raw.toLowerCase());
}

function envList(name: string, defaultValue: string[]): string[] {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function envNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : defaultValue;
}

export function loadConfig(): AppConfig {
  return {
    runsDir: path.resolve(process.cwd(), process.env.CUA_LARK_RUNS_DIR ?? "runs"),
    targetApps: envList("CUA_LARK_TARGET_APP", ["飞书", "Lark"]),
    activationDelayMs: envNumber("CUA_LARK_ACTIVATION_DELAY_MS", 1000),
    notification: {
      taskComplete: envFlag("CUA_LARK_NOTIFY_TASK_COMPLETE", true),
      evalComplete: envFlag("CUA_LARK_NOTIFY_EVAL_COMPLETE", true),
      sound: process.env.CUA_LARK_NOTIFY_SOUND ?? "Glass",
      completionDialog: envFlag("CUA_LARK_COMPLETION_DIALOG", true),
      dialogTimeoutSec: envNumber("CUA_LARK_COMPLETION_DIALOG_TIMEOUT_SEC", 10)
    },
    reportUi: {
      openAfterTask: envFlag("CUA_LARK_OPEN_TASK_REPORT_UI", true)
    },
    task: {
      maxTurns: envNumber("TASK_MAX_TURNS", envNumber("M2_MAX_TURNS", 12)),
      stepDelayMs: envNumber("TASK_STEP_DELAY_MS", envNumber("M2_STEP_DELAY_MS", 800)),
      groupName: process.env.TASK_GROUP_NAME ?? process.env.M2_GROUP_NAME ?? "测试群",
      inboxGroupName: process.env.TASK_INBOX_GROUP_NAME ?? "任务群",
      statusMessagePrefix: process.env.TASK_STATUS_MESSAGE_PREFIX ?? "CUA-Lark",
      autoReplyStatus: envFlag("TASK_AUTO_REPLY_STATUS", true),
      selfHealRetries: Math.max(0, Math.floor(envNumber("TASK_SELF_HEAL_RETRIES", 1))),
      sendRealMessage: envFlag("TASK_SEND_REAL_MESSAGE", envFlag("M2_SEND_REAL_MESSAGE", true)),
      contextIds: envList("TASK_CONTEXT_IDS", [])
    },
    uiTars: {
      baseUrl: process.env.UI_TARS_BASE_URL,
      apiKey: process.env.UI_TARS_API_KEY,
      model: process.env.UI_TARS_MODEL
    },
    fallbackModel: {
      baseUrl: process.env.VLM_BASE_URL ?? "https://api.openai.com/v1",
      apiKey: process.env.VLM_API_KEY ?? "",
      model: process.env.VLM_MODEL ?? "gpt-4o",
      temperature: envNumber("VLM_TEMPERATURE", 0),
      maxTokens: envNumber("VLM_MAX_TOKENS", 2048)
    }
  };
}
