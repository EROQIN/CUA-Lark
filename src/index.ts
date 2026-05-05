import { loadConfig } from "./config/env.js";
import { CUALarkAgent } from "./core/agent.js";
import { openTaskReportUi, taskReportUiUrl } from "./core/report-ui.js";
import type { AgentTask, NativeTaskReport } from "./core/types.js";
import {
  createCalendarDemoTask,
  createCustomTask,
  createDocsDemoTask,
  createImDemoTask,
  createVcDemoTask
} from "./tasks/task-factory.js";
import {
  createCrossProductDemoWorkflow,
  createInboxWorkflowDefinition,
  WorkflowRunner
} from "./workflow/workflow-runner.js";

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "task";
  const config = loadConfig();
  const agent = new CUALarkAgent(config);

  if (mode === "demo:vc" || mode === "demo:gui:vc") {
    const task = createVcDemoTask(config);
    const report = await agent.runTask(task);
    await finishSingleTask(config, task, report);
    return;
  }

  if (mode === "demo:im") {
    const task = createImDemoTask(config);
    const report = await agent.runTask(task);
    await finishSingleTask(config, task, report);
    return;
  }

  if (mode === "demo:docs") {
    const task = createDocsDemoTask(config);
    const report = await agent.runTask(task);
    await finishSingleTask(config, task, report);
    return;
  }

  if (mode === "demo:calendar") {
    const task = createCalendarDemoTask(config);
    const report = await agent.runTask(task);
    await finishSingleTask(config, task, report);
    return;
  }

  if (mode === "demo:cross") {
    const workflow = createCrossProductDemoWorkflow(config);
    const report = await new WorkflowRunner(config).runWorkflow(workflow);
    console.log(`${workflow.title} finished. Workflow report: ${report.workflowReportMarkdownPath}`);
    return;
  }

  if (mode === "task:inbox") {
    const workflow = createInboxWorkflowDefinition(config);
    const report = await new WorkflowRunner(config).runInboxWorkflow(workflow);
    console.log(`${workflow.title} finished. Workflow report: ${report.workflowReportMarkdownPath}`);
    return;
  }

  if (mode === "task" || mode === "task:gui") {
    const userPrompt = process.argv.slice(3).join(" ").trim();
    if (!userPrompt) {
      throw new Error('Usage: pnpm task "自然语言测试指令"');
    }
    const task = createCustomTask(config, userPrompt);
    const report = await agent.runTask(task);
    await finishSingleTask(config, task, report);
    return;
  }

  const task = createCustomTask(config, process.argv.slice(2).join(" ").trim());
  const report = await agent.runTask(task);
  await finishSingleTask(config, task, report);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function finishSingleTask(config: ReturnType<typeof loadConfig>, task: AgentTask, report: NativeTaskReport): Promise<void> {
  console.log(`${task.name} finished.`);
  console.log(`报告界面：${taskReportUiUrl(report) || report.reportHtmlPath || ""}`);
  console.log(`Markdown：${report.reportPath ?? ""}`);
  console.log(`JSON：${report.reportJsonPath ?? ""}`);
  await openTaskReportUi(config, report);
}
