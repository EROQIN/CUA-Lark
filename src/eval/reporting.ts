import path from "node:path";
import type { EvalCaseResult, EvalSummary } from "./types.js";
import { ensureDir, toPosixPath, writeTextFile } from "../utils/file.js";

export async function writeEvaluationArtifacts(summary: EvalSummary, outputDir: string): Promise<EvalSummary> {
  await ensureDir(outputDir);
  const summaryJsonPath = path.join(outputDir, "summary.json");
  const summaryMarkdownPath = path.join(outputDir, "summary.md");
  const dashboardPath = path.join(outputDir, "index.html");
  const enriched: EvalSummary = {
    ...summary,
    artifacts: {
      summaryJsonPath,
      summaryMarkdownPath,
      dashboardPath
    }
  };

  await writeTextFile(summaryJsonPath, JSON.stringify(enriched, null, 2));
  await writeTextFile(summaryMarkdownPath, renderSummaryMarkdown(enriched));
  await writeTextFile(dashboardPath, renderDashboardHtml(enriched, outputDir));
  return enriched;
}

function renderSummaryMarkdown(summary: EvalSummary): string {
  const lines = [
    `# CUA-Lark M4 Evaluation: ${summary.evalRunId}`,
    "",
    `Mode: ${summary.mode}`,
    `Started At: ${summary.startedAt}`,
    `Ended At: ${summary.endedAt}`,
    "",
    "## Totals",
    "",
    `- Cases: ${summary.totals.caseCount}`,
    `- Passed: ${summary.totals.passed}`,
    `- Failed: ${summary.totals.failed}`,
    `- Success Rate: ${summary.totals.successRate}%`,
    `- Avg Duration: ${summary.totals.avgDurationMs} ms`,
    `- Avg Turns: ${summary.totals.avgTurns}`,
    `- Avg Actions: ${summary.totals.avgActions}`,
    "",
    "## By Product",
    "",
    "| Product | Cases | Passed | Failed | Success Rate | Avg Duration | Avg Turns | Avg Actions |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(summary.byProduct).map(
      ([product, metric]) =>
        `| ${product} | ${metric.caseCount} | ${metric.passed} | ${metric.failed} | ${metric.successRate}% | ${metric.avgDurationMs} ms | ${metric.avgTurns} | ${metric.avgActions} |`
    ),
    "",
    "## Cases",
    "",
    "| Case | Product | Result | Final Status | Duration | Turns | Actions | Failure Reason | Report |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |",
    ...summary.cases.map((item) => {
      const cells = [
        markdownCell(`${item.caseId} ${item.title}`),
        item.product,
        item.passed ? "PASS" : "FAIL",
        item.finalStatus,
        `${item.durationMs} ms`,
        String(item.turnCount),
        String(item.actionCount),
        markdownCell(item.failureReason),
        item.reportPath ? markdownCell(item.reportPath) : ""
      ];
      return `| ${cells.join(" | ")} |`;
    })
  ];

  return `${lines.join("\n")}\n`;
}

function renderDashboardHtml(summary: EvalSummary, outputDir: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CUA-Lark M4 Evaluation ${escapeHtml(summary.evalRunId)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7fb;
      --panel: #ffffff;
      --text: #182033;
      --muted: #667085;
      --line: #d9deea;
      --accent: #2563eb;
      --ok: #0f8a5f;
      --ok-bg: #e7f7ef;
      --bad: #b42318;
      --bad-bg: #fff0ed;
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
    header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
    h1 { margin: 0 0 8px; font-size: clamp(28px, 4vw, 44px); line-height: 1.05; letter-spacing: 0; }
    .meta { color: var(--muted); font-size: 14px; line-height: 1.6; }
    .mode { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; padding: 9px 12px; font-size: 13px; color: var(--muted); white-space: nowrap; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
    .card, .section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); }
    .card { padding: 16px; min-height: 108px; }
    .label { color: var(--muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0; }
    .value { margin-top: 14px; font-size: 30px; line-height: 1; font-weight: 760; }
    .value.ok { color: var(--ok); }
    .value.bad { color: var(--bad); }
    .section { margin-top: 16px; overflow: hidden; }
    .section h2 { margin: 0; padding: 16px 18px; font-size: 17px; border-bottom: 1px solid var(--line); }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px 14px; border-bottom: 1px solid var(--line); text-align: left; font-size: 13px; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; font-weight: 760; background: #fbfcff; }
    tr:last-child td { border-bottom: 0; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .status { display: inline-flex; align-items: center; min-width: 58px; justify-content: center; border-radius: 999px; padding: 4px 8px; font-size: 12px; font-weight: 760; }
    .pass { color: var(--ok); background: var(--ok-bg); }
    .fail { color: var(--bad); background: var(--bad-bg); }
    .reason { color: var(--muted); max-width: 320px; line-height: 1.45; }
    a { color: var(--accent); text-decoration: none; font-weight: 650; }
    a:hover { text-decoration: underline; }
    .empty { padding: 16px 18px; color: var(--muted); font-size: 14px; }
    @media (max-width: 780px) {
      header { display: block; }
      .mode { display: inline-flex; margin-top: 12px; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
    <header>
      <div>
        <h1>CUA-Lark M4 Evaluation</h1>
        <div class="meta">Run ${escapeHtml(summary.evalRunId)} · ${escapeHtml(summary.startedAt)} → ${escapeHtml(summary.endedAt)}</div>
      </div>
      <div class="mode">Mode: ${escapeHtml(summary.mode)}</div>
    </header>

    <section class="grid" aria-label="Evaluation totals">
      ${metricCard("Cases", String(summary.totals.caseCount))}
      ${metricCard("Success Rate", `${summary.totals.successRate}%`, summary.totals.failed ? "bad" : "ok")}
      ${metricCard("Avg Duration", formatMs(summary.totals.avgDurationMs))}
      ${metricCard("Avg Actions", String(summary.totals.avgActions))}
    </section>

    <section class="section">
      <h2>Product Metrics</h2>
      ${renderProductTable(summary)}
    </section>

    <section class="section">
      <h2>Failure Reasons</h2>
      ${renderFailureReasons(summary)}
    </section>

    <section class="section">
      <h2>Case Results</h2>
      ${renderCaseTable(summary.cases, outputDir)}
    </section>
  </main>
</body>
</html>`;
}

function metricCard(label: string, value: string, tone = ""): string {
  return `<article class="card"><div class="label">${escapeHtml(label)}</div><div class="value ${tone}">${escapeHtml(value)}</div></article>`;
}

function renderProductTable(summary: EvalSummary): string {
  const rows = Object.entries(summary.byProduct)
    .map(
      ([product, metric]) => `<tr>
        <td>${escapeHtml(product)}</td>
        <td class="num">${metric.caseCount}</td>
        <td class="num">${metric.passed}</td>
        <td class="num">${metric.failed}</td>
        <td class="num">${metric.successRate}%</td>
        <td class="num">${formatMs(metric.avgDurationMs)}</td>
        <td class="num">${metric.avgTurns}</td>
        <td class="num">${metric.avgActions}</td>
      </tr>`
    )
    .join("\n");

  return `<table>
    <thead><tr><th>Product</th><th class="num">Cases</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Success Rate</th><th class="num">Avg Duration</th><th class="num">Avg Turns</th><th class="num">Avg Actions</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderFailureReasons(summary: EvalSummary): string {
  const entries = Object.entries(summary.totals.failureReasons);
  if (!entries.length) {
    return `<div class="empty">No failures recorded.</div>`;
  }
  return `<table>
    <thead><tr><th>Reason</th><th class="num">Count</th></tr></thead>
    <tbody>${entries
      .map(([reason, count]) => `<tr><td>${escapeHtml(reason)}</td><td class="num">${count}</td></tr>`)
      .join("\n")}</tbody>
  </table>`;
}

function renderCaseTable(cases: EvalCaseResult[], outputDir: string): string {
  const rows = cases
    .map((item) => {
      const reportLink = item.reportPath
        ? `<a href="${escapeHtml(toPosixPath(path.relative(outputDir, item.reportPath)))}">report</a>`
        : "";
      return `<tr>
        <td><strong>${escapeHtml(item.caseId)}</strong><br>${escapeHtml(item.title)}</td>
        <td>${escapeHtml(item.product)}</td>
        <td><span class="status ${item.passed ? "pass" : "fail"}">${item.passed ? "PASS" : "FAIL"}</span></td>
        <td>${escapeHtml(item.finalStatus)}</td>
        <td class="num">${formatMs(item.durationMs)}</td>
        <td class="num">${item.turnCount}</td>
        <td class="num">${item.actionCount}</td>
        <td class="reason">${escapeHtml(item.failureReason)}</td>
        <td>${reportLink}</td>
      </tr>`;
    })
    .join("\n");

  return `<table>
    <thead><tr><th>Case</th><th>Product</th><th>Result</th><th>Final</th><th class="num">Duration</th><th class="num">Turns</th><th class="num">Actions</th><th>Failure Reason</th><th>Report</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function formatMs(value: number): string {
  if (value >= 1000) {
    return `${Math.round(value / 100) / 10}s`;
  }
  return `${value}ms`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
