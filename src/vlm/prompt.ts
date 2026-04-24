import type { VLMGroundingRequest } from "./types.js";

export const VLM_GROUNDING_SYSTEM_PROMPT = [
  "你是飞书/Lark 桌面端 GUI 视觉定位助手。",
  "你会收到一张桌面截图、一个自然语言目标和动作类型。",
  "你的任务是在截图原始像素坐标系中定位目标 UI 元素。",
  "只输出严格 JSON，不输出 Markdown，不输出解释性前后缀。",
  "bbox 格式必须是 [x1, y1, x2, y2]，point 必须是 {\"x\": number, \"y\": number}。",
  "point 应落在 bbox 中心或真实可点击区域。",
  "如果不确定，降低 confidence；不要编造高置信度结果。",
  "如果有多个相似元素，按 confidence 从高到低放入 candidates。",
  "找不到目标时返回 success=false、candidates=[]，并给出 error。"
].join("\n");

export function buildGroundingUserPrompt(request: VLMGroundingRequest): string {
  const hints = request.hints ? `\n额外提示：${JSON.stringify(request.hints)}` : "";
  const instruction = request.instruction ? `\n执行说明：${request.instruction}` : "";

  return [
    "请在这张飞书/Lark 桌面截图中定位目标元素。",
    "",
    `目标：${request.target}`,
    `动作：${request.actionType}`,
    instruction,
    hints,
    "",
    "请返回如下 JSON 结构：",
    "{",
    '  "success": true,',
    '  "target": "目标名称",',
    '  "candidates": [',
    "    {",
    '      "label": "元素短标签",',
    '      "description": "元素在界面中的位置和形态描述",',
    '      "bbox": [120, 48, 520, 88],',
    '      "point": { "x": 320, "y": 68 },',
    '      "confidence": 0.86,',
    '      "reason": "为什么认为这是目标元素"',
    "    }",
    "  ]",
    "}",
    "",
    "如果目标不可见，请返回：",
    "{",
    '  "success": false,',
    `  "target": ${JSON.stringify(request.target)},`,
    '  "candidates": [],',
    '  "error": "目标元素在当前截图中不可见"',
    "}"
  ]
    .filter(Boolean)
    .join("\n");
}
