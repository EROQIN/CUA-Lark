# CUA-Lark Demo 测试用例脚本

这份文档用于录制 demo 视频时逐条执行测试。推荐先启动可视化控制台：

```bash
pnpm eval:ui
```

如果只需要复制命令和录屏话术，优先使用 [demo-commands.md](./demo-commands.md)。

也可以使用下面的命令行逐个执行。在线用例会真实操作飞书测试账号，包括发送测试消息、创建/确认日程和回写任务群状态。

## 录制前准备

```bash
pnpm run doctor
pnpm eval:offline
open runs/evaluations/history.html
```

建议环境变量：

```bash
export TASK_INBOX_GROUP_NAME="任务群"
export TASK_SEND_REAL_MESSAGE=true
export TASK_AUTO_REPLY_STATUS=true
export TASK_SELF_HEAL_RETRIES=1
export TASK_MAX_TURNS=18
export TASK_STEP_DELAY_MS=900
export CUA_LARK_COMPLETION_DIALOG=true
```

## 自然语言临时评测

录制中如果想临时输入一条测试命令，并立刻得到校验结果和中文报告，可以使用：

```bash
pnpm eval:nl "打开日历，创建一个明天下午2点的会议，标题为'项目周报'，邀请刘骏翔参加，保存后停止"
```

需要增加关键文本校验时：

```bash
EVAL_NL_REQUIRED_TEXTS="项目周报|刘骏翔" pnpm eval:nl "打开日历，创建一个明天下午2点的会议，标题为'项目周报'，邀请刘骏翔参加，保存后停止"
```

可视化控制台中也有“自然语言执行测试”区域，输入自然语言命令后会自动执行、校验并生成 `summary.md`、`summary.json`、HTML 看板和单次运行报告。

## 推荐录制顺序

1. 打开 `pnpm eval:ui`，展示“环境检查”和“离线生成/刷新看板”。
2. 从“测试用例清单”中逐条点击执行，展示每个用例的自然语言命令。
3. 最后执行“M5 跨产品联动”，展示 IM -> 日历 -> IM 的完整闭环。
4. 打开全量历史看板，讲解成功率、产品分布、进阶能力、失败原因和原始报告链接。

## M4 评估体系录屏讲法

这一段建议控制在 60 到 90 秒，重点证明“不是单次 demo，而是可批量评测、可结构化统计、可复盘”。

### 镜头 1：展示评测用例来源

打开用例文件，说明每条用例都包含自然语言指令和期望校验规则：

```bash
code eval/cases/m4-smoke.json
```

讲解点：

- `instruction` 是 Agent 真实执行的自然语言任务。
- `expected` 定义最终状态、最大耗时、最大轮次、必需动作和禁用文本。
- IM、Docs、Calendar、VC 都可以作为产品维度统计。

### 镜头 2：执行一键评测

演示最稳定的录屏方式是先跑 1 到 2 条在线用例：

```bash
EVAL_MAX_CASES=2 TASK_SEND_REAL_MESSAGE=true pnpm eval
```

如果录制现场不想等待真实飞书执行，可以使用历史 runs 刷新看板：

```bash
pnpm eval:offline
```

讲解点：

- 程序会真实打开飞书执行任务。
- 结束后自动校验结果。
- 同时生成 `summary.json`、`summary.md`、HTML 看板和单次 `report.md/report.json`。

### 镜头 3：展示结构化输出

打开全量历史看板：

```bash
open runs/evaluations/history.html
```

优先讲解页面顶部指标：

- 成功率：自动汇总通过/失败用例。
- 总耗时、平均耗时：证明评测框架能量化执行效率。
- 总轮次、平均轮次：对应 Agent 观察和决策次数。
- 总动作数、平均动作数：对应实际 GUI 操作成本。

### 镜头 4：展示可复盘证据链

在看板的“用例明细”里点击某条报告，展示单次报告：

- 先看“核心指标”，说明这条任务的耗时、步骤数、动作数。
- 再看“执行过程：截图 -> 思考 -> 执行”，说明每一步都有截图证据、模型思考和实际动作。
- 最后展开“原始模型输出与结构化动作”，说明报告既能给评委看，也能给开发者排查。

单次任务结束后会自动打开 `runs/{runId}/index.html` 报告界面。这个页面适合录屏展示：

- 顶部展示任务状态、总耗时、有效步骤、动作数。
- “导出 Markdown”“导出 JSON”“打印 / 导出 PDF”用于展示报告可交付。
- “打开全量评测历史”可以回到展示所有可读取 runs 的历史看板。
- 页面下方直接展示截图、模型思考和执行动作。

### 镜头 5：一句话总结

可以这样收束：

```text
M4 的核心不是只让 Agent 做成一次任务，而是把每次执行都沉淀成结构化报告，再自动统计成功率、耗时、步骤数和动作数，用这些指标判断能力边界并持续优化。
```

## M4 Smoke 用例

### 1. 预约视频会议并保存

- 用例 ID：`vc-schedule-form`
- 产品：视频会议
- 自然语言命令：

```text
打开飞书视频会议页面，点击预约会议，创建一个名为'CUA-Lark M4 自动化测试会议'的视频会议预约并保存，看到预约创建完成或会议出现在列表/日历后停止。
```

执行命令：

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=vc-schedule-form pnpm eval
```

### 2. 预约视频会议并添加参会人

- 用例 ID：`vc-schedule-with-attendee`
- 产品：视频会议
- 自然语言命令：

```text
打开飞书视频会议页面，点击预约会议，创建一个名为'CUA-Lark M4 参会人测试'的视频会议预约，添加参会人'刘骏翔'并保存，看到预约创建完成后停止。
```

执行命令：

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=vc-schedule-with-attendee pnpm eval
```

### 3. 创建日历会议并邀请参会人

- 用例 ID：`calendar-create-meeting`
- 产品：日历
- 自然语言命令：

```text
打开日历，创建一个明天下午2点的会议，标题为'CUA-Lark M4 日历测试会议'，邀请刘骏翔参加，保存后看到日程创建完成或出现在日历中后停止。
```

执行命令：

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=calendar-create-meeting pnpm eval
```

### 4. 创建云文档并输入标题

- 用例 ID：`docs-create-title`
- 产品：云文档
- 自然语言命令：

```text
在飞书中创建一个新的云文档，标题为'CUA-Lark M4 评测文档'，看到标题出现在文档编辑界面后停止。
```

执行命令：

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=docs-create-title pnpm eval
```

### 5. 通过搜索打开云文档入口

- 用例 ID：`docs-open-existing`
- 产品：云文档
- 自然语言命令：

```text
打开飞书云文档页面，确认已经进入云文档首页或文档列表后停止。
```

执行命令：

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=docs-open-existing pnpm eval
```

### 6. 搜索并打开测试群

- 用例 ID：`im-open-chat`
- 产品：IM
- 自然语言命令：

```text
在IM中搜索'测试群'，打开对应群聊，确认当前会话标题或消息区显示目标群聊后停止。
```

执行命令：

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=im-open-chat pnpm eval
```

### 7. 发送 IM 测试消息

- 用例 ID：`im-send-message`
- 产品：IM
- 自然语言命令：

```text
在IM中搜索'测试群'，打开对应群聊，发送一条消息'CUA-Lark M4 自动化测试消息'，看到消息出现在聊天时间线后停止。
```

执行命令：

```bash
EVAL_CASE_SET=eval/cases/m4-smoke.json EVAL_CASE_IDS=im-send-message pnpm eval
```

## M5 进阶联动用例

### 8. IM 日历邀请确认联动

- 用例 ID：`cross-im-calendar-invite-confirm`
- 产品链路：IM -> 日历 -> IM
- 总体自然语言命令：

```text
进入任务群，找到最新日历邀请或日历任务，从 IM 跳转到日历确认参与，再返回任务群发送完成状态。
```

阶段命令：

```text
1. 在IM中搜索'任务群'并打开任务群，找到最新的日历邀请或日历任务消息，确认任务消息可见后停止。不要点击确认、接受或跳转按钮。
2. 从当前任务群里的日历邀请或日历任务消息进入日历详情，确认日程标题和时间与任务一致，然后点击接受、确认参加或保存；看到状态为已接受、已参加或已保存后停止。
3. 回到IM任务群'任务群'，发送一条消息'CUA-Lark 跨产品联动测试完成：已确认日历邀请'，看到消息出现在聊天时间线后停止。
```

执行命令：

```bash
EVAL_CASE_SET=eval/cases/m5-advanced.json EVAL_CASE_IDS=cross-im-calendar-invite-confirm pnpm eval
```

也可以直接执行 demo：

```bash
pnpm demo:cross
```

## 一键命令

执行全部 M4 + M5：

```bash
pnpm eval:all
```

只生成/刷新离线看板：

```bash
pnpm eval:offline
open runs/evaluations/history.html
```
