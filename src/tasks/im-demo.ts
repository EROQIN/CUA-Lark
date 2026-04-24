import type { AppConfig } from "../config/env.js";
import type { AgentTask } from "../planner/types.js";
import { nowIso } from "../utils/time.js";

export function createM2ImDemoTask(config: AppConfig): AgentTask {
  const messageContent = `CUA-Lark 自动化测试消息 ${nowIso()}`;

  return {
    name: "M2 IM End-to-End Free Planner Demo",
    instruction: `搜索${config.m2.groupName}并发送一条自动化测试消息`,
    groupName: config.m2.groupName,
    messageContent,
    maxTurns: config.m2.maxTurns,
    stepDelayMs: config.m2.stepDelayMs,
    sendRealMessage: config.m2.sendRealMessage
  };
}
