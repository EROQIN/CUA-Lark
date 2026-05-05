import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEvalCases } from "./case-loader.js";
import type { EvalCase } from "./types.js";

type JobStatus = "idle" | "running" | "success" | "failed" | "stopped";
type RunAction = "doctor" | "offline" | "m4" | "m5" | "all" | "cross" | "inbox" | "case" | "nl";

interface RunOptions {
  maxCases?: string;
  vlmVerify?: boolean;
  stopOnFailure?: boolean;
  inboxGroupName?: string;
  selfHealRetries?: string;
  caseSet?: string;
  caseId?: string;
  naturalInstruction?: string;
  naturalExpectedTexts?: string;
}

interface Job {
  id: string;
  action: RunAction;
  title: string;
  command: string;
  status: JobStatus;
  startedAt: string;
  endedAt?: string;
  exitCode?: number | null;
  latestDashboardUrl?: string;
  logs: string[];
}

let currentProcess: ChildProcessWithoutNullStreams | undefined;
let currentJob: Job | undefined;
const jobHistory: Job[] = [];

const cwd = process.cwd();
const host = "127.0.0.1";
const port = readPort();

const actionMap: Record<RunAction, { title: string; args: string[]; env?: Record<string, string> }> = {
  doctor: {
    title: "环境检查",
    args: ["run", "doctor"]
  },
  offline: {
    title: "离线生成看板",
    args: ["eval:offline"]
  },
  m4: {
    title: "M4 全量评测",
    args: ["eval"],
    env: { EVAL_CASE_SET: "eval/cases/m4-smoke.json" }
  },
  m5: {
    title: "M5 进阶联动评测",
    args: ["eval"],
    env: { EVAL_CASE_SET: "eval/cases/m5-advanced.json" }
  },
  all: {
    title: "一键执行全部评测",
    args: ["eval:all"]
  },
  case: {
    title: "单个测试用例",
    args: ["eval"]
  },
  nl: {
    title: "自然语言测试",
    args: ["eval:nl"]
  },
  cross: {
    title: "跨产品联动 Demo",
    args: ["demo:cross"]
  },
  inbox: {
    title: "任务群自然语言驱动",
    args: ["task:inbox"]
  }
};

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  });
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}`;
  console.log(`CUA-Lark 可视化测试控制台：${url}`);
  if (readFlag("EVAL_UI_OPEN", true) && process.platform === "darwin") {
    execFile("open", [url], () => undefined);
  }
});

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  if (request.method === "GET" && url.pathname === "/") {
    sendHtml(response, renderHtml());
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, buildState());
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/cases") {
    sendJson(response, 200, { cases: await loadDemoCases() });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/run") {
    const body = await readJsonBody<{ action?: RunAction; options?: RunOptions }>(request);
    if (!body.action || !(body.action in actionMap)) {
      sendJson(response, 400, { error: "未知执行动作。" });
      return;
    }
    const job = startJob(body.action, body.options ?? {});
    sendJson(response, 200, { job });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/stop") {
    stopCurrentJob();
    sendJson(response, 200, buildState());
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/open-latest") {
    await openLatestDashboard();
    sendJson(response, 200, { ok: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/open-history") {
    await openHistoryDashboard();
    sendJson(response, 200, { ok: true });
    return;
  }
  sendJson(response, 404, { error: "Not found" });
}

function startJob(action: RunAction, options: RunOptions): Job {
  if (currentProcess && currentJob?.status === "running") {
    throw new Error(`当前已有任务运行中：${currentJob.title}`);
  }

  const spec = actionMap[action];
  const env = buildEnv(spec.env ?? {}, options);
  const args = action === "nl" ? [...spec.args, readNaturalInstruction(options)] : spec.args;
  const envWithOptions = action === "nl" ? buildNaturalLanguageEnv(env, options) : env;
  const command = ["pnpm", ...args.map((item) => (/\s/.test(item) ? JSON.stringify(item) : item))].join(" ");
  const title =
    action === "case" && options.caseId
      ? `${spec.title}：${options.caseId}`
      : action === "nl"
        ? `${spec.title}：${truncate(readNaturalInstruction(options), 28)}`
        : spec.title;
  const job: Job = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    title,
    command,
    status: "running",
    startedAt: new Date().toISOString(),
    logs: [`$ ${command}\n`]
  };
  currentJob = job;
  jobHistory.unshift(job);
  jobHistory.splice(8);

  currentProcess = spawn("pnpm", args, {
    cwd,
    env: envWithOptions,
    shell: false
  });

  currentProcess.stdout.on("data", (chunk) => appendLog(job, chunk.toString()));
  currentProcess.stderr.on("data", (chunk) => appendLog(job, chunk.toString()));
  currentProcess.on("error", (error) => {
    appendLog(job, `\n启动失败：${error.message}\n`);
    finishJob(job, "failed", null);
  });
  currentProcess.on("close", (code) => {
    finishJob(job, code === 0 ? "success" : job.status === "stopped" ? "stopped" : "failed", code);
    currentProcess = undefined;
  });

  return job;
}

function buildEnv(base: Record<string, string>, options: RunOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...base
  };
  if (options.maxCases?.trim()) {
    env.EVAL_MAX_CASES = options.maxCases.trim();
  }
  if (options.vlmVerify) {
    env.EVAL_VLM_VERIFY = "true";
  }
  if (options.stopOnFailure) {
    env.EVAL_STOP_ON_FAILURE = "true";
  }
  if (options.inboxGroupName?.trim()) {
    env.TASK_INBOX_GROUP_NAME = options.inboxGroupName.trim();
  }
  if (options.selfHealRetries?.trim()) {
    env.TASK_SELF_HEAL_RETRIES = options.selfHealRetries.trim();
  }
  if (options.caseSet?.trim()) {
    env.EVAL_CASE_SET = options.caseSet.trim();
  }
  if (options.caseId?.trim()) {
    env.EVAL_CASE_IDS = options.caseId.trim();
  }
  return env;
}

function buildNaturalLanguageEnv(env: NodeJS.ProcessEnv, options: RunOptions): NodeJS.ProcessEnv {
  return {
    ...env,
    EVAL_NL_REQUIRED_TEXTS: options.naturalExpectedTexts?.trim() ?? env.EVAL_NL_REQUIRED_TEXTS ?? ""
  };
}

function readNaturalInstruction(options: RunOptions): string {
  const instruction = options.naturalInstruction?.trim();
  if (!instruction) {
    throw new Error("请输入自然语言测试命令。");
  }
  return instruction;
}

function stopCurrentJob(): void {
  if (!currentProcess || !currentJob || currentJob.status !== "running") {
    return;
  }
  currentJob.status = "stopped";
  appendLog(currentJob, "\n用户从控制台停止了当前任务。\n");
  currentProcess.kill("SIGTERM");
}

function appendLog(job: Job, chunk: string): void {
  job.logs.push(chunk);
  const latest = chunk.match(/最新看板：\s*(\S+)/)?.[1] ?? chunk.match(/看板链接：\s*(\S+)/)?.[1];
  if (latest) {
    job.latestDashboardUrl = latest;
  }
  if (job.logs.length > 1200) {
    job.logs.splice(0, job.logs.length - 1200);
  }
}

function finishJob(job: Job, status: JobStatus, exitCode: number | null): void {
  job.status = status;
  job.exitCode = exitCode;
  job.endedAt = new Date().toISOString();
  if (!job.latestDashboardUrl) {
    job.latestDashboardUrl = latestDashboardUrl();
  }
  appendLog(job, `\n任务结束：${formatStatus(status)}${exitCode === null ? "" : `，退出码 ${exitCode}`}\n`);
}

function buildState(): object {
  return {
    running: currentJob?.status === "running",
    currentJob,
    jobHistory,
    latestDashboardUrl: latestDashboardUrl(),
    latestDashboardPath: latestDashboardPath(),
    historyDashboardUrl: historyDashboardUrl(),
    historyDashboardPath: historyDashboardPath(),
    serverTime: new Date().toISOString()
  };
}

async function loadDemoCases(): Promise<Array<{
  caseSetLabel: string;
  caseSetPath: string;
  id: string;
  title: string;
  product: string;
  instruction: string;
  tags: string[];
  workflowSteps: Array<{ id: string; title: string; product: string; instruction: string }>;
}>> {
  const specs = [
    ["M4 Smoke", "eval/cases/m4-smoke.json"],
    ["M5 Advanced", "eval/cases/m5-advanced.json"]
  ] as const;
  const loaded = await Promise.all(
    specs.map(async ([caseSetLabel, caseSetPath]) => {
      const cases = await loadEvalCases(path.resolve(cwd, caseSetPath));
      return cases.map((item) => serializeCase(item, caseSetLabel, caseSetPath));
    })
  );
  return loaded.flat();
}

function serializeCase(item: EvalCase, caseSetLabel: string, caseSetPath: string) {
  return {
    caseSetLabel,
    caseSetPath,
    id: item.id,
    title: item.title,
    product: item.product,
    instruction: item.instruction,
    tags: item.tags,
    workflowSteps:
      item.workflow?.steps.map((step) => ({
        id: step.id,
        title: step.title,
        product: step.product,
        instruction: step.instruction
      })) ?? []
  };
}

function latestDashboardPath(): string {
  return path.resolve(cwd, "runs/evaluations/latest.html");
}

function latestDashboardUrl(): string {
  const filePath = latestDashboardPath();
  return existsSync(filePath) ? pathToFileURL(filePath).href : "";
}

function historyDashboardPath(): string {
  return path.resolve(cwd, "runs/evaluations/history.html");
}

function historyDashboardUrl(): string {
  const filePath = historyDashboardPath();
  return existsSync(filePath) ? pathToFileURL(filePath).href : "";
}

async function openLatestDashboard(): Promise<void> {
  const filePath = latestDashboardPath();
  if (!existsSync(filePath)) {
    throw new Error("还没有生成 latest.html，请先执行一次评测或离线看板。");
  }
  if (process.platform === "darwin") {
    await new Promise<void>((resolve, reject) => {
      execFile("open", [filePath], (error) => (error ? reject(error) : resolve()));
    });
    return;
  }
  console.log(`最新看板：${pathToFileURL(filePath).href}`);
}

async function openHistoryDashboard(): Promise<void> {
  const filePath = historyDashboardPath();
  if (!existsSync(filePath)) {
    throw new Error("还没有生成 history.html，请先执行一次离线看板。");
  }
  if (process.platform === "darwin") {
    await new Promise<void>((resolve, reject) => {
      execFile("open", [filePath], (error) => (error ? reject(error) : resolve()));
    });
    return;
  }
  console.log(`全量历史：${pathToFileURL(filePath).href}`);
}

function renderHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CUA-Lark 可视化测试控制台</title>
  <style>
    :root { color-scheme: light; --bg:#f5f7fb; --panel:#fff; --text:#172033; --muted:#667085; --line:#d9deea; --accent:#2563eb; --accent-2:#0f8a5f; --bad:#b42318; --warn:#a15c07; --shadow:0 16px 42px rgba(22,34,67,.08); }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; letter-spacing:0; }
    .shell { width:min(1180px, calc(100% - 32px)); margin:0 auto; padding:26px 0 34px; }
    .hero, .section { background:var(--panel); border:1px solid var(--line); border-radius:8px; box-shadow:var(--shadow); }
    .hero { padding:22px; margin-bottom:14px; display:flex; justify-content:space-between; gap:18px; align-items:flex-start; }
    h1 { margin:0 0 8px; font-size:34px; line-height:1.1; }
    .meta { color:var(--muted); font-size:14px; line-height:1.6; }
    .status-pill { border:1px solid var(--line); border-radius:999px; padding:8px 12px; font-size:13px; background:#fbfcff; white-space:nowrap; }
    .status-pill.running { color:var(--warn); border-color:#ffe1a6; background:#fff8e5; }
    .status-pill.success { color:var(--accent-2); border-color:#c8f0dc; background:#f0fbf6; }
    .status-pill.failed { color:var(--bad); border-color:#ffd0c7; background:#fff4f1; }
    .grid { display:grid; grid-template-columns: 1.05fr .95fr; gap:14px; }
    .feedback-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:14px; }
    .feedback-card { background:#fff; border:1px solid var(--line); border-radius:8px; padding:12px; min-height:78px; }
    .feedback-card span { color:var(--muted); display:block; font-size:12px; font-weight:700; margin-bottom:11px; }
    .feedback-card strong { font-size:18px; line-height:1.15; word-break:break-word; }
    .section { overflow:hidden; }
    .section h2 { margin:0; padding:15px 17px; border-bottom:1px solid var(--line); font-size:17px; }
    .body { padding:16px 17px; }
    .actions { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
    button { border:1px solid var(--line); border-radius:8px; background:#fff; color:var(--text); padding:12px 13px; font:inherit; font-size:14px; cursor:pointer; text-align:left; }
    button:hover { border-color:var(--accent); }
    button.primary { grid-column:1/-1; background:#174ea6; border-color:#174ea6; color:#fff; font-weight:720; font-size:16px; }
    button.danger { color:var(--bad); }
    button:disabled { opacity:.5; cursor:not-allowed; }
    .options { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:11px; margin-bottom:14px; }
    label { display:block; color:var(--muted); font-size:12px; font-weight:700; margin-bottom:7px; }
    input { width:100%; border:1px solid var(--line); border-radius:8px; padding:9px 10px; font:inherit; font-size:13px; background:#fff; color:var(--text); }
    .check { display:flex; gap:8px; align-items:center; min-height:34px; color:var(--text); font-size:13px; }
    .check input { width:auto; }
    textarea { width:100%; min-height:104px; resize:vertical; border:1px solid var(--line); border-radius:8px; padding:10px 11px; font:inherit; font-size:14px; line-height:1.5; background:#fff; color:var(--text); }
    .nl-panel { display:grid; gap:10px; }
    .tips { margin-top:12px; color:var(--muted); font-size:12px; line-height:1.55; }
    .logbar { display:flex; gap:10px; align-items:center; justify-content:space-between; padding:12px 17px; border-bottom:1px solid var(--line); background:#fbfcff; }
    .logtitle { font-weight:720; font-size:14px; }
    pre { margin:0; min-height:460px; max-height:620px; overflow:auto; padding:14px 17px; background:#0b1220; color:#e6edf7; font:13px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; line-height:1.5; white-space:pre-wrap; }
    .history { display:grid; gap:9px; }
    .history-item { border:1px solid var(--line); border-radius:8px; padding:10px; background:#fbfcff; font-size:13px; }
    .history-item strong { display:block; margin-bottom:5px; }
    .case-tools { display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:12px; }
    .case-tools input { max-width:360px; }
    .case-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .case-card { border:1px solid var(--line); border-radius:8px; background:#fbfcff; padding:12px; display:grid; gap:9px; }
    .case-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .case-title { font-weight:760; font-size:14px; }
    .case-meta { color:var(--muted); font-size:12px; line-height:1.45; }
    .case-instruction { color:#344054; font-size:13px; line-height:1.55; }
    .case-steps { margin:0; padding-left:18px; color:var(--muted); font-size:12px; line-height:1.45; }
    .case-card button { padding:9px 10px; font-size:13px; text-align:center; background:#fff; }
    a { color:var(--accent); text-decoration:none; font-weight:650; }
    a:hover { text-decoration:underline; }
    @media (max-width: 860px) { .hero, .grid { display:block; } .status-pill { display:inline-flex; margin-top:12px; } .section { margin-top:14px; } .actions, .options, .feedback-grid, .case-list { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div>
        <h1>CUA-Lark 可视化测试控制台</h1>
        <div class="meta">本地运行：点击按钮即可启动真实飞书测试。在线评测会发送消息、创建/确认日程，请确保当前是测试账号。</div>
      </div>
      <div id="statusPill" class="status-pill">空闲</div>
    </section>

    <div class="grid">
      <section class="section">
        <h2>一键执行</h2>
        <div class="body">
          <div class="options">
            <div><label for="maxCases">最多用例数</label><input id="maxCases" placeholder="不填表示全部"></div>
            <div><label for="inboxGroupName">任务群名称</label><input id="inboxGroupName" value="${escapeHtml(process.env.TASK_INBOX_GROUP_NAME ?? "任务群")}"></div>
            <div><label for="selfHealRetries">自愈重试次数</label><input id="selfHealRetries" value="${escapeHtml(process.env.TASK_SELF_HEAL_RETRIES ?? "1")}"></div>
            <div>
              <label>高级选项</label>
              <div class="check"><input id="vlmVerify" type="checkbox"> <span>启用 VLM 语义复核</span></div>
              <div class="check"><input id="stopOnFailure" type="checkbox"> <span>失败即停</span></div>
            </div>
          </div>
          <div class="actions">
            <button class="primary" data-action="all">一键测试全部（M4 + M5）</button>
            <button data-action="m4">运行 M4 全量评测</button>
            <button data-action="m5">运行 M5 跨产品联动</button>
            <button data-action="offline">离线生成/刷新看板</button>
            <button data-action="doctor">环境检查</button>
            <button data-action="cross">跨产品 Demo</button>
            <button data-action="inbox">任务群自然语言驱动</button>
            <button id="openHistory">打开全量历史看板</button>
            <button id="openLatest">打开最近一次看板</button>
            <button id="stopJob" class="danger">停止当前任务</button>
          </div>
          <div class="tips">推荐演示顺序：先“环境检查”，再“离线生成/刷新看板”作为兜底，最后点击“一键测试全部”或单独运行 M5 跨产品联动。</div>
        </div>
      </section>

      <section class="section">
        <h2>历史记录</h2>
        <div class="body"><div id="history" class="history"></div></div>
      </section>
    </div>

    <section class="section" style="margin-top:14px;">
      <h2>自然语言执行测试</h2>
      <div class="body">
        <div class="nl-panel">
          <div>
            <label for="naturalInstruction">自然语言测试命令</label>
            <textarea id="naturalInstruction" placeholder="例如：打开日历，创建一个明天下午2点的会议，标题为'项目周报'，邀请刘骏翔参加，保存后停止。"></textarea>
          </div>
          <div>
            <label for="naturalExpectedTexts">校验关键文本（可选，多个用 | 分隔）</label>
            <input id="naturalExpectedTexts" placeholder="例如：项目周报|刘骏翔">
          </div>
          <button class="primary" id="runNaturalLanguage">执行自然语言测试并生成中文报告</button>
          <div class="tips">执行后会自动生成单条临时评测用例，完成真实操作、规则校验、summary.json、summary.md、HTML 看板和单次 report.json/report.md。</div>
        </div>
      </div>
    </section>

    <section class="section" style="margin-top:14px;">
      <h2>运行反馈</h2>
      <div class="body">
        <div class="feedback-grid">
          <div class="feedback-card"><span>当前任务</span><strong id="feedbackJob">空闲</strong></div>
          <div class="feedback-card"><span>运行状态</span><strong id="feedbackStatus">等待启动</strong></div>
          <div class="feedback-card"><span>运行时长</span><strong id="feedbackElapsed">0s</strong></div>
          <div class="feedback-card"><span>最近一次看板</span><strong id="feedbackDashboard">未生成</strong></div>
        </div>
      </div>
    </section>

    <section class="section" style="margin-top:14px;">
      <h2>测试用例清单</h2>
      <div class="body">
        <div class="case-tools">
          <input id="caseSearch" placeholder="搜索用例、产品、自然语言命令">
          <a href="${escapeHtml(pathToFileURL(path.resolve(cwd, "docs/demo-test-cases.md")).href)}" target="_blank" rel="noreferrer">打开用例文档</a>
        </div>
        <div id="caseList" class="case-list"></div>
      </div>
    </section>

    <section class="section" style="margin-top:14px;">
      <div class="logbar">
        <div class="logtitle" id="logTitle">运行日志</div>
        <a id="latestLink" href="#" target="_blank" rel="noreferrer">最近一次看板</a>
      </div>
      <pre id="logOutput">等待启动任务...</pre>
    </section>
  </main>
  <script>
    const logOutput = document.getElementById("logOutput");
    const logTitle = document.getElementById("logTitle");
    const statusPill = document.getElementById("statusPill");
    const latestLink = document.getElementById("latestLink");
    const history = document.getElementById("history");
    const caseList = document.getElementById("caseList");
    const caseSearch = document.getElementById("caseSearch");
    const controls = Array.from(document.querySelectorAll("button[data-action]"));
    let demoCases = [];

    function options() {
      return {
        maxCases: document.getElementById("maxCases").value,
        vlmVerify: document.getElementById("vlmVerify").checked,
        stopOnFailure: document.getElementById("stopOnFailure").checked,
        inboxGroupName: document.getElementById("inboxGroupName").value,
        selfHealRetries: document.getElementById("selfHealRetries").value
      };
    }

    function naturalOptions() {
      return {
        ...options(),
        naturalInstruction: document.getElementById("naturalInstruction").value,
        naturalExpectedTexts: document.getElementById("naturalExpectedTexts").value
      };
    }

    async function run(action) {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, options: options() })
      });
      if (!response.ok) {
        const payload = await response.json();
        alert(payload.error || "启动失败");
      }
      await refresh();
    }

    async function runNaturalLanguage() {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "nl", options: naturalOptions() })
      });
      if (!response.ok) {
        const payload = await response.json();
        alert(payload.error || "启动失败");
      }
      await refresh();
    }

    async function runCase(testCase) {
      const body = {
        action: "case",
        options: { ...options(), caseSet: testCase.caseSetPath, caseId: testCase.id, maxCases: "" }
      };
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const payload = await response.json();
        alert(payload.error || "启动失败");
      }
      await refresh();
    }

    async function refresh() {
      const state = await (await fetch("/api/state")).json();
      const job = state.currentJob;
      controls.forEach((button) => { button.disabled = state.running; });
      document.getElementById("stopJob").disabled = !state.running;
      document.getElementById("runNaturalLanguage").disabled = state.running;
      statusPill.className = "status-pill " + (job?.status || "");
      statusPill.textContent = job ? statusText(job.status) + " · " + job.title : "空闲";
      document.getElementById("feedbackJob").textContent = job ? job.title : "空闲";
      document.getElementById("feedbackStatus").textContent = job ? statusText(job.status) : "等待启动";
      document.getElementById("feedbackElapsed").textContent = job ? elapsedText(job.startedAt, job.endedAt || state.serverTime) : "0s";
      logTitle.textContent = job ? job.title + " · " + job.command : "运行日志";
      logOutput.textContent = job ? job.logs.join("") : "等待启动任务...";
      logOutput.scrollTop = logOutput.scrollHeight;
      const latest = job?.latestDashboardUrl || state.latestDashboardUrl || "";
      latestLink.href = latest || "#";
      latestLink.textContent = latest ? "最近一次看板" : "暂无看板";
      document.getElementById("feedbackDashboard").innerHTML = latest ? '<a href="' + latest + '" target="_blank" rel="noreferrer">可打开</a>' : "未生成";
      history.innerHTML = (state.jobHistory || []).map((item) => {
        const url = item.latestDashboardUrl ? '<a href="' + item.latestDashboardUrl + '" target="_blank" rel="noreferrer">看板</a>' : '';
        return '<div class="history-item"><strong>' + escapeHtml(item.title) + '</strong><div>' + statusText(item.status) + ' · ' + escapeHtml(item.startedAt) + '</div><div>' + escapeHtml(item.command) + ' ' + url + '</div></div>';
      }).join("") || '<div class="history-item">暂无历史任务</div>';
      renderCases();
    }

    async function loadCases() {
      const payload = await (await fetch("/api/cases")).json();
      demoCases = payload.cases || [];
      renderCases();
    }

    function renderCases() {
      const query = (caseSearch.value || "").trim().toLowerCase();
      const visible = demoCases.filter((item) => {
        const haystack = [item.id, item.title, item.product, item.instruction, item.caseSetLabel, ...(item.tags || [])].join(" ").toLowerCase();
        return !query || haystack.includes(query);
      });
      caseList.innerHTML = visible.map((item, index) => {
        const steps = item.workflowSteps?.length ? '<ol class="case-steps">' + item.workflowSteps.map((step) => '<li>' + escapeHtml(step.title) + '：' + escapeHtml(step.instruction) + '</li>').join("") + '</ol>' : "";
        return '<article class="case-card"><div class="case-head"><div><div class="case-title">' + escapeHtml(item.title) + '</div><div class="case-meta">' + escapeHtml(item.caseSetLabel) + ' · ' + escapeHtml(item.id) + ' · ' + escapeHtml(item.product) + '</div></div></div><div class="case-instruction">' + escapeHtml(item.instruction) + '</div>' + steps + '<button data-case-index="' + index + '">执行此用例</button></article>';
      }).join("") || '<div class="history-item">没有匹配的测试用例</div>';
      Array.from(document.querySelectorAll("[data-case-index]")).forEach((button) => {
        button.disabled = statusPill.classList.contains("running");
        button.addEventListener("click", () => runCase(visible[Number(button.getAttribute("data-case-index"))]));
      });
    }

    function statusText(status) {
      return { running: "运行中", success: "成功", failed: "失败", stopped: "已停止", idle: "空闲" }[status] || "空闲";
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }

    function elapsedText(startedAt, endedAt) {
      const start = Date.parse(startedAt);
      const end = Date.parse(endedAt);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return "0s";
      const seconds = Math.max(0, Math.round((end - start) / 1000));
      const minutes = Math.floor(seconds / 60);
      const rest = seconds % 60;
      return minutes ? minutes + "m " + rest + "s" : rest + "s";
    }

    controls.forEach((button) => button.addEventListener("click", () => run(button.dataset.action)));
    document.getElementById("runNaturalLanguage").addEventListener("click", runNaturalLanguage);
    caseSearch.addEventListener("input", renderCases);
    document.getElementById("stopJob").addEventListener("click", async () => { await fetch("/api/stop", { method: "POST" }); await refresh(); });
    document.getElementById("openLatest").addEventListener("click", async () => {
      const response = await fetch("/api/open-latest", { method: "POST" });
      if (!response.ok) alert((await response.json()).error || "打开失败");
    });
    document.getElementById("openHistory").addEventListener("click", async () => {
      const response = await fetch("/api/open-history", { method: "POST" });
      if (!response.ok) alert((await response.json()).error || "打开失败");
    });
    refresh();
    loadCases();
    setInterval(refresh, 1000);
  </script>
</body>
</html>`;
}

function readPort(): number {
  const raw = process.env.EVAL_UI_PORT;
  const value = raw ? Number(raw) : 4317;
  return Number.isFinite(value) && value > 0 ? value : 4317;
}

function readFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return defaultValue;
  }
  return !["0", "false", "no", "off"].includes(raw.toLowerCase());
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function formatStatus(status: JobStatus): string {
  const labels: Record<JobStatus, string> = {
    idle: "空闲",
    running: "运行中",
    success: "成功",
    failed: "失败",
    stopped: "已停止"
  };
  return labels[status];
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
