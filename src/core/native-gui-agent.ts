import path from "node:path";
import { writeFile } from "node:fs/promises";
import { GUIAgent, StatusEnum, type GUIAgentData } from "@ui-tars/sdk";
import { NutJSOperator } from "@ui-tars/operator-nut-js";
import type { AppConfig } from "../config/env.js";
import { renderOperationContexts, selectOperationContexts } from "../context/operation-catalog.js";
import type { AgentTask, NativeGuiTurnResult } from "./types.js";
import { ensureDir } from "../utils/file.js";
import { logger } from "./logger.js";

export class NativeGuiAgentRunner {
  constructor(private readonly config: AppConfig) {}

  async run(task: AgentTask, runDir: string): Promise<NativeGuiTurnResult[]> {
    const modelConfig = this.resolveModelConfig();
    const screenshotDir = path.join(runDir, "screenshots");
    await ensureDir(screenshotDir);

    const turns: NativeGuiTurnResult[] = [];
    const pendingRecords: Array<Promise<void>> = [];
    const operator = new NutJSOperator();
    const agent = new GUIAgent({
      operator,
      model: modelConfig,
      maxLoopCount: task.maxTurns,
      loopIntervalInMs: task.stepDelayMs,
      logger: {
        log: (...args: unknown[]) => logger.info("UI-TARS", { args }),
        info: (...args: unknown[]) => logger.info("UI-TARS", { args }),
        warn: (...args: unknown[]) => logger.warn("UI-TARS", { args }),
        error: (...args: unknown[]) => logger.error("UI-TARS", { args })
      },
      onData: ({ data }) => {
        pendingRecords.push(this.recordTurn(data, screenshotDir, turns));
      },
      onError: ({ data, error }) => {
        pendingRecords.push(this.recordTurn(data, screenshotDir, turns, error.message));
      }
    });

    await agent.run(buildNativeInstruction(task));
    await Promise.all(pendingRecords);
    return turns;
  }

  private resolveModelConfig() {
    const baseURL = this.config.uiTars.baseUrl || this.config.fallbackModel.baseUrl;
    const apiKey = this.config.uiTars.apiKey || this.config.fallbackModel.apiKey;
    const model = this.config.uiTars.model || this.config.fallbackModel.model;

    if (!apiKey) {
      throw new Error("UI_TARS_API_KEY or VLM_API_KEY is required when using GUIAgent mode.");
    }

    return {
      baseURL,
      apiKey,
      model,
      temperature: this.config.fallbackModel.temperature,
      max_tokens: this.config.fallbackModel.maxTokens
    };
  }

  private async recordTurn(
    data: GUIAgentData,
    screenshotDir: string,
    turns: NativeGuiTurnResult[],
    error?: string
  ): Promise<void> {
    const lastConversation = data.conversations.at(-1);
    const screenshotConversation = [...data.conversations].reverse().find((conversation) => conversation.screenshotBase64);
    const predictionConversation = [...data.conversations].reverse().find((conversation) => conversation.from === "gpt");
    const turnIndex = turns.length + 1;
    let screenshotPath: string | undefined;
    const turn: NativeGuiTurnResult = {
      turn: turnIndex,
      status: data.status,
      prediction: predictionConversation?.value,
      parsedPrediction: lastConversation?.predictionParsed ?? predictionConversation?.predictionParsed,
      screenshotSize: screenshotConversation?.screenshotContext?.size,
      scaleFactor: screenshotConversation?.screenshotContext?.scaleFactor,
      error: error ?? data.errMsg ?? data.error?.message
    };
    turns.push(turn);

    if (screenshotConversation?.screenshotBase64) {
      screenshotPath = path.join(screenshotDir, `gui-turn-${turnIndex}.png`);
      await writeFile(screenshotPath, Buffer.from(stripDataUrl(screenshotConversation.screenshotBase64), "base64"));
      turn.screenshotPath = screenshotPath;
    }
  }
}

function buildNativeInstruction(task: AgentTask): string {
  const safety =
    task.product === "vc"
      ? ""
      : "";
  const operationContextPrompt = renderOperationContexts(selectOperationContexts(task));

  return [
    task.instruction,
    "",
    `用户原始提示词：${task.userPrompt}`,
    `解析目标：${task.parsedGoal}`,
    task.groupName ? `目标群聊/联系人：${task.groupName}` : "",
    task.messageContent ? `要发送的消息：${task.messageContent}` : "",
    task.documentTitle ? `目标文档标题：${task.documentTitle}` : "",
    task.documentBody ? `目标文档正文：${task.documentBody}` : "",
    operationContextPrompt,
    "操作偏好：切换飞书页面或打开已有群聊/已有文档时，优先使用 Command+K 打开飞书内置搜索，搜索框会自动获得焦点。",
    "操作偏好：聊天输入框已聚焦时，可以一次性输入文本并按 Enter 发送。",
    "限制：Command+K 只用于页面切换或打开已有对象，不能用于新建云文档、预约会议等场景内具体操作。",
    safety,
    "完成条件：只有当前截图已经显示任务要求的最终状态时才结束。"
  ]
    .filter(Boolean)
    .join("\n");
}

function stripDataUrl(value: string): string {
  return value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
}

export function nativeFinalStatus(turns: NativeGuiTurnResult[]): "success" | "failed" | "max_turns" {
  const last = turns.at(-1);
  if (!last) {
    return "failed";
  }
  if (last.status === StatusEnum.END) {
    return "success";
  }
  if (last.status === StatusEnum.MAX_LOOP) {
    return "max_turns";
  }
  if (last.status === StatusEnum.ERROR || last.error) {
    return "failed";
  }
  return "max_turns";
}
