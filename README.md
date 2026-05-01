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
- `TASK_MAX_TURNS`: GUIAgent 最大轮数
- `TASK_STEP_DELAY_MS`: 每轮间隔
- `TASK_PRODUCT`: `auto|im|docs|calendar|base|vc|mail`
- `TASK_CONTEXT_IDS`: 可选，手动指定要注入的页面操作提示 ID，逗号分隔

如果 `UI_TARS_*` 未配置，会回退读取 `VLM_BASE_URL / VLM_API_KEY / VLM_MODEL`。

macOS 需要给运行器授予“屏幕录制”和“辅助功能”权限。

## 运行

自定义自然语言任务：

```bash
pnpm task "打开飞书视频会议页面，点击预约会议，进入预约会议表单后停止"
```

兼容别名：

```bash
pnpm task:gui "在IM中搜索'测试群'，发送一条消息'Hello World'，并确认发送成功"
```

内置 demo：

```bash
pnpm demo:vc
pnpm demo:im
pnpm demo:docs
```

`demo:vc` 默认只进入预约会议表单，不点击最终保存、预约、创建或发送邀请。

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

## M4 评测体系

M4 增加批量评测、结构化指标和静态 HTML 看板。默认用例集位于 [eval/cases/m4-smoke.json](/Users/erokin/develop/CUA-Lark/eval/cases/m4-smoke.json)，覆盖 IM、Docs、VC 三类场景，每类 2 条 smoke case。

在线批量执行真实飞书用例：

```bash
pnpm eval
```

只跑前 N 条用例：

```bash
EVAL_MAX_CASES=1 TASK_SEND_REAL_MESSAGE=false pnpm eval
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
```

指标包含：

- 总成功率、通过数、失败数
- 平均耗时、平均轮次、平均动作数
- 按产品线统计的成功率
- 失败原因分布
- 每条用例的原始 `report.md` / `report.json` 路径

规则判定默认检查 `finalStatus`、最大耗时、最大轮次、必需文本、必需动作类型和禁止文本。需要语义复核时可设置 `EVAL_VLM_VERIFY=true`，使用当前 `UI_TARS_*` 或 `VLM_*` 模型配置对运行证据做额外判断。

## 页面操作提示

页面专属描述已解耦在 [src/context/operation-catalog.ts](/Users/erokin/develop/CUA-Lark/src/context/operation-catalog.ts)。运行任务时，CUA-Lark 会根据 `task.product` 和用户提示词自动选择少量相关上下文拼进 `GUIAgent.run(instruction)`。

当前内置 context：

- `global-command-search`: 飞书全局搜索 / Command+K
- `im-chat-send-message`: IM 聊天发送消息
- `docs-create-document`: 云文档创建与编辑
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
