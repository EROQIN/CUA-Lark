import path from "node:path";
import type { AppConfig } from "../config/env.js";
import { CUALarkAgent } from "../core/agent.js";
import type {
  AdvancedEvent,
  AgentTask,
  NativeTaskReport,
  ProductType,
  WorkflowDefinition,
  WorkflowPhaseReport,
  WorkflowReport,
  WorkflowStep
} from "../core/types.js";
import { createCustomTask } from "../tasks/task-factory.js";
import { ensureDir } from "../utils/file.js";
import { createRunId, nowIso } from "../utils/time.js";
import { extractInboxTaskInstruction } from "./task-extractor.js";
import { WorkflowReportGenerator } from "./report-generator.js";

const EXTRACTION_CONFIDENCE_THRESHOLD = 0.55;

export class WorkflowRunner {
  private readonly agent: CUALarkAgent;

  constructor(private readonly config: AppConfig) {
    this.agent = new CUALarkAgent({
      ...config,
      notification: {
        ...config.notification,
        taskComplete: false
      }
    });
  }

  async runWorkflow(definition: WorkflowDefinition): Promise<WorkflowReport> {
    if (definition.entry === "im-inbox") {
      return this.runInboxWorkflow(definition);
    }
    return this.runDirectWorkflow(definition);
  }

  async runInboxWorkflow(definition = createInboxWorkflowDefinition(this.config)): Promise<WorkflowReport> {
    const inboxGroupName = definition.inboxGroupName || this.config.task.inboxGroupName;
    const readStep = definition.steps[0] ?? createReadInboxStep(inboxGroupName);
    const startedAt = nowIso();
    const startedMs = Date.now();
    const workflowRunId = createRunId();
    const runDir = path.join(this.config.runsDir, workflowRunId);
    await ensureDir(runDir);

    const workflowPhases: WorkflowPhaseReport[] = [];
    const advancedEvents: AdvancedEvent[] = [];
    const actionTypes: string[] = [];
    let recoveryCount = 0;
    let extractedInstruction = "";
    let finalStatus: WorkflowReport["finalStatus"] = "failed";

    const readResult = await this.runStepWithRecovery(readStep, {
      workflowId: definition.id,
      advancedEvents,
      actionTypes
    });
    workflowPhases.push(...readResult.phases);
    recoveryCount += readResult.recoveryCount;

    if (readResult.passed) {
      const extraction = await extractInboxTaskInstruction(readResult.report, this.config);
      extractedInstruction = extraction.instruction;
      if (!extraction.instruction || extraction.confidence < EXTRACTION_CONFIDENCE_THRESHOLD) {
        advancedEvents.push({
          type: "permission_blocked",
          phaseId: readStep.id,
          detectedAt: nowIso(),
          message: "任务群最新消息提取置信度不足，已停止执行。",
          evidence: extraction.reason || `confidence=${extraction.confidence}`
        });
      } else {
        const statusMessage = `${this.config.task.statusMessagePrefix} 任务执行完成`;
        const remainingSteps = buildInboxRemainingSteps(definition, {
          inboxGroupName,
          extractedInstruction,
          statusMessage
        });
        let previousProduct: ProductType = readStep.product;
        let executionPassed = true;

        for (const step of remainingSteps) {
          recordHandoff(previousProduct, step.product, step.id, advancedEvents);
          const result = await this.runStepWithRecovery(step, {
            workflowId: definition.id,
            advancedEvents,
            actionTypes
          });
          workflowPhases.push(...result.phases);
          recoveryCount += result.recoveryCount;
          previousProduct = step.product;
          executionPassed = result.passed;
          if (!result.passed && !isStatusReplyStep(step)) {
            break;
          }
        }

        finalStatus = executionPassed ? "success" : resolveWorkflowFailureStatus(workflowPhases);
      }
    }

    if (!workflowPhases.every((phase) => phase.passed)) {
      finalStatus = resolveWorkflowFailureStatus(workflowPhases);
    }

    return new WorkflowReportGenerator(runDir).generate({
      workflowRunId,
      workflowId: definition.id,
      title: definition.title,
      entry: definition.entry,
      inboxGroupName,
      extractedInstruction,
      finalStatus,
      productTrail: buildProductTrail(workflowPhases),
      workflowPhases,
      advancedEvents,
      recoveryCount,
      startedAt,
      endedAt: nowIso(),
      durationMs: Date.now() - startedMs,
      totalTurns: sum(workflowPhases.map((phase) => phase.totalTurns)),
      actionCount: sum(workflowPhases.map((phase) => phase.actionCount)),
      actionTypes
    });
  }

  private async runDirectWorkflow(definition: WorkflowDefinition): Promise<WorkflowReport> {
    const startedAt = nowIso();
    const startedMs = Date.now();
    const workflowRunId = createRunId();
    const runDir = path.join(this.config.runsDir, workflowRunId);
    await ensureDir(runDir);

    const workflowPhases: WorkflowPhaseReport[] = [];
    const advancedEvents: AdvancedEvent[] = [];
    const actionTypes: string[] = [];
    let recoveryCount = 0;
    let previousProduct: ProductType | undefined;

    for (const step of definition.steps) {
      if (previousProduct) {
        recordHandoff(previousProduct, step.product, step.id, advancedEvents);
      }
      const result = await this.runStepWithRecovery(step, {
        workflowId: definition.id,
        advancedEvents,
        actionTypes
      });
      workflowPhases.push(...result.phases);
      recoveryCount += result.recoveryCount;
      previousProduct = step.product;
      if (!result.passed) {
        break;
      }
    }

    const finalStatus = workflowPhases.every((phase) => phase.passed)
      ? "success"
      : resolveWorkflowFailureStatus(workflowPhases);

    return new WorkflowReportGenerator(runDir).generate({
      workflowRunId,
      workflowId: definition.id,
      title: definition.title,
      entry: definition.entry,
      inboxGroupName: definition.inboxGroupName,
      finalStatus,
      productTrail: buildProductTrail(workflowPhases),
      workflowPhases,
      advancedEvents,
      recoveryCount,
      startedAt,
      endedAt: nowIso(),
      durationMs: Date.now() - startedMs,
      totalTurns: sum(workflowPhases.map((phase) => phase.totalTurns)),
      actionCount: sum(workflowPhases.map((phase) => phase.actionCount)),
      actionTypes
    });
  }

  private async runStepWithRecovery(
    step: WorkflowStep,
    context: {
      workflowId: string;
      advancedEvents: AdvancedEvent[];
      actionTypes: string[];
    }
  ): Promise<{
    phases: WorkflowPhaseReport[];
    report: NativeTaskReport;
    passed: boolean;
    recoveryCount: number;
  }> {
    const phases: WorkflowPhaseReport[] = [];
    let report = await this.runStep(step, context.workflowId, 1);
    let passed = stepPassed(report, step);
    phases.push(toPhaseReport(step, report, 1, passed));
    context.actionTypes.push(...extractActionTypesFromReport(report));
    recordReportEvents(report, step.id, context.advancedEvents);

    let recoveryCount = 0;
    while (!passed && recoveryCount < this.config.task.selfHealRetries) {
      recoveryCount += 1;
      context.advancedEvents.push({
        type: "self_heal_retry",
        phaseId: step.id,
        detectedAt: nowIso(),
        message: `阶段失败后发起第 ${recoveryCount} 次自愈重试。`,
        evidence: phases.at(-1)?.failureReason
      });
      context.advancedEvents.push({
        type: "alternate_path",
        phaseId: step.id,
        detectedAt: nowIso(),
        message: "自愈重试要求保持目标不变，并尝试关闭弹窗、等待加载或改用替代入口。",
        evidence: step.instruction
      });
      const recoveryStep = {
        ...step,
        instruction: buildRecoveryInstruction(step, phases.at(-1)?.failureReason ?? "未知失败")
      };
      report = await this.runStep(recoveryStep, context.workflowId, recoveryCount + 1);
      passed = stepPassed(report, step);
      phases.push(toPhaseReport(step, report, recoveryCount + 1, passed));
      context.actionTypes.push(...extractActionTypesFromReport(report));
      recordReportEvents(report, step.id, context.advancedEvents);
    }

    return {
      phases,
      report,
      passed,
      recoveryCount
    };
  }

  private async runStep(step: WorkflowStep, workflowId: string, attempt: number): Promise<NativeTaskReport> {
    const base = createCustomTask(this.config, step.instruction);
    const product = step.product === "auto" ? base.product : step.product;
    const task: AgentTask = {
      ...base,
      name: `Workflow ${workflowId}/${step.id}#${attempt}: ${step.title}`,
      instruction: step.instruction,
      userPrompt: step.instruction,
      product,
      parsedGoal: step.product === "auto" ? base.parsedGoal || step.title : `${step.title}：${step.instruction}`,
      groupName: product === "im" ? base.groupName : undefined,
      messageContent: product === "im" ? base.messageContent : undefined,
      documentTitle: product === "docs" ? base.documentTitle : undefined,
      documentBody: product === "docs" ? base.documentBody : undefined,
      maxTurns: step.maxTurns ?? base.maxTurns,
      stepDelayMs: step.stepDelayMs ?? base.stepDelayMs,
      sendRealMessage: step.sendRealMessage ?? base.sendRealMessage,
      contextIds: mergeContextIds(step.contextIds, base.contextIds)
    };
    return this.agent.runTask(task);
  }
}

export function createCrossProductDemoWorkflow(config: AppConfig): WorkflowDefinition {
  const inboxGroupName = config.task.inboxGroupName;
  const statusMessage = `${config.task.statusMessagePrefix} 跨产品联动测试完成：已确认日历邀请`;
  return {
    id: "cross-im-calendar-invite-confirm",
    title: "IM 日历邀请确认联动",
    entry: "direct",
    inboxGroupName,
    autoReplyStatus: config.task.autoReplyStatus,
    steps: [
      {
        id: "open-task-inbox",
        title: "打开任务群并定位日历邀请",
        product: "im",
        instruction: `在IM中搜索'${inboxGroupName}'并打开任务群，找到最新的日历邀请或日历任务消息，确认任务消息可见后停止。不要点击确认、接受或跳转按钮。`,
        contextIds: ["global-resilience", "global-command-search", "im-task-inbox"],
        expectedTexts: [inboxGroupName]
      },
      {
        id: "confirm-calendar-invite",
        title: "跳转日历并确认参与",
        product: "calendar",
        instruction:
          "从当前任务群里的日历邀请或日历任务消息进入日历详情，确认日程标题和时间与任务一致，然后点击接受、确认参加或保存；看到状态为已接受、已参加或已保存后停止。",
        contextIds: ["global-resilience", "calendar-invite-confirm", "calendar-create-event"]
      },
      {
        id: "return-im-verify",
        title: "返回任务群回写状态",
        product: "im",
        instruction: `回到IM任务群'${inboxGroupName}'，发送一条消息'${statusMessage}'，看到消息出现在聊天时间线后停止。`,
        contextIds: ["global-resilience", "global-command-search", "im-task-inbox", "im-chat-send-message"],
        expectedTexts: [statusMessage]
      }
    ]
  };
}

export function createInboxWorkflowDefinition(config: AppConfig): WorkflowDefinition {
  const inboxGroupName = config.task.inboxGroupName;
  const statusMessage = `${config.task.statusMessagePrefix} 任务执行完成：{{extractedInstruction}}`;
  return {
    id: "im-inbox-task-execution",
    title: "任务群自然语言任务执行",
    entry: "im-inbox",
    inboxGroupName,
    autoReplyStatus: config.task.autoReplyStatus,
    steps: [
      createReadInboxStep(inboxGroupName),
      {
        id: "execute-extracted-task",
        title: "执行提取出的任务",
        product: "auto",
        instruction: "{{extractedInstruction}}",
        contextIds: ["global-resilience", "global-command-search", "im-task-inbox", "calendar-invite-confirm"]
      },
      {
        id: "reply-inbox-status",
        title: "返回任务群回写状态",
        product: "im",
        instruction: `回到IM任务群'{{inboxGroupName}}'，发送一条消息'${statusMessage}'，看到消息出现在聊天时间线后停止。`,
        contextIds: ["global-resilience", "global-command-search", "im-task-inbox", "im-chat-send-message"],
        expectedTexts: [config.task.statusMessagePrefix]
      }
    ]
  };
}

function createReadInboxStep(inboxGroupName: string): WorkflowStep {
  return {
    id: "read-inbox-task",
    title: "读取任务群最新任务",
    product: "im",
    instruction: `在IM中搜索'${inboxGroupName}'并打开任务群，定位消息区最新一条任务消息，让任务文本或任务卡片完整可见后停止。不要执行任务，不要发送消息。`,
    contextIds: ["global-resilience", "global-command-search", "im-task-inbox"],
    expectedTexts: [inboxGroupName]
  };
}

function buildInboxRemainingSteps(
  definition: WorkflowDefinition,
  values: {
    inboxGroupName: string;
    extractedInstruction: string;
    statusMessage: string;
  }
): WorkflowStep[] {
  const steps = definition.steps.slice(1);
  const resolved = steps.length
    ? steps
    : [
        {
          id: "execute-extracted-task",
          title: "执行提取出的任务",
          product: "auto" as ProductType,
          instruction: "{{extractedInstruction}}"
        }
      ];

  return resolved
    .filter((step) => definition.autoReplyStatus !== false || !isStatusReplyStep(step))
    .map((step) => ({
      ...step,
      instruction: replaceWorkflowTokens(step.instruction, values),
      expectedTexts: step.expectedTexts?.map((item) => replaceWorkflowTokens(item, values))
    }));
}

function replaceWorkflowTokens(
  value: string,
  tokens: {
    inboxGroupName: string;
    extractedInstruction: string;
    statusMessage: string;
  }
): string {
  return value
    .replaceAll("{{inboxGroupName}}", tokens.inboxGroupName)
    .replaceAll("{{extractedInstruction}}", tokens.extractedInstruction)
    .replaceAll("{{statusMessage}}", tokens.statusMessage);
}

function isStatusReplyStep(step: WorkflowStep): boolean {
  return /reply|status|回写|状态/.test(`${step.id} ${step.title}`);
}

function stepPassed(report: NativeTaskReport, step: WorkflowStep): boolean {
  if (report.finalStatus !== "success") {
    return false;
  }
  const source = buildReportSource(report);
  return (step.expectedTexts ?? []).every((text) => source.includes(text));
}

function toPhaseReport(step: WorkflowStep, report: NativeTaskReport, attempt: number, passed: boolean): WorkflowPhaseReport {
  return {
    id: step.id,
    title: step.title,
    product: step.product === "auto" ? report.product : step.product,
    attempt,
    finalStatus: report.finalStatus,
    passed,
    runId: report.runId,
    reportPath: report.reportPath,
    reportJsonPath: report.reportJsonPath,
    durationMs: report.durationMs,
    totalTurns: report.totalTurns,
    actionCount: report.actionCount ?? extractActionTypesFromReport(report).filter((item) => item !== "finished").length,
    failureReason: passed ? "" : buildFailureReason(report, step)
  };
}

function buildFailureReason(report: NativeTaskReport, step: WorkflowStep): string {
  if (report.finalStatus !== "success") {
    return `阶段状态为 ${formatFinalStatus(report.finalStatus)}`;
  }
  const source = buildReportSource(report);
  const missing = (step.expectedTexts ?? []).filter((text) => !source.includes(text));
  if (missing.length) {
    return `缺少阶段必需文本：${missing.join(", ")}`;
  }
  return "阶段未通过";
}

function buildRecoveryInstruction(step: WorkflowStep, failureReason: string): string {
  return [
    "恢复执行：上一轮同一阶段没有达成完成条件，请保持原任务目标不变，分析当前界面原因并尝试替代路径。",
    `失败原因：${failureReason}`,
    "优先处理无关弹窗、权限提示、加载超时、搜索无结果和按钮不可见等问题；必要时使用 Command+K 重新进入目标产品或返回上一级再尝试。",
    "如果遇到权限不足、对象不存在或联系人无法确认，请停止并说明原因。",
    "",
    `原始阶段任务：${step.instruction}`
  ].join("\n");
}

function recordHandoff(
  previousProduct: ProductType,
  nextProduct: ProductType,
  phaseId: string,
  advancedEvents: AdvancedEvent[]
): void {
  if (previousProduct === nextProduct || nextProduct === "auto") {
    return;
  }
  advancedEvents.push({
    type: "cross_product_handoff",
    phaseId,
    detectedAt: nowIso(),
    message: `跨产品切换：${previousProduct} -> ${nextProduct}`
  });
}

function recordReportEvents(report: NativeTaskReport, phaseId: string, advancedEvents: AdvancedEvent[]): void {
  const source = buildReportSource(report);
  const candidates: Array<[AdvancedEvent["type"], RegExp, string]> = [
    ["popup_detected", /弹窗|提示框|确认弹窗|升级提示|遮挡/g, "检测到可能遮挡操作的弹窗或提示。"],
    ["permission_blocked", /权限不足|无权限|没有权限|未授权|无法访问|permission/gi, "检测到权限或访问限制。"],
    ["loading_timeout", /加载超时|超时|加载失败|网络异常|timeout|loading/gi, "检测到加载超时或网络异常。"]
  ];
  for (const [type, pattern, message] of candidates) {
    const match = source.match(pattern)?.[0];
    if (match) {
      advancedEvents.push({
        type,
        phaseId,
        detectedAt: nowIso(),
        message,
        evidence: match
      });
    }
  }
}

function extractActionTypesFromReport(report: NativeTaskReport): string[] {
  return report.turnResults.flatMap((turn) => extractActionTypes(turn.parsedPrediction));
}

function extractActionTypes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(extractActionTypes);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const record = value as Record<string, unknown>;
  const ownAction = typeof record.action_type === "string" ? [record.action_type] : [];
  return [...ownAction, ...Object.values(record).flatMap(extractActionTypes)];
}

function buildReportSource(report: NativeTaskReport): string {
  return [
    report.taskName,
    report.instruction,
    report.userPrompt,
    report.parsedGoal,
    report.finalStatus,
    ...report.turnResults.flatMap((turn) => [
      turn.status,
      turn.prediction ?? "",
      turn.error ?? "",
      turn.parsedPrediction === undefined ? "" : JSON.stringify(turn.parsedPrediction)
    ])
  ].join("\n");
}

function mergeContextIds(primary: string[] | undefined, fallback: string[] | undefined): string[] {
  return [...new Set([...(primary ?? []), ...(fallback ?? [])])];
}

function buildProductTrail(phases: WorkflowPhaseReport[]): ProductType[] {
  return phases.reduce<ProductType[]>((trail, phase) => {
    if (trail.at(-1) !== phase.product) {
      trail.push(phase.product);
    }
    return trail;
  }, []);
}

function resolveWorkflowFailureStatus(phases: WorkflowPhaseReport[]): WorkflowReport["finalStatus"] {
  return phases.some((phase) => phase.finalStatus === "max_turns") ? "max_turns" : "failed";
}

function formatFinalStatus(status: NativeTaskReport["finalStatus"]): string {
  const labels: Record<NativeTaskReport["finalStatus"], string> = {
    success: "成功",
    failed: "失败",
    max_turns: "达到最大轮次"
  };
  return labels[status];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
