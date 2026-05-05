# CUA-Lark 评测任务配置

默认评测任务文件是 `m4-smoke.json`。修改这个文件即可调整 M4 批量评测任务；也可以新建其他 JSON 文件，并通过 `EVAL_CASE_SET` 指定。

进阶能力评测文件是 `m5-advanced.json`，用于跨产品联动、任务群入口、自愈重试和多阶段 workflow 演示。

## 运行

```bash
pnpm eval
```

指定其他任务文件：

```bash
EVAL_CASE_SET=eval/cases/my-cases.json pnpm eval
```

运行进阶联动用例：

```bash
EVAL_CASE_SET=eval/cases/m5-advanced.json EVAL_MAX_CASES=1 pnpm eval
```

只跑前 1 条：

```bash
EVAL_MAX_CASES=1 pnpm eval
```

只跑指定用例：

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=calendar-create-meeting pnpm eval
```

## 字段说明

- `id`: 用例唯一 ID。
- `title`: 用例中文标题，会显示在报告和看板里。
- `product`: 飞书产品线，支持 `im`、`docs`、`calendar`、`base`、`vc`、`mail`、`auto`。
- `instruction`: 传给 GUIAgent 的自然语言任务。
- `tags`: 标签数组，用于说明任务类型，例如 `m4`、`e2e`、`navigation`。
- `maxTurns`: 该用例最大 GUIAgent 轮数。
- `stepDelayMs`: 每轮操作间隔。
- `sendRealMessage`: 是否允许真实发送 IM 消息、保存会议/日程等闭环动作。测试账号环境建议为 `true`。
- `contextIds`: 注入的页面操作提示 ID。
- `expected`: 规则校验条件。
- `workflow`: 可选，多阶段编排定义；存在时在线评测会按 workflow 执行，而不是只执行单条 `instruction`。

## workflow 字段

- `id`: workflow 唯一 ID。
- `title`: workflow 中文标题。
- `entry`: `direct` 或 `im-inbox`；`direct` 按 steps 直接执行，`im-inbox` 会先读取任务群并提取最新任务。
- `inboxGroupName`: 任务群名称，默认建议为 `任务群`。
- `autoReplyStatus`: 是否回到任务群发送状态。
- `steps`: 阶段数组，每个阶段包含 `id`、`title`、`product`、`instruction`、`contextIds`、`expectedTexts`。

## expected 字段

- `finalStatus`: 期望最终状态，通常为 `success`。
- `maxDurationMs`: 最大耗时。
- `maxTurns`: 最大轮次。
- `requiredTexts`: 报告证据中必须出现的文本。
- `requiredActionTypes`: 必须出现的动作类型，例如 `type`、`click`、`finished`。
- `forbiddenTexts`: 不允许出现的文本。

当前默认任务面向测试账号，允许消息发送、预约保存、日历日程创建等真实闭环动作。若需要临时切回草稿/安全模式，可把对应用例的 `sendRealMessage` 改为 `false`，或在可视化控制台的测试启动器里勾选“IM 用例使用草稿模式”。
