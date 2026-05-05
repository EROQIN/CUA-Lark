import { access } from "node:fs/promises";
import path from "node:path";
import type { NativeGuiTurnResult, NativeTaskReport } from "../core/types.js";
import { toPosixPath, writeTextFile } from "../utils/file.js";

export class ReportGenerator {
  constructor(private readonly runDir: string) {}

  async generateTask(report: NativeTaskReport): Promise<NativeTaskReport> {
    const reportPath = path.join(this.runDir, "report.md");
    const reportJsonPath = path.join(this.runDir, "report.json");
    const reportHtmlPath = path.join(this.runDir, "index.html");
    const enrichedReport: NativeTaskReport = {
      ...report,
      actionCount: report.actionCount ?? countExecutableActions(report),
      reportPath,
      reportJsonPath,
      reportHtmlPath
    };
    await writeTextFile(reportPath, this.renderTaskMarkdown(enrichedReport));
    await writeTextFile(reportJsonPath, JSON.stringify(enrichedReport, null, 2));
    await writeTextFile(reportHtmlPath, this.renderTaskHtml(enrichedReport));
    await this.ensureHistoryDashboardFallback();
    return enrichedReport;
  }

  private async ensureHistoryDashboardFallback(): Promise<void> {
    const historyDashboardPath = path.join(path.dirname(this.runDir), "evaluations", "history.html");
    if (await fileExists(historyDashboardPath)) {
      return;
    }
    await writeTextFile(historyDashboardPath, renderHistoryDashboardFallback());
  }

  private renderTaskMarkdown(report: NativeTaskReport): string {
    const timeline = applyTimelineTiming(buildTimeline(report.turnResults), report.durationMs);
    const lines: string[] = [
      `# CUA-Lark 单次任务报告：${report.taskName}`,
      "",
      "## 任务概览",
      "",
      `- 运行 ID：${report.runId ?? ""}`,
      `- 自然语言命令：${report.userPrompt || report.instruction}`,
      `- 识别产品：${formatProduct(report.product)}`,
      `- 解析目标：${report.parsedGoal}`,
      `- 最终状态：${formatFinalStatus(report.finalStatus)}`,
      `- 最大轮次：${report.maxTurns}`,
      `- 记录事件数：${report.totalTurns}`,
      `- 有效步骤数：${timeline.length}`,
      `- 动作数：${report.actionCount ?? ""}`,
      `- 开始时间：${report.startedAt}`,
      `- 结束时间：${report.endedAt}`,
      `- 总耗时：${formatDuration(report.durationMs)}`,
      `- 报告界面：${report.reportHtmlPath ?? ""}`,
      ""
    ];

    lines.push(
      "## 核心指标",
      "",
      "| 指标 | 数值 | 说明 |",
      "| --- | ---: | --- |",
      `| 总耗时 | ${formatDuration(report.durationMs)} | 从任务启动到最终状态的端到端耗时 |`,
      `| 有效步骤数 | ${timeline.length} | 已过滤空 running 事件后，可展示的截图/动作步骤 |`,
      `| 动作数 | ${report.actionCount ?? 0} | 不包含 finished() 结束动作 |`,
      `| 平均每步耗时 | ${formatDuration(averageDuration(report.durationMs, timeline.length))} | 总耗时 / 有效步骤数 |`,
      `| 平均每动作耗时 | ${formatDuration(averageDuration(report.durationMs, report.actionCount ?? 0))} | 总耗时 / 动作数 |`,
      ""
    );

    if (timeline.length) {
      lines.push("## 执行过程：截图 -> 思考 -> 执行", "");
      for (const [index, step] of timeline.entries()) {
        lines.push(...this.renderTimelineStep(step, index + 1));
      }
    } else {
      lines.push("## 执行过程", "", "没有捕获到可展示的有效步骤。", "");
    }

    lines.push(...this.renderRawEvents(report.turnResults));
    return `${lines.join("\n")}\n`;
  }

  private renderTaskHtml(report: NativeTaskReport): string {
    const timeline = applyTimelineTiming(buildTimeline(report.turnResults), report.durationMs);
    const historyDashboardPath = path.join(path.dirname(this.runDir), "evaluations", "history.html");
    const statusClass = report.finalStatus === "success" ? "ok" : report.finalStatus === "max_turns" ? "warn" : "bad";
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CUA-Lark 单次任务报告 ${escapeHtml(report.runId ?? "")}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7fb;
      --panel: #ffffff;
      --text: #172033;
      --muted: #667085;
      --line: #d9deea;
      --accent: #2563eb;
      --accent-soft: #eaf1ff;
      --ok: #0f8a5f;
      --ok-bg: #e7f7ef;
      --bad: #b42318;
      --bad-bg: #fff0ed;
      --warn: #a15c07;
      --warn-bg: #fff7d6;
      --shadow: 0 16px 44px rgba(22, 34, 67, 0.08);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 0; }
    .shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 36px; }
    .hero, .section, .metric, .step, .side-panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); }
    .hero { padding: 22px; margin-bottom: 16px; background: linear-gradient(135deg, #fff 0%, #f4f7ff 100%); }
    header { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
    h1 { margin: 0 0 10px; font-size: clamp(26px, 4vw, 42px); line-height: 1.08; letter-spacing: 0; }
    .meta, .subtle { color: var(--muted); font-size: 14px; line-height: 1.6; }
    .status { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 7px 11px; font-size: 13px; font-weight: 760; white-space: nowrap; }
    .status.ok { color: var(--ok); background: var(--ok-bg); }
    .status.bad { color: var(--bad); background: var(--bad-bg); }
    .status.warn { color: var(--warn); background: var(--warn-bg); }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
    a.button, button.button { border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--text); padding: 9px 12px; font: inherit; font-size: 13px; font-weight: 650; text-decoration: none; cursor: pointer; }
    a.button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .metric-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
    .metric { min-height: 98px; padding: 15px; }
    .metric .label { color: var(--muted); font-size: 12px; font-weight: 760; }
    .metric .value { margin-top: 12px; font-size: 28px; line-height: 1; font-weight: 780; font-variant-numeric: tabular-nums; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 310px; gap: 16px; align-items: start; }
    .section { overflow: hidden; }
    .section h2 { margin: 0; padding: 16px 18px; border-bottom: 1px solid var(--line); font-size: 17px; }
    .section-body { padding: 16px 18px; }
    .overview { display: grid; grid-template-columns: 128px minmax(0, 1fr); gap: 10px 14px; font-size: 13px; line-height: 1.55; }
    .overview dt { color: var(--muted); font-weight: 700; }
    .overview dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .step { margin-bottom: 14px; overflow: hidden; }
    .step-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding: 14px 16px; border-bottom: 1px solid var(--line); background: #fbfcff; }
    .step-title { font-size: 15px; font-weight: 780; }
    .step-meta { margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.5; }
    .step-time { color: var(--muted); font-size: 12px; text-align: right; line-height: 1.5; font-variant-numeric: tabular-nums; }
    .step-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 0.72fr); gap: 16px; padding: 16px; }
    .shot { border: 1px solid var(--line); border-radius: 8px; background: #f8fafc; overflow: hidden; }
    .shot img { display: block; width: 100%; height: auto; }
    .shot-empty { padding: 24px; color: var(--muted); font-size: 13px; }
    .phase { margin-bottom: 14px; }
    .phase h3 { margin: 0 0 8px; color: var(--muted); font-size: 12px; font-weight: 780; }
    .phase p, .phase li { margin: 0 0 7px; font-size: 13px; line-height: 1.55; }
    .phase ul { margin: 0; padding-left: 18px; }
    .raw details { border-top: 1px solid var(--line); padding: 12px 16px; }
    summary { cursor: pointer; color: var(--accent); font-size: 13px; font-weight: 650; }
    pre { margin: 10px 0 0; overflow: auto; border-radius: 8px; background: #101828; color: #e6edf7; padding: 12px; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .side-panel { padding: 16px; position: sticky; top: 16px; }
    .side-panel h2 { margin: 0 0 12px; font-size: 16px; }
    .side-panel a { color: var(--accent); text-decoration: none; font-weight: 650; }
    .side-list { display: grid; gap: 10px; }
    .side-link { display: flex; justify-content: space-between; gap: 10px; align-items: center; border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: #fbfcff; font-size: 13px; }
    .copy-state { min-height: 18px; margin-top: 10px; color: var(--muted); font-size: 12px; }
    @media (max-width: 900px) {
      header, .layout, .step-body { display: block; }
      .status { margin-top: 12px; }
      .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .side-panel { position: static; margin-top: 16px; }
      .step-time { text-align: left; margin-top: 8px; }
    }
    @media (max-width: 520px) {
      .shell { width: min(100% - 20px, 1180px); padding-top: 18px; }
      .metric-grid, .overview { grid-template-columns: 1fr; }
      h1 { font-size: 26px; }
    }
    @media print {
      body { background: #fff; }
      .actions, .side-panel, .raw { display: none; }
      .shell { width: 100%; padding: 0; }
      .hero, .section, .metric, .step { box-shadow: none; }
      .layout, .step-body { display: block; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <header>
        <div>
          <h1>单次任务报告</h1>
          <div class="meta">${escapeHtml(report.taskName)} · ${escapeHtml(report.runId ?? "")}</div>
          <div class="meta">${escapeHtml(report.userPrompt || report.instruction)}</div>
        </div>
        <span class="status ${statusClass}">${escapeHtml(formatFinalStatus(report.finalStatus))}</span>
      </header>
      <div class="actions">
        <a class="button primary" href="${escapeHtml(relativeUrl(this.runDir, historyDashboardPath))}">打开全量评测历史</a>
        <a class="button" href="report.md">查看 Markdown</a>
        <a class="button" href="report.md" download>导出 Markdown</a>
        <a class="button" href="report.json" download>导出 JSON</a>
        <button class="button" type="button" onclick="window.print()">打印 / 导出 PDF</button>
        <button class="button" type="button" data-copy-path="${escapeHtml(report.reportHtmlPath ?? "")}">复制报告路径</button>
      </div>
      <div class="copy-state" id="copyState"></div>
    </section>

    <section class="metric-grid" aria-label="核心指标">
      ${htmlMetric("总耗时", formatDuration(report.durationMs))}
      ${htmlMetric("有效步骤", String(timeline.length))}
      ${htmlMetric("动作数", String(report.actionCount ?? 0))}
      ${htmlMetric("平均每步", formatDuration(averageDuration(report.durationMs, timeline.length)))}
      ${htmlMetric("平均每动作", formatDuration(averageDuration(report.durationMs, report.actionCount ?? 0)))}
    </section>

    <div class="layout">
      <div>
        <section class="section">
          <h2>任务概览</h2>
          <div class="section-body">
            <dl class="overview">
              ${overviewRow("识别产品", formatProduct(report.product))}
              ${overviewRow("解析目标", report.parsedGoal)}
              ${overviewRow("最大轮次", String(report.maxTurns))}
              ${overviewRow("记录事件", String(report.totalTurns))}
              ${overviewRow("开始时间", report.startedAt)}
              ${overviewRow("结束时间", report.endedAt)}
            </dl>
          </div>
        </section>

        <section class="section" style="margin-top:16px;">
          <h2>执行过程：截图 -> 思考 -> 执行</h2>
          <div class="section-body">
            ${timeline.length ? timeline.map((step, index) => this.renderTimelineStepHtml(step, index + 1)).join("") : '<div class="subtle">没有捕获到可展示的有效步骤。</div>'}
          </div>
        </section>
      </div>

      <aside class="side-panel">
        <h2>导出与跳转</h2>
        <div class="side-list">
          <a class="side-link" href="${escapeHtml(relativeUrl(this.runDir, historyDashboardPath))}"><span>全量评测历史</span><span>打开</span></a>
          <a class="side-link" href="report.md" download><span>Markdown 报告</span><span>导出</span></a>
          <a class="side-link" href="report.json" download><span>结构化 JSON</span><span>导出</span></a>
          <a class="side-link" href="screenshots/"><span>截图目录</span><span>查看</span></a>
        </div>
        <p class="subtle" style="margin:14px 0 0;">这个页面是单次任务复盘入口；全量历史看板固定展示当前 runs 下所有可读取用例。</p>
      </aside>
    </div>
  </main>
  <script>
    const copyButton = document.querySelector("[data-copy-path]");
    const copyState = document.getElementById("copyState");
    copyButton?.addEventListener("click", async () => {
      const value = copyButton.getAttribute("data-copy-path") || location.href;
      try {
        await navigator.clipboard.writeText(value);
        copyState.textContent = "已复制报告路径。";
      } catch {
        copyState.textContent = value;
      }
    });
  </script>
</body>
</html>`;
  }

  private renderTimelineStepHtml(step: TimelineStep, displayIndex: number): string {
    const screenshot = step.screenshotTurn?.screenshotPath
      ? `<div class="shot"><img src="${escapeHtml(relativeUrl(this.runDir, step.screenshotTurn.screenshotPath))}" alt="步骤 ${displayIndex} 截图"></div>`
      : '<div class="shot"><div class="shot-empty">本步骤没有捕获到截图。</div></div>';
    const thoughts = step.actions.flatMap((action) => (action.thought ? [action.thought] : []));
    const thoughtHtml = thoughts.length
      ? `<ul>${thoughts.map((thought) => `<li>${escapeHtml(thought)}</li>`).join("")}</ul>`
      : `<p>${escapeHtml(extractThoughtText(step.actionTurn.prediction ?? "") || "没有捕获到模型思考文本。")}</p>`;
    const actions = step.actions.length
      ? `<ul>${step.actions.map((action) => `<li>${escapeHtml(formatAction(action))}</li>`).join("")}</ul>`
      : "<p>未解析到结构化动作。</p>";
    const raw = [
      step.actionTurn.prediction ? `<pre>${escapeHtml(step.actionTurn.prediction)}</pre>` : "",
      step.actionTurn.parsedPrediction !== undefined ? `<pre>${escapeHtml(JSON.stringify(step.actionTurn.parsedPrediction, null, 2))}</pre>` : ""
    ]
      .filter(Boolean)
      .join("");

    return `<article class="step">
      <div class="step-head">
        <div>
          <div class="step-title">步骤 ${displayIndex}：${escapeHtml(formatActionTitle(step.actions))}</div>
          <div class="step-meta">${escapeHtml(step.screenshotTurn ? `截图 Turn ${step.screenshotTurn.turn} -> 动作 Turn ${step.actionTurn.turn}` : `动作 Turn ${step.actionTurn.turn}`)} · ${escapeHtml(formatTurnStatus(step.actionTurn.status))}</div>
        </div>
        <div class="step-time">
          <div>步骤耗时：${escapeHtml(formatStepDuration(step))}</div>
          <div>累计耗时：${escapeHtml(formatStepCumulative(step))}</div>
        </div>
      </div>
      <div class="step-body">
        ${screenshot}
        <div>
          <div class="phase"><h3>1. 模型思考</h3>${thoughtHtml}</div>
          <div class="phase"><h3>2. 执行动作</h3>${actions}</div>
          ${step.actionTurn.error ? `<div class="phase"><h3>错误</h3><p>${escapeHtml(step.actionTurn.error)}</p></div>` : ""}
        </div>
      </div>
      ${raw ? `<div class="raw"><details><summary>原始模型输出与结构化动作</summary>${raw}</details></div>` : ""}
    </article>`;
  }

  private renderTimelineStep(step: TimelineStep, displayIndex: number): string[] {
    const lines: string[] = [
      `### 步骤 ${displayIndex}：${formatActionTitle(step.actions)}`,
      "",
      `- 状态：${formatTurnStatus(step.actionTurn.status)}`,
      `- 来源事件：${step.screenshotTurn ? `截图 Turn ${step.screenshotTurn.turn} -> ` : ""}动作 Turn ${step.actionTurn.turn}`,
      `- 步骤耗时：${formatStepDuration(step)}`,
      `- 累计耗时：${formatStepCumulative(step)}`
    ];
    if (step.actionTurn.error) {
      lines.push(`- 错误：${step.actionTurn.error}`);
    }
    lines.push("");

    if (step.screenshotTurn?.screenshotPath) {
      const screenshotPath = toPosixPath(path.relative(this.runDir, step.screenshotTurn.screenshotPath));
      lines.push("**1. 执行前截图**", "", `![步骤 ${displayIndex} 截图](${screenshotPath})`, "");
      if (step.screenshotTurn.screenshotSize) {
        lines.push(
          `截图尺寸：${step.screenshotTurn.screenshotSize.width}x${step.screenshotTurn.screenshotSize.height}，缩放：${step.screenshotTurn.scaleFactor ?? ""}`,
          ""
        );
      }
    } else {
      lines.push("**1. 执行前截图**", "", "本步骤没有捕获到截图。", "");
    }

    lines.push("**2. 模型思考**", "");
    const thoughts = step.actions.map((action) => action.thought).filter(Boolean);
    if (thoughts.length) {
      lines.push(...thoughts.map((thought) => `- ${thought}`), "");
    } else if (step.actionTurn.prediction) {
      lines.push("```text", extractThoughtText(step.actionTurn.prediction) || step.actionTurn.prediction, "```", "");
    } else {
      lines.push("没有捕获到模型思考文本。", "");
    }

    lines.push("**3. 执行动作**", "");
    if (step.actions.length) {
      lines.push(...step.actions.map((action) => `- ${formatAction(action)}`), "");
    } else {
      lines.push("- 未解析到结构化动作。", "");
    }

    if (step.actionTurn.prediction || step.actionTurn.parsedPrediction !== undefined) {
      lines.push("<details><summary>原始模型输出与结构化动作</summary>", "");
      if (step.actionTurn.prediction) {
        lines.push("```text", step.actionTurn.prediction, "```", "");
      }
      if (step.actionTurn.parsedPrediction !== undefined) {
        lines.push("```json", JSON.stringify(step.actionTurn.parsedPrediction, null, 2), "```", "");
      }
      lines.push("</details>", "");
    }

    return lines;
  }

  private renderRawEvents(turns: NativeGuiTurnResult[]): string[] {
    const meaningfulTurns = turns.filter(hasMeaningfulTurnContent);
    const hiddenCount = turns.length - meaningfulTurns.length;
    const lines = [
      "## 调试附录",
      "",
      `<details><summary>原始事件记录（隐藏 ${hiddenCount} 条空 running 事件）</summary>`,
      ""
    ];

    for (const turn of meaningfulTurns) {
      const screenshotPath = turn.screenshotPath ? toPosixPath(path.relative(this.runDir, turn.screenshotPath)) : "";
      lines.push(
        `### Turn ${turn.turn}: ${formatTurnStatus(turn.status)}`,
        "",
        ...compactBullets([
          ["状态", formatTurnStatus(turn.status)],
          ["截图", screenshotPath],
          ["截图尺寸", turn.screenshotSize ? `${turn.screenshotSize.width}x${turn.screenshotSize.height}` : ""],
          ["缩放", turn.scaleFactor?.toString() ?? ""],
          ["累计耗时", turn.elapsedMs === undefined ? "" : formatDuration(turn.elapsedMs)],
          ["耗时", turn.durationMs ? formatDuration(turn.durationMs) : ""],
          ["错误", turn.error ?? ""]
        ]),
        ""
      );

      if (turn.prediction) {
        lines.push("```text", turn.prediction, "```", "");
      }

      if (turn.parsedPrediction !== undefined) {
        lines.push("```json", JSON.stringify(turn.parsedPrediction, null, 2), "```", "");
      }
    }

    lines.push("</details>", "");
    return lines;
  }
}

interface TimelineStep {
  screenshotTurn?: NativeGuiTurnResult;
  actionTurn: NativeGuiTurnResult;
  actions: ParsedAction[];
  durationMs?: number;
  cumulativeMs?: number;
  timingEstimated?: boolean;
}

interface ParsedAction {
  thought?: string;
  reflection?: string;
  actionType?: string;
  actionInputs?: Record<string, unknown>;
}

function buildTimeline(turns: NativeGuiTurnResult[]): TimelineStep[] {
  const steps: TimelineStep[] = [];
  let pendingScreenshot: NativeGuiTurnResult | undefined;

  for (const turn of turns) {
    if (turn.screenshotPath) {
      pendingScreenshot = turn;
    }
    if (turn.prediction || turn.parsedPrediction !== undefined || turn.error) {
      steps.push({
        screenshotTurn: pendingScreenshot,
        actionTurn: turn,
        actions: extractParsedActions(turn.parsedPrediction)
      });
      pendingScreenshot = undefined;
    }
  }

  return steps;
}

function applyTimelineTiming(steps: TimelineStep[], reportDurationMs: number): TimelineStep[] {
  if (!steps.length) {
    return steps;
  }

  const hasRecordedTiming = steps.some((step) => step.screenshotTurn?.durationMs !== undefined || step.actionTurn.durationMs !== undefined);
  if (!hasRecordedTiming) {
    const estimated = averageDuration(reportDurationMs, steps.length);
    let cumulativeMs = 0;
    return steps.map((step) => {
      cumulativeMs += estimated;
      return {
        ...step,
        durationMs: estimated,
        cumulativeMs,
        timingEstimated: true
      };
    });
  }

  let cumulativeMs = 0;
  return steps.map((step) => {
    const durationMs = sumNumbers([step.screenshotTurn?.durationMs, step.actionTurn.durationMs]);
    cumulativeMs = Math.max(cumulativeMs + durationMs, step.actionTurn.elapsedMs ?? 0);
    return {
      ...step,
      durationMs,
      cumulativeMs,
      timingEstimated: false
    };
  });
}

function hasMeaningfulTurnContent(turn: NativeGuiTurnResult): boolean {
  return Boolean(turn.screenshotPath || turn.prediction || turn.parsedPrediction !== undefined || turn.error || turn.status !== "running");
}

function countExecutableActions(report: NativeTaskReport): number {
  return report.turnResults
    .flatMap((turn) => extractActionTypes(turn.parsedPrediction))
    .filter((actionType) => actionType !== "finished").length;
}

function extractParsedActions(value: unknown): ParsedAction[] {
  if (Array.isArray(value)) {
    return value.flatMap(extractParsedActions);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const record = value as Record<string, unknown>;
  const action = typeof record.action_type === "string" ? [normalizeAction(record)] : [];
  const nested = Object.values(record).flatMap(extractParsedActions);
  return [...action, ...nested];
}

function normalizeAction(record: Record<string, unknown>): ParsedAction {
  return {
    thought: typeof record.thought === "string" ? record.thought : undefined,
    reflection: typeof record.reflection === "string" ? record.reflection : undefined,
    actionType: typeof record.action_type === "string" ? record.action_type : undefined,
    actionInputs: isRecord(record.action_inputs) ? record.action_inputs : undefined
  };
}

function formatActionTitle(actions: ParsedAction[]): string {
  const primary = actions.find((action) => action.actionType)?.actionType;
  return primary ? formatActionType(primary) : "观察与判断";
}

function formatAction(action: ParsedAction): string {
  const inputs = action.actionInputs ? formatActionInputs(action.actionInputs) : "";
  return `${formatActionType(action.actionType ?? "unknown")}${inputs ? `：${inputs}` : ""}`;
}

function formatActionInputs(inputs: Record<string, unknown>): string {
  if (!Object.keys(inputs).length) {
    return "";
  }
  if (typeof inputs.content === "string") {
    return `输入 ${JSON.stringify(inputs.content)}`;
  }
  if (typeof inputs.key === "string") {
    return `按下 ${inputs.key}`;
  }
  if (typeof inputs.start_box === "string") {
    return `点击区域 ${inputs.start_box}`;
  }
  if (typeof inputs.direction === "string") {
    return `滚动 ${inputs.direction}`;
  }
  const compact = JSON.stringify(inputs);
  return compact.length > 160 ? `${compact.slice(0, 160)}...` : compact;
}

function formatActionType(actionType: string): string {
  const labels: Record<string, string> = {
    click: "点击",
    type: "输入",
    hotkey: "快捷键",
    scroll: "滚动",
    drag: "拖拽",
    wait: "等待",
    finished: "完成",
    unknown: "未知动作"
  };
  return labels[actionType] ?? actionType;
}

function extractThoughtText(prediction: string): string {
  return prediction.match(/Thought:\s*([\s\S]*?)(?:\nAction:|$)/)?.[1]?.trim() ?? "";
}

function formatProduct(product: string): string {
  const labels: Record<string, string> = {
    auto: "自动识别",
    im: "IM 即时通讯",
    docs: "云文档",
    calendar: "日历",
    base: "多维表格",
    vc: "视频会议",
    mail: "邮箱"
  };
  return labels[product] ?? product;
}

function formatFinalStatus(status: string): string {
  const labels: Record<string, string> = {
    success: "成功",
    failed: "失败",
    max_turns: "达到最大轮次"
  };
  return labels[status] ?? status;
}

function formatStepDuration(step: TimelineStep): string {
  const value = step.durationMs ?? 0;
  return `${step.timingEstimated ? "约 " : ""}${formatDuration(value)}`;
}

function formatStepCumulative(step: TimelineStep): string {
  const value = step.cumulativeMs ?? step.actionTurn.elapsedMs ?? 0;
  return `${step.timingEstimated ? "约 " : ""}${formatDuration(value)}`;
}

function compactBullets(items: Array<[string, string]>): string[] {
  return items.filter(([, value]) => value !== "").map(([label, value]) => `- ${label}：${value}`);
}

function htmlMetric(label: string, value: string): string {
  return `<article class="metric"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></article>`;
}

function overviewRow(label: string, value: string): string {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}

function formatTurnStatus(status: string): string {
  const labels: Record<string, string> = {
    running: "运行中",
    end: "结束",
    error: "错误",
    max_loop: "达到最大轮次"
  };
  return labels[status] ?? status;
}

function formatDuration(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0ms";
  }
  if (value >= 1000) {
    return `${Math.round(value / 100) / 10}s`;
  }
  return `${value}ms`;
}

function averageDuration(totalMs: number, count: number): number {
  return count > 0 ? Math.round(totalMs / count) : 0;
}

function sumNumbers(values: Array<number | undefined>): number {
  let total = 0;
  for (const value of values) {
    total += value ?? 0;
  }
  return total;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function relativeUrl(fromDir: string, filePath: string): string {
  return toPosixPath(path.relative(fromDir, filePath));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function renderHistoryDashboardFallback(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CUA-Lark 全量评测历史</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7fb; color: #182033; }
    main { width: min(640px, calc(100% - 32px)); padding: 24px; border: 1px solid #d9deea; border-radius: 8px; background: #fff; box-shadow: 0 16px 44px rgba(22, 34, 67, 0.08); }
    h1 { margin: 0 0 10px; font-size: 24px; letter-spacing: 0; }
    p { margin: 0 0 14px; color: #667085; line-height: 1.6; }
    code { display: block; margin-top: 12px; border-radius: 8px; background: #101828; color: #e6edf7; padding: 12px; font: 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  </style>
</head>
<body>
  <main>
    <h1>还没有全量评测历史</h1>
    <p>单次任务报告已经生成。要让这里展示所有可读取用例，请先刷新一次离线全量汇总。</p>
    <code>pnpm eval:offline</code>
  </main>
</body>
</html>`;
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
