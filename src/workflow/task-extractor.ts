import { readFile } from "node:fs/promises";
import type { AppConfig } from "../config/env.js";
import type { NativeTaskReport } from "../core/types.js";

export interface ExtractedInboxTask {
  instruction: string;
  confidence: number;
  reason: string;
}

export async function extractInboxTaskInstruction(
  report: NativeTaskReport,
  config: AppConfig
): Promise<ExtractedInboxTask> {
  const baseURL = config.uiTars.baseUrl || config.fallbackModel.baseUrl;
  const apiKey = config.uiTars.apiKey || config.fallbackModel.apiKey;
  const model = config.uiTars.model || config.fallbackModel.model;

  if (!baseURL || !apiKey || !model) {
    return {
      instruction: "",
      confidence: 0,
      reason: "缺少 VLM 模型配置，无法从任务群截图中提取任务。"
    };
  }

  try {
    const response = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "你是飞书自动化任务提取器。只返回紧凑 JSON：{\"instruction\":\"...\",\"confidence\":0-1,\"reason\":\"...\"}。"
          },
          {
            role: "user",
            content: await buildExtractionContent(report)
          }
        ]
      })
    });

    if (!response.ok) {
      return {
        instruction: "",
        confidence: 0,
        reason: `任务提取请求失败，HTTP 状态码 ${response.status}`
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return normalizeExtractedTask(parseJson(payload.choices?.[0]?.message?.content ?? ""));
  } catch (error) {
    return {
      instruction: "",
      confidence: 0,
      reason: `任务提取异常：${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function buildExtractionContent(report: NativeTaskReport): Promise<Array<Record<string, unknown>>> {
  const text = [
    "请从飞书 IM 任务群的最新可见消息中提取需要 agent 执行的自然语言任务。",
    "只提取任务本身，不要提取状态消息、历史报告、系统提示或闲聊。",
    "如果最新任务不清晰、截图不可用或只能看到历史消息，请返回空 instruction，并把 confidence 设为 0。",
    "",
    "运行证据：",
    buildReportEvidence(report)
  ].join("\n");

  const content: Array<Record<string, unknown>> = [{ type: "text", text }];
  const screenshotPath = [...report.turnResults].reverse().find((turn) => turn.screenshotPath)?.screenshotPath;
  if (screenshotPath) {
    const bytes = await readFile(screenshotPath);
    content.push({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${bytes.toString("base64")}`
      }
    });
  }
  return content;
}

function buildReportEvidence(report: NativeTaskReport): string {
  return [
    report.taskName,
    report.instruction,
    report.userPrompt,
    report.parsedGoal,
    ...report.turnResults.flatMap((turn) => [
      `Turn ${turn.turn}: ${turn.status}`,
      turn.prediction ?? "",
      turn.error ?? ""
    ])
  ]
    .join("\n")
    .slice(0, 12000);
}

function parseJson(content: string): unknown {
  const jsonBlock = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
  return JSON.parse(jsonBlock);
}

function normalizeExtractedTask(value: unknown): ExtractedInboxTask {
  if (!value || typeof value !== "object") {
    return {
      instruction: "",
      confidence: 0,
      reason: "模型未返回结构化任务。"
    };
  }
  const record = value as Record<string, unknown>;
  const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence) ? record.confidence : 0;
  return {
    instruction: typeof record.instruction === "string" ? record.instruction.trim() : "",
    confidence: Math.max(0, Math.min(1, confidence)),
    reason: typeof record.reason === "string" ? record.reason : ""
  };
}
