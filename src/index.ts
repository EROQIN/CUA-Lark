import { loadConfig } from "./config/env.js";
import { CUALarkAgent } from "./core/agent.js";
import { createCustomTask, createDocsDemoTask, createImDemoTask, createVcDemoTask } from "./tasks/task-factory.js";

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "task";
  const config = loadConfig();
  const agent = new CUALarkAgent(config);

  if (mode === "demo:vc" || mode === "demo:gui:vc") {
    const task = createVcDemoTask(config);
    const report = await agent.runTask(task);
    console.log(`${task.name} finished. Report: ${report.reportPath}`);
    return;
  }

  if (mode === "demo:im") {
    const task = createImDemoTask(config);
    const report = await agent.runTask(task);
    console.log(`${task.name} finished. Report: ${report.reportPath}`);
    return;
  }

  if (mode === "demo:docs") {
    const task = createDocsDemoTask(config);
    const report = await agent.runTask(task);
    console.log(`${task.name} finished. Report: ${report.reportPath}`);
    return;
  }

  if (mode === "task" || mode === "task:gui") {
    const userPrompt = process.argv.slice(3).join(" ").trim();
    if (!userPrompt) {
      throw new Error('Usage: pnpm task "自然语言测试指令"');
    }
    const task = createCustomTask(config, userPrompt);
    const report = await agent.runTask(task);
    console.log(`${task.name} finished. Report: ${report.reportPath}`);
    return;
  }

  const task = createCustomTask(config, process.argv.slice(2).join(" ").trim());
  const report = await agent.runTask(task);
  console.log(`${task.name} finished. Report: ${report.reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
