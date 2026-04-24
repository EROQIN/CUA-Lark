import { CUALarkAgent } from "./core/agent.js";
import { manualPositionDemoScenario, vlmGroundingDemoScenario } from "./scenarios/single-step-demo.js";
import { loadConfig } from "./config/env.js";
import { createM2ImDemoTask } from "./tasks/im-demo.js";

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "manual";
  const config = loadConfig();
  const agent = new CUALarkAgent(config);

  if (mode === "m2:im") {
    const task = createM2ImDemoTask(config);
    const report = await agent.runTask(task);
    console.log(`${task.name} finished. Report: ${report.reportPath}`);
    return;
  }

  const scenario = mode === "vlm" ? vlmGroundingDemoScenario : manualPositionDemoScenario;
  const report = await agent.runScenario(scenario);
  console.log(`${scenario.name} finished. Report: ${report.reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
