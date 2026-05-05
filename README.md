# CUA-Lark

CUA-Lark 是一个以 UI-TARS SDK `GUIAgent` 为中心的飞书/Lark 桌面端 Computer-Use 测试框架。项目不再维护自建 VLM grounding、Hybrid Locator、Planner、AX Tree 或 layout prior 执行链路；核心执行完全交给 UI-TARS，CUA-Lark 只保留任务封装、应用激活、运行记录、截图轨迹和 Markdown 报告。

## 核心链路

```text
自然语言任务
  -> CUA-Lark task factory
  -> UI-TARS GUIAgent + NutJSOperator
  -> UI-TARS model prediction / parsedPrediction / execution
  -> runs/{runId}/report.md
```

## 安装

```bash
pnpm install
```

Node.js 建议 `>=20`。

## 配置

复制 `.env.example` 为 `.env`，优先配置：

- `UI_TARS_BASE_URL`: OpenAI-compatible Chat Completions 地址
- `UI_TARS_API_KEY`: 模型 API Key
- `UI_TARS_MODEL`: 视觉 GUI Agent 模型
- `CUA_LARK_TARGET_APP`: 运行前自动激活的应用名，默认 `飞书,Lark`
- `CUA_LARK_NOTIFY_TASK_COMPLETE`: 单个任务结束后是否发送桌面通知，默认 `true`
- `CUA_LARK_NOTIFY_EVAL_COMPLETE`: 批量评测结束后是否发送桌面通知，默认 `true`
- `CUA_LARK_COMPLETION_DIALOG`: 任务或评测结束后是否弹出消息框，默认 `true`
- `TASK_MAX_TURNS`: GUIAgent 最大轮数
- `TASK_STEP_DELAY_MS`: 每轮间隔
- `TASK_INBOX_GROUP_NAME`: 任务群入口名称，默认 `任务群`
- `TASK_SELF_HEAL_RETRIES`: workflow 阶段失败后的自愈重试次数，默认 `1`
- `TASK_PRODUCT`: `auto|im|docs|calendar|base|vc|mail`
- `TASK_CONTEXT_IDS`: 可选，手动指定要注入的页面操作提示 ID，逗号分隔

如果 `UI_TARS_*` 未配置，会回退读取 `VLM_BASE_URL / VLM_API_KEY / VLM_MODEL`。

macOS 需要给运行器授予“屏幕录制”和“辅助功能”权限。

macOS 下任务或评测结束时会通过系统通知和消息框提示完成状态；其他平台会退化为终端提示音。需要关闭时可设置：

```bash
CUA_LARK_NOTIFY_TASK_COMPLETE=false
CUA_LARK_NOTIFY_EVAL_COMPLETE=false
CUA_LARK_COMPLETION_DIALOG=false
```

赛前或更换机器后，可以运行中文环境检查：

```bash
pnpm run doctor
```

检查项包括 Node.js、输出目录、模型配置、目标应用、完成通知、macOS 辅助功能权限和屏幕录制权限。

## 运行

自定义自然语言任务：

```bash
pnpm task "打开飞书视频会议页面，点击预约会议，进入预约会议表单后停止"
```

自然语言评测任务，会同时执行、校验并生成中文测试输出：

```bash
pnpm eval:nl "打开日历，创建一个明天下午2点的会议，标题为'项目周报'，邀请刘骏翔参加，保存后停止"
```

可选指定关键文本校验：

```bash
EVAL_NL_REQUIRED_TEXTS="项目周报|刘骏翔" pnpm eval:nl "打开日历，创建一个明天下午2点的会议，标题为'项目周报'，邀请刘骏翔参加，保存后停止"
```

输出包括单次 `report.md/report.json`、评测 `summary.md/summary.json` 和中文 HTML 看板。

兼容别名：

```bash
pnpm task:gui "在IM中搜索'测试群'，发送一条消息'Hello World'，并确认发送成功"
```

任务群驱动：

```bash
pnpm task:inbox
```

`task:inbox` 会进入 `TASK_INBOX_GROUP_NAME` 指定的 IM 任务群，读取最新任务消息，用 VLM 提取自然语言任务，执行后按配置返回任务群回写状态。

内置 demo：

```bash
pnpm demo:vc
pnpm demo:im
pnpm demo:docs
pnpm demo:calendar
pnpm demo:cross
```

`demo:vc` 默认只进入预约会议表单，不点击最终保存、预约、创建或发送邀请。
`demo:calendar` 面向测试账号，会按提示创建日历会议并添加参会人。
`demo:cross` 演示 IM 任务群 -> 日历确认邀请 -> 回到 IM 验证/回写状态的跨产品联动。

## 输出

每次运行生成：

```text
runs/
  {runId}/
    screenshots/
      gui-turn-1.png
      ...
    report.md
    report.json
```

报告包含：

- 任务原始提示词
- 产品类型和解析目标
- 最终状态
- 每轮 UI-TARS 状态
- 动作数
- 截图路径
- raw `prediction`
- `parsedPrediction`
- 错误信息

`report.json` 是 M4 评测体系使用的机器可读单次运行报告，包含同样的任务元数据、最终状态、耗时、轮次、截图路径和模型预测结果。

workflow 运行会额外生成：

```text
runs/
  {workflowRunId}/
    workflow-report.md
    workflow-report.json
```

workflow 报告包含 `productTrail`、`workflowPhases`、`advancedEvents`、`recoveryCount`，用于展示跨产品联动、异常处理和自愈重试。

## M4 评测体系

M4 增加批量评测、结构化指标和静态 HTML 看板。默认用例集位于 [eval/cases/m4-smoke.json](/Users/erokin/develop/CUA-Lark/eval/cases/m4-smoke.json)，覆盖 IM、Docs、VC、Calendar 四类场景。

需要编辑评测任务时，直接修改 [eval/cases/m4-smoke.json](/Users/erokin/develop/CUA-Lark/eval/cases/m4-smoke.json)。字段说明见 [eval/cases/README.md](/Users/erokin/develop/CUA-Lark/eval/cases/README.md)。也可以新建一个 JSON 文件，然后通过 `EVAL_CASE_SET=eval/cases/your-cases.json` 指定。

当前默认任务面向测试账号，允许真实发送测试消息、保存会议预约等闭环动作。

自然语言驱动测试可以直接覆盖多产品场景，例如：

- `在飞书中创建一个名为'项目周报'的新文档，并输入标题'2026年Q2项目进展'`
- `打开日历，创建一个明天下午2点的会议，邀请张三参加`
- `在IM中搜索'测试群'，发送一条消息'Hello World'，并确认发送成功`

在线批量执行真实飞书用例：

```bash
pnpm eval
```

打开可视化测试控制台：

```bash
pnpm eval:ui
```

控制台默认监听 `http://127.0.0.1:4317`，提供一键执行全部、M4 全量、M5 跨产品联动、离线看板、环境检查、任务群入口和跨产品 demo 按钮。页面会实时显示终端日志，并可打开最新看板。

控制台里的“自然语言执行测试”可以直接输入任意测试命令和可选关键文本，点击后会执行真实任务、做结果校验并生成中文报告。

录制 demo 时可以打开 [docs/demo-test-cases.md](/Users/erokin/develop/CUA-Lark/docs/demo-test-cases.md)，里面按顺序列出了每个测试用例的自然语言命令和单独执行命令。可视化控制台也会读取这些评测用例，并在“测试用例清单”中提供逐条执行按钮。

命令行一键执行 M4 + M5：

```bash
pnpm eval:all
```

只跑前 N 条用例：

```bash
EVAL_MAX_CASES=1 pnpm eval
```

只跑指定用例：

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=calendar-create-meeting pnpm eval
```

离线汇总已有 `runs/`：

```bash
pnpm eval:offline
```

每次评测输出：

```text
runs/evaluations/
  {evalRunId}/
    summary.json
    summary.md
    index.html
  latest.html
```

`index.html` 是中文可视化测试控制台，包含评测完成状态、测试启动器、核心指标、执行流程、按产品成功率进度条、失败原因分布，以及可搜索/筛选的用例明细表。测试启动器会根据在线/离线模式、用例数量、安全草稿模式、VLM 复核和失败即停设置生成可复制的终端命令。

每次评测结束后，终端会输出当前看板的 `file://` 链接，并刷新 `runs/evaluations/latest.html` 作为最新看板固定入口，便于快速访问或放进演示材料。

指标包含：

- 总成功率、通过数、失败数
- 平均耗时、平均轮次、平均动作数
- 按产品线统计的成功率
- 失败原因分布
- 每条用例的原始 `report.md` / `report.json` 路径

规则判定默认检查 `finalStatus`、最大耗时、最大轮次、必需文本、必需动作类型和禁止文本。需要语义复核时可设置 `EVAL_VLM_VERIFY=true`，使用当前 `UI_TARS_*` 或 `VLM_*` 模型配置对运行证据做额外判断。

进阶能力用例位于 [eval/cases/m5-advanced.json](/Users/erokin/develop/CUA-Lark/eval/cases/m5-advanced.json)，包含 IM -> Calendar -> IM 的跨产品 workflow：

```bash
EVAL_CASE_SET=eval/cases/m5-advanced.json EVAL_MAX_CASES=1 pnpm eval
```

中文看板会在“进阶能力”区域展示 workflow 用例数、跨产品用例数、阶段通过率、自愈重试次数和异常/进阶事件分布。

## 页面操作提示

页面专属描述已解耦在 [src/context/operation-catalog.ts](/Users/erokin/develop/CUA-Lark/src/context/operation-catalog.ts)。运行任务时，CUA-Lark 会根据 `task.product` 和用户提示词自动选择少量相关上下文拼进 `GUIAgent.run(instruction)`。

当前内置 context：

- `global-command-search`: 飞书全局搜索 / Command+K
- `global-resilience`: 异常场景处理 / 自愈执行
- `im-task-inbox`: IM 任务群收件箱 / 状态回写
- `im-chat-send-message`: IM 聊天发送消息
- `docs-create-document`: 云文档创建与编辑
- `calendar-create-event`: 日历创建日程 / 会议
- `calendar-invite-confirm`: 日历邀请确认 / 跨产品跳转
- `vc-home-schedule-meeting`: 视频会议首页预约会议

你可以直接修改 catalog 中的 `description`、`commonActions` 和 `safetyRules`。这些内容只作为自然语言上下文传给 UI-TARS，不会修改 UI-TARS SDK，也不会外部强制坐标。

需要手动指定上下文时：

```bash
TASK_CONTEXT_IDS=global-command-search,vc-home-schedule-meeting pnpm task "打开飞书视频会议页面，点击预约会议，进入预约会议表单后停止"
```

## 项目结构

```text
src/
  config/env.ts
  core/
    agent.ts
    logger.ts
    native-gui-agent.ts
    types.ts
  context/operation-catalog.ts
  reporter/report-generator.ts
  tasks/task-factory.ts
  utils/
    file.ts
    time.ts
  index.ts
```

## 设计原则

- UI-TARS `GUIAgent` 是唯一主执行内核。
- CUA-Lark 不再外部强制拆解点击坐标、区域先验或辅助定位。
- 产品知识只作为自然语言 instruction 的上下文，不作为外部坐标约束。
- 后续创新优先围绕 UI-TARS 的 system prompt、任务模板、安全拦截、报告评测和失败复盘做增强。
