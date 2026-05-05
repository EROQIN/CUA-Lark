import path from "node:path";
import { pathToFileURL } from "node:url";
import type { EvalCaseResult, EvalSummary } from "./types.js";
import { ensureDir, toPosixPath, writeTextFile } from "../utils/file.js";

export async function writeEvaluationArtifacts(summary: EvalSummary, outputDir: string): Promise<EvalSummary> {
  await ensureDir(outputDir);
  const summaryJsonPath = path.join(outputDir, "summary.json");
  const summaryMarkdownPath = path.join(outputDir, "summary.md");
  const dashboardPath = path.join(outputDir, "index.html");
  const latestDashboardPath = path.join(path.dirname(outputDir), "latest.html");
  const historyDashboardPath = path.join(path.dirname(outputDir), "history.html");
  const dashboardUrl = pathToFileURL(dashboardPath).href;
  const latestDashboardUrl = pathToFileURL(latestDashboardPath).href;
  const historyDashboardUrl = pathToFileURL(historyDashboardPath).href;
  const enriched: EvalSummary = {
    ...summary,
    artifacts: {
      summaryJsonPath,
      summaryMarkdownPath,
      dashboardPath,
      dashboardUrl,
      latestDashboardPath,
      latestDashboardUrl,
      historyDashboardPath,
      historyDashboardUrl
    }
  };

  await writeTextFile(summaryJsonPath, JSON.stringify(enriched, null, 2));
  await writeTextFile(summaryMarkdownPath, renderSummaryMarkdown(enriched));
  await writeTextFile(dashboardPath, renderDashboardHtml(enriched, outputDir));
  await writeTextFile(latestDashboardPath, renderLatestDashboardRedirect(enriched));
  if (summary.mode === "offline") {
    await writeTextFile(historyDashboardPath, renderHistoryDashboardRedirect(enriched));
  }
  return enriched;
}

function renderSummaryMarkdown(summary: EvalSummary): string {
  const lines = [
    `# CUA-Lark 评测报告：${summary.evalRunId}`,
    "",
    `评测模式：${formatMode(summary.mode)}`,
    `开始时间：${summary.startedAt}`,
    `结束时间：${summary.endedAt}`,
    `看板链接：${summary.artifacts?.dashboardUrl ?? ""}`,
    `最新看板：${summary.artifacts?.latestDashboardUrl ?? ""}`,
    `全量历史：${summary.artifacts?.historyDashboardUrl ?? ""}`,
    "",
    "## 总览",
    "",
    `- 用例总数：${summary.totals.caseCount}`,
    `- 通过用例：${summary.totals.passed}`,
    `- 失败用例：${summary.totals.failed}`,
    `- 成功率：${summary.totals.successRate}%`,
    `- 总耗时：${formatDuration(summary.totals.totalDurationMs)}`,
    `- 总轮次：${summary.totals.totalTurns}`,
    `- 总动作数：${summary.totals.totalActions}`,
    `- 平均耗时：${formatDuration(summary.totals.avgDurationMs)}`,
    `- 平均轮次：${summary.totals.avgTurns}`,
    `- 平均动作数：${summary.totals.avgActions}`,
    "",
    "## 进阶能力",
    "",
    `- Workflow 用例数：${summary.totals.advanced.workflowCaseCount}`,
    `- 跨产品用例数：${summary.totals.advanced.crossProductCaseCount}`,
    `- 阶段通过率：${summary.totals.advanced.workflowPhasePassRate}%`,
    `- 自愈重试次数：${summary.totals.advanced.recoveryCount}`,
    `- 异常/进阶事件数：${summary.totals.advanced.advancedEventCount}`,
    "",
    "## 按产品统计",
    "",
    "| 产品 | 用例数 | 通过 | 失败 | 成功率 | 平均耗时 | 平均轮次 | 平均动作数 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(summary.byProduct).map(
      ([product, metric]) =>
        `| ${formatProduct(product)} | ${metric.caseCount} | ${metric.passed} | ${metric.failed} | ${metric.successRate}% | ${formatDuration(metric.avgDurationMs)} | ${metric.avgTurns} | ${metric.avgActions} |`
    ),
    "",
    "## 用例明细",
    "",
    "| 用例 | 产品 | 产品链路 | 阶段 | 自愈 | 结果 | 最终状态 | 耗时 | 轮次 | 动作数 | 失败原因 | 原始报告 |",
    "| --- | --- | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | --- | --- |",
    ...summary.cases.map((item) => {
      const cells = [
        markdownCell(`${item.caseId} ${item.title}`),
        formatProduct(item.product),
        markdownCell(formatProductTrail(item.productTrail)),
        String(item.workflowPhaseCount ?? ""),
        String(item.recoveryCount ?? ""),
        item.passed ? "通过" : "失败",
        formatFinalStatus(item.finalStatus),
        formatDuration(item.durationMs),
        String(item.turnCount),
        String(item.actionCount),
        markdownCell(item.failureReason),
        item.reportHtmlPath ? markdownCell(item.reportHtmlPath) : item.reportPath ? markdownCell(item.reportPath) : ""
      ];
      return `| ${cells.join(" | ")} |`;
    })
  ];

  return `${lines.join("\n")}\n`;
}

function renderLatestDashboardRedirect(summary: EvalSummary): string {
  return renderDashboardRedirectPage({
    title: "打开最新 CUA-Lark 评测看板",
    heading: "正在打开最新评测看板",
    description: "这个入口始终指向最近一次评测，可能是单条自然语言测试或批量评测。",
    dashboardUrl: summary.artifacts?.dashboardUrl ?? ""
  });
}

function renderHistoryDashboardRedirect(summary: EvalSummary): string {
  return renderDashboardRedirectPage({
    title: "打开 CUA-Lark 全量评测历史",
    heading: "正在打开全量评测历史",
    description: "这个入口固定指向最近一次离线全量汇总，看板会展示当前 runs 下所有可读取用例。",
    dashboardUrl: summary.artifacts?.dashboardUrl ?? ""
  });
}

function renderDashboardRedirectPage(input: {
  title: string;
  heading: string;
  description: string;
  dashboardUrl: string;
}): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=${escapeHtml(input.dashboardUrl)}">
  <title>${escapeHtml(input.title)}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7fb; color: #182033; }
    main { width: min(560px, calc(100% - 32px)); padding: 24px; border: 1px solid #d9deea; border-radius: 8px; background: #fff; box-shadow: 0 16px 44px rgba(22, 34, 67, 0.08); }
    h1 { margin: 0 0 10px; font-size: 22px; letter-spacing: 0; }
    p { margin: 0 0 16px; color: #667085; line-height: 1.6; }
    a { color: #2563eb; font-weight: 650; text-decoration: none; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(input.heading)}</h1>
    <p>${escapeHtml(input.description)}</p>
    <p>如果浏览器没有自动跳转，请点击下面的链接。</p>
    <a href="${escapeHtml(input.dashboardUrl)}">${escapeHtml(input.dashboardUrl)}</a>
  </main>
</body>
</html>`;
}

function renderDashboardHtml(summary: EvalSummary, outputDir: string): string {
  const productFilters = renderProductFilters(summary);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CUA-Lark 评测报告 ${escapeHtml(summary.evalRunId)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7fb;
      --panel: #ffffff;
      --text: #182033;
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
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    .shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 36px; }
    .hero {
      background: linear-gradient(135deg, #ffffff 0%, #f4f7ff 100%);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 22px;
      margin-bottom: 16px;
    }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
    h1 { margin: 0 0 8px; font-size: clamp(28px, 4vw, 44px); line-height: 1.05; letter-spacing: 0; }
    .meta { color: var(--muted); font-size: 14px; line-height: 1.6; }
    .mode { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; padding: 9px 12px; font-size: 13px; color: var(--muted); white-space: nowrap; }
    .notice {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      border: 1px solid ${summary.totals.failed ? "var(--bad-bg)" : "var(--ok-bg)"};
      background: ${summary.totals.failed ? "#fff9f7" : "#f6fffb"};
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 14px;
    }
    .notice strong { color: ${summary.totals.failed ? "var(--bad)" : "var(--ok)"}; }
    .artifact-links { display: flex; flex-wrap: wrap; gap: 10px; }
    .artifact-links a { border: 1px solid var(--line); border-radius: 8px; padding: 6px 9px; background: #fff; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
    .card, .section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); }
    .card { padding: 16px; min-height: 108px; }
    .label { color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: 0; }
    .value { margin-top: 14px; font-size: 30px; line-height: 1; font-weight: 760; }
    .value.ok { color: var(--ok); }
    .value.bad { color: var(--bad); }
    .section { margin-top: 16px; overflow: hidden; }
    .section h2 { margin: 0; padding: 16px 18px; font-size: 17px; border-bottom: 1px solid var(--line); }
    .section-body { padding: 16px 18px; }
    .workflow { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .advanced-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
    .advanced-card { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fbfcff; min-height: 92px; }
    .advanced-card strong { display: block; margin-top: 12px; font-size: 24px; line-height: 1; }
    .event-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .event-pill { border: 1px solid var(--line); border-radius: 999px; padding: 5px 9px; background: #fff; color: var(--muted); font-size: 12px; }
    .flow-step { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fbfcff; min-height: 100px; }
    .flow-index { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-weight: 760; font-size: 13px; margin-bottom: 10px; }
    .flow-title { font-size: 14px; font-weight: 760; margin-bottom: 6px; }
    .flow-text { color: var(--muted); font-size: 13px; line-height: 1.5; }
    .product-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .product-item { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fff; }
    .product-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 12px; }
    .product-name { font-weight: 760; font-size: 14px; }
    .product-rate { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
    .bar-track { height: 10px; background: #edf1f7; border-radius: 999px; overflow: hidden; }
    .bar-fill { height: 100%; background: linear-gradient(90deg, var(--ok), #41b883); border-radius: inherit; }
    .product-foot { display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; margin-top: 10px; }
    .launcher { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr); gap: 14px; align-items: stretch; }
    .launcher-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .control { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: #fbfcff; }
    .control label { display: block; color: var(--muted); font-size: 12px; font-weight: 700; margin-bottom: 8px; }
    .control select, .control input[type="number"] { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; font: inherit; font-size: 13px; background: #fff; color: var(--text); }
    .check-row { display: flex; align-items: center; gap: 8px; min-height: 35px; font-size: 13px; color: var(--text); }
    .command-box { border: 1px solid var(--line); border-radius: 8px; background: #101828; color: #e6edf7; padding: 14px; min-height: 100%; display: flex; flex-direction: column; gap: 12px; }
    .command-box label { color: #98a2b3; font-size: 12px; font-weight: 700; }
    .command-output { width: 100%; min-height: 94px; resize: vertical; border: 1px solid #344054; border-radius: 8px; background: #0b1220; color: #e6edf7; font: 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; line-height: 1.45; padding: 10px; }
    .copy-command { align-self: flex-start; border: 1px solid #5b75f0; border-radius: 8px; background: #3147c6; color: #fff; padding: 9px 12px; font: inherit; font-size: 13px; cursor: pointer; }
    .hint { color: var(--muted); font-size: 12px; line-height: 1.5; margin-top: 10px; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--line); background: #fbfcff; }
    .search { min-width: min(360px, 100%); flex: 1; }
    .search input { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; font: inherit; font-size: 13px; color: var(--text); background: #fff; }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    button.filter { border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--muted); padding: 8px 10px; font: inherit; font-size: 12px; cursor: pointer; }
    button.filter.active { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .case-count { color: var(--muted); font-size: 12px; padding: 0 18px 12px; background: #fbfcff; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px 14px; border-bottom: 1px solid var(--line); text-align: left; font-size: 13px; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; font-weight: 760; background: #fbfcff; }
    tr:last-child td { border-bottom: 0; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .status { display: inline-flex; align-items: center; min-width: 58px; justify-content: center; border-radius: 999px; padding: 4px 8px; font-size: 12px; font-weight: 760; }
    .pass { color: var(--ok); background: var(--ok-bg); }
    .fail { color: var(--bad); background: var(--bad-bg); }
    .reason { color: var(--muted); max-width: 320px; line-height: 1.45; }
    .is-hidden { display: none; }
    a { color: var(--accent); text-decoration: none; font-weight: 650; }
    a:hover { text-decoration: underline; }
    .empty { padding: 16px 18px; color: var(--muted); font-size: 14px; }
    @media (max-width: 780px) {
      header { display: block; }
      .mode { display: inline-flex; margin-top: 12px; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .workflow, .advanced-grid, .product-list { grid-template-columns: 1fr; }
      .launcher, .launcher-controls { grid-template-columns: 1fr; }
      .toolbar { display: block; }
      .filters { justify-content: flex-start; margin-top: 10px; }
      .section { overflow-x: auto; }
      table { min-width: 760px; }
    }
    @media (max-width: 480px) {
      .shell { width: min(100% - 20px, 1180px); padding-top: 18px; }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <header>
        <div>
          <h1>CUA-Lark 测试控制台</h1>
          <div class="meta">M4 评估体系 · 结构化报告、规则校验、成功率、耗时和步骤数自动统计</div>
          <div class="meta">评测批次 ${escapeHtml(summary.evalRunId)} · ${escapeHtml(summary.startedAt)} 至 ${escapeHtml(summary.endedAt)}</div>
        </div>
        <div class="mode">评测模式：${escapeHtml(formatMode(summary.mode))}</div>
      </header>
      <div class="notice">
        <div><strong>${summary.totals.failed ? "评测已完成，存在失败用例" : "评测已完成，全部通过"}</strong> · 成功率 ${summary.totals.successRate}% · ${summary.totals.passed}/${summary.totals.caseCount} 通过</div>
        ${renderArtifactLinks(summary, outputDir)}
      </div>
    </section>

    <section class="grid" aria-label="评测总览">
      ${metricCard("用例总数", String(summary.totals.caseCount))}
      ${metricCard("成功率", `${summary.totals.successRate}%`, summary.totals.failed ? "bad" : "ok")}
      ${metricCard("通过 / 失败", `${summary.totals.passed} / ${summary.totals.failed}`)}
      ${metricCard("总耗时", formatDuration(summary.totals.totalDurationMs))}
      ${metricCard("平均耗时", formatDuration(summary.totals.avgDurationMs))}
      ${metricCard("总轮次", String(summary.totals.totalTurns))}
      ${metricCard("平均轮次", String(summary.totals.avgTurns))}
      ${metricCard("总动作数", String(summary.totals.totalActions))}
      ${metricCard("平均动作数", String(summary.totals.avgActions))}
    </section>

    <section class="section">
      <h2>测试启动器</h2>
      <div class="section-body">
        <div class="launcher">
          <div>
            <div class="launcher-controls">
              <div class="control">
                <label for="launchMode">评测模式</label>
                <select id="launchMode">
                  <option value="online">在线执行真实飞书用例</option>
                  <option value="offline">离线汇总历史 runs</option>
                </select>
              </div>
              <div class="control">
                <label for="launchMaxCases">最多执行用例数</label>
                <input id="launchMaxCases" type="number" min="1" step="1" placeholder="不填表示全部">
              </div>
              <div class="control">
                <label>安全设置</label>
                <div class="check-row"><input id="launchSafeIm" type="checkbox"> <span>IM 用例使用草稿模式，不发送真实消息</span></div>
              </div>
              <div class="control">
                <label>高级校验</label>
                <div class="check-row"><input id="launchVlm" type="checkbox"> <span>启用 VLM 语义复核</span></div>
                <div class="check-row"><input id="launchStop" type="checkbox"> <span>遇到失败立即停止</span></div>
              </div>
            </div>
            <div class="hint">默认按测试账号真实闭环执行，会发送测试消息、保存预约等；浏览器静态页面不能直接启动本机命令，这里生成可复制命令，用于终端或演示脚本执行。</div>
          </div>
          <div class="command-box">
            <label for="launchCommand">生成命令</label>
            <textarea id="launchCommand" class="command-output" readonly></textarea>
            <button id="copyLaunchCommand" class="copy-command" type="button">复制命令</button>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>执行流程</h2>
      <div class="section-body">
        <div class="workflow">
          ${workflowStep(1, "加载用例", "读取 M4 smoke case 或历史 runs，形成统一评测输入。")}
          ${workflowStep(2, "执行任务", "在线模式调用 UI-TARS 操作飞书，离线模式复用已有报告。")}
          ${workflowStep(3, "规则校验", "检查最终状态、耗时、轮次、关键文本和动作类型。")}
          ${workflowStep(4, "生成报告", "输出 summary.json、summary.md 和当前可视化看板。")}
        </div>
      </div>
    </section>

    <section class="section">
      <h2>进阶能力</h2>
      <div class="section-body">
        ${renderAdvancedMetrics(summary)}
      </div>
    </section>

    <section class="section">
      <h2>按产品统计</h2>
      <div class="section-body">${renderProductVisuals(summary)}</div>
      ${renderProductTable(summary)}
    </section>

    <section class="section">
      <h2>失败原因分布</h2>
      ${renderFailureReasons(summary)}
    </section>

    <section class="section">
      <h2>用例明细</h2>
      <div class="toolbar">
        <div class="search"><input id="caseSearch" type="search" placeholder="搜索用例、产品或失败原因"></div>
        <div class="filters" aria-label="筛选用例">
          <button class="filter active" type="button" data-result-filter="all">全部</button>
          <button class="filter" type="button" data-result-filter="pass">通过</button>
          <button class="filter" type="button" data-result-filter="fail">失败</button>
          ${productFilters}
        </div>
      </div>
      <div class="case-count"><span id="visibleCaseCount">${summary.cases.length}</span> / ${summary.cases.length} 条用例</div>
      ${renderCaseTable(summary.cases, outputDir)}
    </section>
  </main>
  <script>
    const rows = Array.from(document.querySelectorAll("[data-case-row]"));
    const search = document.getElementById("caseSearch");
    const count = document.getElementById("visibleCaseCount");
    const launchMode = document.getElementById("launchMode");
    const launchMaxCases = document.getElementById("launchMaxCases");
    const launchSafeIm = document.getElementById("launchSafeIm");
    const launchVlm = document.getElementById("launchVlm");
    const launchStop = document.getElementById("launchStop");
    const launchCommand = document.getElementById("launchCommand");
    const copyLaunchCommand = document.getElementById("copyLaunchCommand");
    let resultFilter = "all";
    let productFilter = "all";

    function buildLaunchCommand() {
      const env = [];
      const maxCases = launchMaxCases.value.trim();
      if (maxCases) env.push("EVAL_MAX_CASES=" + maxCases);
      if (launchSafeIm.checked) env.push("TASK_SEND_REAL_MESSAGE=false");
      if (launchVlm.checked) env.push("EVAL_VLM_VERIFY=true");
      if (launchStop.checked) env.push("EVAL_STOP_ON_FAILURE=true");
      const script = launchMode.value === "offline" ? "pnpm eval:offline" : "pnpm eval";
      launchCommand.value = [...env, script].join(" ");
    }

    function setActive(selector, value, attr) {
      document.querySelectorAll(selector).forEach((button) => {
        button.classList.toggle("active", button.getAttribute(attr) === value);
      });
    }

    function applyFilters() {
      const query = (search.value || "").trim().toLowerCase();
      let visible = 0;
      rows.forEach((row) => {
        const matchesResult = resultFilter === "all" || row.dataset.result === resultFilter;
        const matchesProduct = productFilter === "all" || row.dataset.product === productFilter;
        const matchesQuery = !query || (row.dataset.search || "").toLowerCase().includes(query);
        const show = matchesResult && matchesProduct && matchesQuery;
        row.classList.toggle("is-hidden", !show);
        if (show) visible += 1;
      });
      count.textContent = String(visible);
    }

    document.querySelectorAll("[data-result-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        resultFilter = button.dataset.resultFilter || "all";
        setActive("[data-result-filter]", resultFilter, "data-result-filter");
        applyFilters();
      });
    });

    document.querySelectorAll("[data-product-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        productFilter = button.dataset.productFilter || "all";
        setActive("[data-product-filter]", productFilter, "data-product-filter");
        applyFilters();
      });
    });

    search.addEventListener("input", applyFilters);
    [launchMode, launchMaxCases, launchSafeIm, launchVlm, launchStop].forEach((control) => {
      control.addEventListener("input", buildLaunchCommand);
      control.addEventListener("change", buildLaunchCommand);
    });
    copyLaunchCommand.addEventListener("click", async () => {
      launchCommand.select();
      try {
        await navigator.clipboard.writeText(launchCommand.value);
        copyLaunchCommand.textContent = "已复制";
        setTimeout(() => { copyLaunchCommand.textContent = "复制命令"; }, 1200);
      } catch {
        document.execCommand("copy");
      }
    });
    buildLaunchCommand();
  </script>
</body>
</html>`;
}

function metricCard(label: string, value: string, tone = ""): string {
  return `<article class="card"><div class="label">${escapeHtml(label)}</div><div class="value ${tone}">${escapeHtml(value)}</div></article>`;
}

function workflowStep(index: number, title: string, text: string): string {
  return `<article class="flow-step"><div class="flow-index">${index}</div><div class="flow-title">${escapeHtml(title)}</div><div class="flow-text">${escapeHtml(text)}</div></article>`;
}

function renderAdvancedMetrics(summary: EvalSummary): string {
  const advanced = summary.totals.advanced;
  const eventPills = Object.entries(advanced.advancedEventReasons)
    .map(([type, count]) => `<span class="event-pill">${escapeHtml(formatAdvancedEvent(type))} ${count}</span>`)
    .join("");

  return `<div class="advanced-grid">
    <article class="advanced-card"><div class="label">Workflow 用例</div><strong>${advanced.workflowCaseCount}</strong></article>
    <article class="advanced-card"><div class="label">跨产品用例</div><strong>${advanced.crossProductCaseCount}</strong></article>
    <article class="advanced-card"><div class="label">阶段通过率</div><strong>${advanced.workflowPhasePassRate}%</strong></article>
    <article class="advanced-card"><div class="label">自愈重试</div><strong>${advanced.recoveryCount}</strong></article>
    <article class="advanced-card"><div class="label">异常/进阶事件</div><strong>${advanced.advancedEventCount}</strong></article>
    <div class="event-pills" style="grid-column: 1 / -1;">${eventPills || '<span class="event-pill">暂无事件</span>'}</div>
  </div>`;
}

function renderArtifactLinks(summary: EvalSummary, outputDir: string): string {
  const links = [
    ["summary.json", summary.artifacts?.summaryJsonPath],
    ["summary.md", summary.artifacts?.summaryMarkdownPath],
    ["HTML 看板", summary.artifacts?.dashboardPath],
    ["最新入口", summary.artifacts?.latestDashboardPath],
    ["全量历史", summary.artifacts?.historyDashboardPath]
  ]
    .filter((item): item is [string, string] => Boolean(item[1]))
    .map(([label, filePath]) => `<a href="${escapeHtml(toPosixPath(path.relative(outputDir, filePath)))}">${escapeHtml(label)}</a>`)
    .join("");

  return `<div class="artifact-links">${links}</div>`;
}

function renderProductFilters(summary: EvalSummary): string {
  const filters = Object.keys(summary.byProduct)
    .map(
      (product) =>
        `<button class="filter" type="button" data-product-filter="${escapeHtml(product)}">${escapeHtml(formatProduct(product))}</button>`
    )
    .join("");
  return `<button class="filter active" type="button" data-product-filter="all">全部产品</button>${filters}`;
}

function renderProductVisuals(summary: EvalSummary): string {
  const rows = Object.entries(summary.byProduct)
    .map(([product, metric]) => {
      const width = Math.max(0, Math.min(100, metric.successRate));
      return `<article class="product-item">
        <div class="product-head">
          <div class="product-name">${escapeHtml(formatProduct(product))}</div>
          <div class="product-rate">${metric.successRate}%</div>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
        <div class="product-foot"><span>${metric.passed} 通过</span><span>${metric.failed} 失败</span><span>${metric.caseCount} 用例</span></div>
      </article>`;
    })
    .join("");

  return `<div class="product-list">${rows}</div>`;
}

function renderProductTable(summary: EvalSummary): string {
  const rows = Object.entries(summary.byProduct)
    .map(
      ([product, metric]) => `<tr>
        <td>${escapeHtml(formatProduct(product))}</td>
        <td class="num">${metric.caseCount}</td>
        <td class="num">${metric.passed}</td>
        <td class="num">${metric.failed}</td>
        <td class="num">${metric.successRate}%</td>
        <td class="num">${formatDuration(metric.avgDurationMs)}</td>
        <td class="num">${metric.avgTurns}</td>
        <td class="num">${metric.avgActions}</td>
      </tr>`
    )
    .join("\n");

  return `<table>
    <thead><tr><th>产品</th><th class="num">用例数</th><th class="num">通过</th><th class="num">失败</th><th class="num">成功率</th><th class="num">平均耗时</th><th class="num">平均轮次</th><th class="num">平均动作数</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderFailureReasons(summary: EvalSummary): string {
  const entries = Object.entries(summary.totals.failureReasons);
  if (!entries.length) {
    return `<div class="empty">当前没有失败用例。</div>`;
  }
  return `<table>
    <thead><tr><th>原因</th><th class="num">次数</th></tr></thead>
    <tbody>${entries
      .map(([reason, count]) => `<tr><td>${escapeHtml(reason)}</td><td class="num">${count}</td></tr>`)
      .join("\n")}</tbody>
  </table>`;
}

function renderCaseTable(cases: EvalCaseResult[], outputDir: string): string {
  const rows = cases
    .map((item) => {
      const primaryReportPath = item.reportHtmlPath ?? item.reportPath;
      const reportLink = primaryReportPath
        ? `<a href="${escapeHtml(toPosixPath(path.relative(outputDir, primaryReportPath)))}">${item.reportHtmlPath ? "报告界面" : "报告"}</a>`
        : "";
      const markdownLink =
        item.reportHtmlPath && item.reportPath
          ? `<a href="${escapeHtml(toPosixPath(path.relative(outputDir, item.reportPath)))}">Markdown</a>`
          : "";
      const workflowLink = item.workflowReportMarkdownPath
        ? `<a href="${escapeHtml(toPosixPath(path.relative(outputDir, item.workflowReportMarkdownPath)))}">Workflow</a>`
        : "";
      const result = item.passed ? "pass" : "fail";
      const searchText = [
        item.caseId,
        item.title,
        formatProduct(item.product),
        formatProductTrail(item.productTrail),
        formatFinalStatus(item.finalStatus),
        item.failureReason
      ].join(" ");
      return `<tr data-case-row data-result="${result}" data-product="${escapeHtml(item.product)}" data-search="${escapeHtml(searchText)}">
        <td><strong>${escapeHtml(item.caseId)}</strong><br>${escapeHtml(item.title)}</td>
        <td>${escapeHtml(formatProduct(item.product))}</td>
        <td>${escapeHtml(formatProductTrail(item.productTrail))}</td>
        <td class="num">${item.workflowPhaseCount ?? ""}</td>
        <td class="num">${item.recoveryCount ?? ""}</td>
        <td><span class="status ${item.passed ? "pass" : "fail"}">${item.passed ? "通过" : "失败"}</span></td>
        <td>${escapeHtml(formatFinalStatus(item.finalStatus))}</td>
        <td class="num">${formatDuration(item.durationMs)}</td>
        <td class="num">${item.turnCount}</td>
        <td class="num">${item.actionCount}</td>
        <td class="reason">${escapeHtml(item.failureReason)}</td>
        <td>${[reportLink, markdownLink, workflowLink].filter(Boolean).join("<br>")}</td>
      </tr>`;
    })
    .join("\n");

  return `<table>
    <thead><tr><th>用例</th><th>产品</th><th>产品链路</th><th class="num">阶段</th><th class="num">自愈</th><th>结果</th><th>最终状态</th><th class="num">耗时</th><th class="num">轮次</th><th class="num">动作数</th><th>失败原因</th><th>报告</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function formatDuration(value: number): string {
  if (value >= 1000) {
    return `${Math.round(value / 100) / 10}s`;
  }
  return `${value}ms`;
}

function formatMode(mode: string): string {
  if (mode === "online") {
    return "在线执行";
  }
  if (mode === "offline") {
    return "离线汇总";
  }
  return mode;
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

function formatProductTrail(productTrail: string[] | undefined): string {
  if (!productTrail?.length) {
    return "";
  }
  return productTrail.map(formatProduct).join(" -> ");
}

function formatAdvancedEvent(type: string): string {
  const labels: Record<string, string> = {
    popup_detected: "弹窗",
    permission_blocked: "权限",
    loading_timeout: "加载超时",
    alternate_path: "替代路径",
    self_heal_retry: "自愈重试",
    cross_product_handoff: "跨产品切换"
  };
  return labels[type] ?? type;
}

function formatFinalStatus(status: string): string {
  const labels: Record<string, string> = {
    success: "成功",
    failed: "失败",
    max_turns: "达到最大轮次"
  };
  return labels[status] ?? status;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
