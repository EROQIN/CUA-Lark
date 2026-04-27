import type { AppConfig } from "../config/env.js";
import type { AgentTask, ProductType } from "../core/types.js";
import { nowIso } from "../utils/time.js";

export function createCustomTask(config: AppConfig, userPrompt: string): AgentTask {
  const product = resolveTaskProduct(process.env.TASK_PRODUCT, userPrompt);
  const groupName = extractQuoted(userPrompt) ?? config.task.groupName;
  const messageContent = resolveMessageContent(userPrompt);
  const documentTitle = product === "docs" ? extractQuoted(userPrompt) ?? "项目周报" : undefined;
  const documentBody = product === "docs" ? extractTitleLikeText(userPrompt) : undefined;

  return {
    name: "Custom GUIAgent Task",
    instruction: userPrompt,
    product,
    userPrompt,
    parsedGoal: buildParsedGoal(product, userPrompt, groupName, messageContent, documentTitle, documentBody),
    groupName: product === "im" ? groupName : undefined,
    messageContent: product === "im" ? messageContent : undefined,
    documentTitle,
    documentBody,
    maxTurns: config.task.maxTurns,
    stepDelayMs: config.task.stepDelayMs,
    sendRealMessage: config.task.sendRealMessage,
    contextIds: config.task.contextIds
  };
}

export function createVcDemoTask(config: AppConfig): AgentTask {
  const userPrompt = "打开飞书视频会议页面，点击预约会议，进入预约会议表单后停止";

  return {
    name: "VC Schedule Form Demo",
    instruction: `${userPrompt}。不要点击最终确认、保存、创建或发送邀请。`,
    product: "vc",
    userPrompt,
    parsedGoal: "打开视频会议页面并进入预约会议表单，到达表单后停止，不创建真实会议",
    maxTurns: config.task.maxTurns,
    stepDelayMs: config.task.stepDelayMs,
    sendRealMessage: false,
    contextIds: config.task.contextIds
  };
}

export function createImDemoTask(config: AppConfig): AgentTask {
  const messageContent = `CUA-Lark 自动化测试消息 ${nowIso()}`;
  const userPrompt = `在IM中搜索'${config.task.groupName}'，发送一条消息'${messageContent}'，并确认发送成功`;

  return {
    name: "IM Send Message Demo",
    instruction: userPrompt,
    product: "im",
    userPrompt,
    parsedGoal: `在 IM 中搜索 ${config.task.groupName}，发送消息并验证发送成功`,
    groupName: config.task.groupName,
    messageContent,
    maxTurns: config.task.maxTurns,
    stepDelayMs: config.task.stepDelayMs,
    sendRealMessage: config.task.sendRealMessage,
    contextIds: config.task.contextIds
  };
}

export function createDocsDemoTask(config: AppConfig): AgentTask {
  const title = "Hello Lark";
  const userPrompt = `在飞书中创建一个新的云文档，标题为'${title}'`;

  return {
    name: "Docs Create Document Demo",
    instruction: userPrompt,
    product: "docs",
    userPrompt,
    parsedGoal: `创建云文档并输入标题 ${title}`,
    documentTitle: title,
    maxTurns: config.task.maxTurns,
    stepDelayMs: config.task.stepDelayMs,
    sendRealMessage: false,
    contextIds: config.task.contextIds
  };
}

function resolveTaskProduct(rawProduct: string | undefined, prompt: string): ProductType {
  const normalized = rawProduct?.toLowerCase();
  if (normalized && normalized !== "auto" && ["im", "docs", "calendar", "base", "vc", "mail"].includes(normalized)) {
    return normalized as ProductType;
  }

  if (/群|消息|IM|联系人|聊天/.test(prompt)) {
    return "im";
  }
  if (/文档|标题|正文|Docs|云文档/.test(prompt)) {
    return "docs";
  }
  if (/视频会议|预约会议|预定会议|发起会议|加入会议|VC|会议/.test(prompt)) {
    return "vc";
  }
  return "auto";
}

function resolveMessageContent(prompt: string): string {
  const quoted = [...prompt.matchAll(/['"“”‘’]([^'"“”‘’]+)['"“”‘’]/g)].map((match) => match[1]);
  if (quoted.length >= 2) {
    return quoted[1];
  }
  if (/消息/.test(prompt)) {
    return `CUA-Lark 自动化测试消息 ${nowIso()}`;
  }
  return "";
}

function extractQuoted(prompt: string): string | undefined {
  return prompt.match(/['"“”‘’]([^'"“”‘’]+)['"“”‘’]/)?.[1];
}

function extractTitleLikeText(prompt: string): string | undefined {
  return prompt.match(/标题['"“”‘’]?([^'"“”‘’，,。]+)['"“”‘’]?/)?.[1]?.trim();
}

function buildParsedGoal(
  product: ProductType,
  prompt: string,
  groupName: string,
  messageContent: string,
  documentTitle?: string,
  documentBody?: string
): string {
  if (product === "im") {
    return `在 IM 中搜索 ${groupName}，发送 ${messageContent || "指定消息"} 并验证发送成功`;
  }
  if (product === "docs") {
    return `创建或打开云文档 ${documentTitle ?? "未命名文档"}，输入 ${documentBody ?? "指定标题/正文"} 并验证可见`;
  }
  if (product === "vc") {
    return `在视频会议中完成会议任务：${prompt}`;
  }
  return prompt;
}
