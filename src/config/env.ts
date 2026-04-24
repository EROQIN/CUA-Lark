import path from "node:path";
import { config as loadDotenv } from "dotenv";
import type { VLMConfig } from "../vlm/types.js";

loadDotenv();

export interface AppConfig {
  runsDir: string;
  screenshotFallback: boolean;
  actionFallback: boolean;
  targetApps: string[];
  activationDelayMs: number;
  m2: {
    maxTurns: number;
    stepDelayMs: number;
    groupName: string;
    sendRealMessage: boolean;
  };
  vlm: VLMConfig;
  uiTars: {
    baseURL?: string;
    apiKey?: string;
    model?: string;
  };
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
    screenshotFallback: envFlag("CUA_LARK_SCREENSHOT_FALLBACK", true),
    actionFallback: envFlag("CUA_LARK_ACTION_FALLBACK", true),
    targetApps: envList("CUA_LARK_TARGET_APP", ["飞书", "Lark"]),
    activationDelayMs: envNumber("CUA_LARK_ACTIVATION_DELAY_MS", 1000),
    m2: {
      maxTurns: envNumber("M2_MAX_TURNS", 12),
      stepDelayMs: envNumber("M2_STEP_DELAY_MS", 800),
      groupName: process.env.M2_GROUP_NAME ?? "测试群",
      sendRealMessage: envFlag("M2_SEND_REAL_MESSAGE", true)
    },
    vlm: {
      provider: "openai-compatible",
      baseUrl: process.env.VLM_BASE_URL ?? "https://api.openai.com/v1",
      apiKey: process.env.VLM_API_KEY ?? "",
      model: process.env.VLM_MODEL ?? "gpt-4o",
      temperature: envNumber("VLM_TEMPERATURE", 0),
      maxTokens: envNumber("VLM_MAX_TOKENS", 1024),
      timeoutMs: envNumber("VLM_TIMEOUT_MS", 60000),
      maxRetries: envNumber("VLM_MAX_RETRIES", 1)
    },
    uiTars: {
      baseURL: process.env.UI_TARS_BASE_URL,
      apiKey: process.env.UI_TARS_API_KEY,
      model: process.env.UI_TARS_MODEL
    }
  };
}
