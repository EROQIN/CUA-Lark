import type { TestScenario } from "../core/types.js";

export const manualPositionDemoScenario: TestScenario = {
  name: "M1 Manual Position Demo",
  actions: [
    {
      id: "m1-001",
      type: "screenshot",
      description: "采集当前飞书窗口截图"
    },
    {
      id: "m1-002",
      type: "wait",
      description: "等待 1 秒",
      timeoutMs: 1000
    },
    {
      id: "m1-003",
      type: "click",
      description: "点击飞书搜索框",
      target: "飞书搜索框",
      position: { x: 300, y: 80 }
    },
    {
      id: "m1-004",
      type: "type_text",
      description: "输入测试群关键词",
      target: "飞书搜索框",
      text: "测试群"
    },
    {
      id: "m1-005",
      type: "wait",
      description: "等待搜索结果加载 1 秒",
      timeoutMs: 1000
    },
    {
      id: "m1-006",
      type: "screenshot",
      description: "采集搜索结果截图"
    }
  ]
};

export const vlmGroundingDemoScenario: TestScenario = {
  name: "M1.5 VLM Grounding Demo",
  actions: [
    {
      id: "m15-001",
      type: "screenshot",
      description: "记录当前飞书首页截图"
    },
    {
      id: "m15-002",
      type: "click",
      description: "点击飞书顶部搜索框",
      target: "飞书桌面端顶部的搜索框，通常位于窗口上方，可以搜索联系人、群聊、文档或消息"
    },
    {
      id: "m15-003",
      type: "type_text",
      description: "输入测试群关键词",
      target: "当前已经获得焦点的搜索输入框",
      text: "测试群"
    },
    {
      id: "m15-004",
      type: "wait",
      description: "等待搜索结果出现",
      timeoutMs: 1000
    },
    {
      id: "m15-005",
      type: "screenshot",
      description: "记录搜索结果截图"
    }
  ]
};
