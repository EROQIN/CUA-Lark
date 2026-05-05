# CUA-Lark Demo 命令速查

这份文档专门用于录制 demo 视频时复制命令。建议把它和飞书、终端、报告页面并排打开。

## 0. 推荐录屏顺序

1. 启动可视化测试控制台。
2. 展示用例文件来自可编辑 JSON。
3. 执行一条自然语言测试，展示单次任务报告 UI。
4. 执行 M4 小批量评测，展示成功率、耗时、步骤数、动作数。
5. 执行 M5 跨产品联动，展示 IM -> 日历 -> IM。
6. 打开评测历史看板，点击单条“报告界面”进入任务复盘。

讲解主线：

```text
CUA-Lark 不只是让 Agent 完成一次操作，而是把自然语言测试、真实飞书执行、规则校验、结构化报告和可视化复盘串成闭环。
```

## 1. 录制前环境检查

```bash
pnpm run doctor
```

```bash
pnpm lint
```

建议录制前设置：

```bash
export TASK_SEND_REAL_MESSAGE=true
export TASK_INBOX_GROUP_NAME="任务群"
export TASK_AUTO_REPLY_STATUS=true
export TASK_SELF_HEAL_RETRIES=1
export CUA_LARK_COMPLETION_DIALOG=true
export CUA_LARK_OPEN_TASK_REPORT_UI=true
```

## 2. 启动可视化测试控制台

```bash
pnpm eval:ui
```

讲解词：

```text
这是面向演示和测试人员的控制台，可以点按钮执行 M4、M5、离线汇总、自然语言临时测试，也可以从用例清单中逐条执行。
```

## 3. 打开全量评测历史看板

```bash
open runs/evaluations/history.html
```

讲解词：

```text
这里是评测历史总览，顶部展示成功率、总耗时、平均耗时、总轮次、总动作数；下方可以按产品和结果筛选，并跳转到每条任务的报告界面。
```

## 4. 离线刷新看板

适合录制现场兜底，速度快，不会重新操作飞书：

```bash
pnpm eval:offline
```

```bash
open runs/evaluations/history.html
```

讲解词：

```text
离线模式会扫描已有 runs，重新生成 summary.json、summary.md 和 HTML 看板，用来复盘历史执行数据。
```

## 5. 自然语言执行单条测试

### IM 发消息

```bash
EVAL_NL_REQUIRED_TEXTS="Hello World" pnpm eval:nl "在IM中搜索'测试群'，发送一条消息'Hello World'，并确认发送成功"
```

### 创建云文档

```bash
EVAL_NL_REQUIRED_TEXTS="2026年Q2项目进展" pnpm eval:nl "在飞书中创建一个名为'项目周报'的新文档，并输入标题'2026年Q2项目进展'"
```

### 创建日历会议

```bash
EVAL_NL_REQUIRED_TEXTS="项目周报|刘骏翔" pnpm eval:nl "打开日历，创建一个明天下午2点的会议，标题为'项目周报'，邀请刘骏翔参加，保存后停止"
```

讲解词：

```text
这里输入的是自然语言测试命令。执行结束后会自动生成单次报告界面，里面能看到核心指标、截图、模型思考和实际执行动作。
```

## 6. 单次任务报告 UI 展示

执行任意单条任务后会自动打开：

```text
runs/{runId}/index.html
```

如果要打开当前样例：

```bash
open runs/20260504-223057-evinb9/index.html
```

讲解词：

```text
单次报告页面用于复盘一条任务。顶部是状态和核心指标；中间是截图、思考、执行的证据链；右侧可以导出 Markdown、JSON，或者打印成 PDF，也可以返回评测历史总览。
```

## 7. M4 小批量评测

录制时推荐先跑 1 到 2 条，避免等待太久：

```bash
EVAL_MAX_CASES=2 TASK_SEND_REAL_MESSAGE=true pnpm eval
```

只跑 1 条更稳：

```bash
EVAL_MAX_CASES=1 TASK_SEND_REAL_MESSAGE=true pnpm eval
```

讲解词：

```text
M4 的目标是评估体系：加载用例、执行真实飞书任务、校验结果、输出结构化报告，并自动统计成功率、耗时和步骤数。
```

## 8. M4 指定用例执行

### 视频会议预约

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=vc-schedule-form pnpm eval
```

### 视频会议预约并添加参会人

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=vc-schedule-with-attendee pnpm eval
```

### 日历会议

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=calendar-create-meeting pnpm eval
```

### 创建云文档

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=docs-create-title pnpm eval
```

### 打开云文档入口

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=docs-open-existing pnpm eval
```

### 打开测试群

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=im-open-chat pnpm eval
```

### 发送 IM 测试消息

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=im-send-message pnpm eval
```

## 9. M5 跨产品联动演示

推荐先确保飞书 `任务群` 里有日历邀请或日历任务消息。

```bash
EVAL_CASE_SET=eval/cases/m5-advanced.json EVAL_CASE_IDS=cross-im-calendar-invite-confirm pnpm eval
```

或者直接跑固定 demo：

```bash
pnpm demo:cross
```

讲解词：

```text
这条用例展示跨产品联动：Agent 从 IM 任务群读取任务，跳转日历确认参与，再回到 IM 回写状态。报告里会记录产品链路、阶段、异常事件和自愈重试信息。
```

## 10. 任务群自然语言驱动

```bash
pnpm task:inbox
```

讲解词：

```text
任务群模式把 IM 群聊作为测试任务入口。Agent 先进入任务群读取最新任务，再按任务内容执行，并在完成后回写状态。
```

## 11. 一键执行全部

```bash
pnpm eval:all
```

讲解词：

```text
一键模式会连续执行 M4 和 M5 用例集，适合展示完整能力，但录制现场耗时较长，建议准备离线看板兜底。
```

## 12. 打开用例文件

```bash
code eval/cases/m4-smoke.json
```

```bash
code eval/cases/m5-advanced.json
```

讲解词：

```text
测试用例是可编辑文件。每条用例包含自然语言 instruction、产品类型、最大轮次、是否真实发送，以及 expected 校验规则。
```

## 13. 打开输出文件

全量历史总览：

```bash
open runs/evaluations/history.html
```

最近一次评测：

```bash
open runs/evaluations/latest.html
```

当前样例单次报告：

```bash
open runs/20260504-223057-evinb9/index.html
```

当前样例 Markdown：

```bash
open runs/20260504-223057-evinb9/report.md
```

当前样例 JSON：

```bash
open runs/20260504-223057-evinb9/report.json
```

## 14. 现场兜底命令

如果真实飞书执行不稳定，切到离线复盘：

```bash
pnpm eval:offline && open runs/evaluations/history.html
```

如果只想演示单次报告 UI：

```bash
open runs/20260504-223057-evinb9/index.html
```

如果不想任务结束自动打开页面：

```bash
CUA_LARK_OPEN_TASK_REPORT_UI=false pnpm task "在IM中搜索'测试群'，发送一条消息'Hello World'，并确认发送成功"
```

如果想减少在线评测耗时：

```bash
EVAL_MAX_CASES=1 pnpm eval
```

## 15. 结束总结词

```text
CUA-Lark 的 M4 评估体系已经形成闭环：测试人员用自然语言或用例文件定义任务，Agent 在飞书桌面端真实执行，系统自动校验结果，并输出 summary.json、summary.md、总览看板和单次任务报告界面。这样既能演示能力，也能量化成功率、耗时、步骤数和动作数，用来持续优化。
```
