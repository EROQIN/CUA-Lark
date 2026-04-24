# CUA-Lark

CUA-Lark 是一个面向飞书/Lark 桌面客户端的 Computer-Use Agent 测试框架原型。M1 阶段基于 UI-TARS-desktop SDK 的桌面自动化能力搭建最小闭环：截图采集、单步动作执行、状态记录、简单验证和 Markdown 报告输出。

## M1 目标

第一阶段只做工程地基，不做完整 Planner 和端到端业务流：

- 截图保存到 `runs/{runId}/screenshots/`
- 使用手动坐标执行单步点击、输入、等待、快捷键等动作
- 为后续 Hybrid Locator 预留视觉、OCR、Accessibility Tree、DOM、历史轨迹和布局先验扩展点
- 每次运行生成 `runs/{runId}/report.md`

## 安装

```bash
pnpm install
```

Node.js 版本建议 `>=20`。

## 环境变量

复制 `.env.example` 为 `.env` 后按需修改：

- `CUA_LARK_RUNS_DIR`: 运行报告目录，默认 `runs`
- `CUA_LARK_TARGET_APP`: 运行场景前自动激活的应用名，默认 `飞书,Lark`
- `CUA_LARK_ACTIVATION_DELAY_MS`: 激活应用后等待多久再开始截图，默认 `1000`
- `CUA_LARK_SCREENSHOT_FALLBACK`: UI-TARS 截图失败时是否使用 macOS `screencapture` 兜底
- `CUA_LARK_ACTION_FALLBACK`: UI-TARS 动作执行失败时是否使用 macOS `osascript` 兜底
- `VLM_PROVIDER`: VLM 提供方，当前仅支持 `openai-compatible`
- `VLM_BASE_URL`: OpenAI-compatible API 地址，默认 `https://api.openai.com/v1`
- `VLM_API_KEY`: VLM API Key，运行 VLM 定位 Demo 时必填
- `VLM_MODEL`: 视觉模型，默认 `gpt-4o`
- `VLM_TEMPERATURE`: 采样温度，默认 `0`
- `VLM_MAX_TOKENS`: 最大输出 token，默认 `1024`
- `VLM_TIMEOUT_MS`: VLM 请求超时，默认 `60000`
- `UI_TARS_BASE_URL` / `UI_TARS_API_KEY` / `UI_TARS_MODEL`: 后续接入 UI-TARS `GUIAgent` 和 VLM Planner 时使用

## 运行 M1 Demo

先打开飞书桌面端。Demo 会在开始前自动尝试把 `飞书` 或 `Lark` 拉到前台，所以不需要手动从 VS Code 切窗口。macOS 首次执行点击/输入时，需要给终端或 VS Code/Codex 应用授予“辅助功能/屏幕录制”权限。

```bash
pnpm demo:m1
```

也可以显式运行手动坐标模式：

```bash
pnpm demo:m1:manual
```

如果你的客户端名称不是默认值，可以在 `.env` 中改：

```bash
CUA_LARK_TARGET_APP=飞书
```

运行后会生成：

```text
runs/
  {runId}/
    screenshots/
      step-0-before.png
      step-0-after.png
      ...
    report.md
```

也可以单独执行：

```bash
pnpm build
pnpm start
```

## M1.5 VLM Grounding

M1.5 在手动坐标模式之外增加视觉定位链路：

```text
截图 -> VLM 理解截图 -> 返回目标元素坐标 -> Hybrid Locator -> Executor -> Report
```

配置 `.env`：

```bash
VLM_PROVIDER=openai-compatible
VLM_BASE_URL=https://api.openai.com/v1
VLM_API_KEY=your_api_key_here
VLM_MODEL=gpt-4o
VLM_TEMPERATURE=0
VLM_MAX_TOKENS=1024
VLM_TIMEOUT_MS=60000
```

运行 VLM Demo：

```bash
pnpm demo:m1:vlm
```

运行 M2 IM 自由 Planner Demo：

```bash
pnpm demo:m2:im
```

M2 会真实发送一条带时间戳的测试消息到 `M2_GROUP_NAME` 指定的群聊，默认：

```text
CUA-Lark 自动化测试消息 {ISO timestamp}
```

可配置项：

```bash
M2_MAX_TURNS=12
M2_STEP_DELAY_MS=800
M2_GROUP_NAME=测试群
M2_SEND_REAL_MESSAGE=true
```

M2 每一轮都会截图并调用 VLM Planner，由模型根据当前截图决定下一步动作，例如点击全局搜索、输入群名、点击搜索结果、定位输入框、输入消息、发送和验证。点击类动作仍由 `HybridLocator` 根据 planner 给出的语义目标执行 VLM 定位。

VLM 必须返回严格 JSON，格式类似：

```json
{
  "success": true,
  "target": "飞书顶部搜索框",
  "candidates": [
    {
      "label": "顶部搜索框",
      "description": "位于飞书窗口顶部的搜索输入框",
      "bbox": [120, 48, 520, 88],
      "point": { "x": 320, "y": 68 },
      "confidence": 0.86,
      "reason": "该区域形态类似搜索输入框"
    }
  ]
}
```

当前限制：

- 只支持 OpenAI-compatible Chat Completions 视觉请求。
- `HybridLocator` 仅融合 manual position 和 VLM grounding，暂未接入 OCR / Accessibility Tree。
- M2 Planner 是自由决策，模型可能选择非最优路径；报告会保留每轮 raw response 便于调试。
- VLM 坐标按截图原始像素处理；如果系统缩放和执行坐标不一致，点击可能偏移。
- `StateVerifier` 仍是 placeholder，尚未做 OCR、像素 diff 或 VLM 语义验证。

失败排查：

- `VLM_API_KEY is required when using VLM locator`: `.env` 未配置 `VLM_API_KEY`。
- 模型返回图片输入相关错误：当前 `VLM_MODEL` 不支持图片输入。
- 报告显示目标不可见：确认飞书窗口已打开，目标元素在截图中可见。
- `vlm parse error`: 模型没有返回严格 JSON，可调低温度或换更稳定的视觉模型。
- `planner parse error`: M2 Planner 没有返回合法动作 JSON，查看报告中的 Planner Raw Response。
- `max_turns`: M2 在限定轮数内没有完成任务，可提高 `M2_MAX_TURNS` 或缩小任务目标。
- 点击位置偏移：检查截图分辨率、macOS 缩放和 UI-TARS/nut-js 坐标缩放。
- 截图只显示背景或不含窗口：给 VS Code/Codex/Terminal 授予“屏幕录制”和“辅助功能”权限。

## 修改手动坐标

M1 Demo 的坐标在 `src/scenarios/single-step-demo.ts`：

```ts
position: { x: 300, y: 80 }
```

不同屏幕分辨率和飞书窗口位置会导致坐标不同。请根据自己的飞书窗口位置修改搜索框坐标。M2/M3 会逐步由 Hybrid Locator 自动定位目标，不再依赖手动坐标。

## 当前能力边界

- `HybridLocator` 目前支持 `action.position` 和 VLM grounding，没有真正做 OCR/可访问性融合。
- `StateVerifier` 目前对非等待/截图动作使用 placeholder 成功规则。
- Demo 是手写单步任务，不包含自然语言规划。
- macOS 兜底执行依赖系统辅助功能权限；其他平台建议优先配置 UI-TARS operator 执行链路。

## 下一阶段计划

- 实现 OCR 文本识别
- 接入 Accessibility Tree
- 实现 Hybrid Locator 多源融合评分
- 将 M2 IM 流程升级为 OCR + Accessibility Tree 辅助验证
