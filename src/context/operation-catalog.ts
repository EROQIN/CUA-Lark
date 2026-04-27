import type { AgentTask, OperationContext, ProductType } from "../core/types.js";

export const operationContexts: OperationContext[] = [
  {
    id: "global-command-search",
    product: "auto",
    title: "飞书全局搜索 / Command+K",
    triggers: ["搜索", "切换", "打开", "进入", "群", "联系人", "云文档", "视频会议"],
    whenToUse: "需要切换飞书子产品、打开已有群聊/联系人/文档，或从未知页面快速导航时使用。",
    description: [
      "Command+K 会打开飞书内置搜索，打开后焦点通常已经在搜索输入框。",
      "全局搜索适合打开已有对象或切换页面，不适合完成当前页面内的业务操作。"
    ],
    commonActions: [
      "打开已有群聊或联系人：Command+K -> 输入名称 -> Enter 或点击匹配结果。",
      "进入子产品页面：Command+K -> 输入“消息 / 云文档 / 视频会议”等产品名 -> Enter 或点击匹配结果。",
      "如果搜索无结果或搜索面板挡住当前页面，按 Escape 退出搜索面板。"
    ],
    safetyRules: [
      "不要用全局搜索搜索“新建云文档”“预约会议”“创建日程”等操作意图,这里是搜索不到的。",
      "进入目标页面后，场景内操作应基于当前页面可见按钮和输入框完成。"
    ]
  },
  {
    id: "im-chat-send-message",
    product: "im",
    title: "IM 聊天发送消息",
    triggers: ["IM", "消息", "群", "联系人", "聊天", "发送"],
    whenToUse: "任务要求搜索群聊/联系人并发送文本消息时使用。",
    description: [
      "IM 页面通常包含会话列表、聊天消息区和底部消息输入框。",
      "进入目标会话后，应先确认聊天标题或消息区显示的是目标群聊/联系人。",
      "消息发送需要先聚焦输入框，输入消息内容后按 Enter 发送。",
      "使用@+联系人可以提及特定成员，但这些操作不是发送消息的必要条件。"

      
    ],
    commonActions: [
      "如果目标会话未打开，优先使用 Command+K 搜索群聊或联系人名称。",
      "进入会话后点击底部消息输入框，使其获得焦点。",
      "输入框已聚焦时，可以输入完整消息并按 Enter 发送。"
    ],
    safetyRules: [
      "只有看到消息出现在聊天时间线，才能认为发送成功。",
      "如果不确定当前会话是否是目标会话，不要发送消息。"
    ]
  },
  {
    id: "docs-create-document",
    product: "docs",
    title: "云文档创建与编辑",
    triggers: ["云文档", "文档", "Docs", "新建", "标题", "正文"],
    whenToUse: "任务要求创建文档、输入标题或编辑正文时使用。",
    description: [
      "云文档页面通常有左侧导航、文档列表/目录区域和右侧内容区域。",
      "新建文档属于页面内操作，应在云文档页面中寻找“我的文档库”右侧的“+”等可见入口。",
      "当把鼠标悬置在文档列表上的文档时，该文档块的右侧会出现“+”和“...”等按钮，点击这些按钮会出现具体的文档操作选项，+号对应的操作为添加，...号对应的操作为更多，例如收藏/添加到置顶等操作。",
      "进入文档编辑器后，标题区域和正文区域都是可见的输入框，点击后即可输入内容，修改标题区域可以实现重命名。",
      "文档编辑器右上角的“...”也是更多操作菜单的意思，“+”也是添加子页面的意思，但这些按钮不是编辑文档的必要条件。",
      "当鼠标悬浮于文档编辑器中的标题时，会出现‘添加图标’和‘添加封面’按钮，这些按钮不是编辑文档的必要条件。",
      "** 当你不知道该怎么做时，可以尝试让鼠标光标悬停在不同按钮上观察其功能 **"
      

    ],
    commonActions: [
      "如果不在云文档页面，可先用 Command+K 搜索“云文档”进入。",
      "进入云文档后，在当前页面寻找新建入口；如果弹出菜单，选择空白文档或文档类型。",
      "进入编辑器后，点击标题区域输入标题；如有正文要求，再点击正文区域输入正文。"
    ],
    safetyRules: [
      "不要用 Command+K 搜索“新建云文档”或把文档标题输入到全局搜索框。",
      "只有看到目标标题或正文出现在文档编辑界面，才能结束。"
    ]
  },
  {
    id: "vc-home-schedule-meeting",
    product: "vc",
    title: "视频会议首页预约会议",
    triggers: ["视频会议", "VC", "会议", "预约会议", "预定会议", "安排会议"],
    whenToUse: "任务要求进入视频会议页面并点击预约会议时使用。",
    description: [
      "视频会议首页通常有“发起会议”“加入会议”“预约会议”“网络研讨会”等卡片。",
      "预约会议是视频会议页面内的业务入口，不是全局搜索关键词。"
    ],
    commonActions: [
      "如果不在视频会议页面，可先用 Command+K 搜索“视频会议”进入。",
      "在视频会议首页中点击可见的“预约会议”入口。",
      "进入预约会议表单后，可根据任务要求填写主题、时间和参会人等信息",
      "在预约会议表单中，你可以通过点击显示为日期的按钮进行修改相关信息",
      "页面中的大部分信息都是可以点击然后编辑的，你可以尝试点击这些信息来完成会议的预约",

    ],
    safetyRules: [
      "不要把“预约会议”输入到全局搜索中反复搜索。"
    ]
  }
];

export function selectOperationContexts(task: AgentTask, maxContexts = 3): OperationContext[] {
  const explicit = selectExplicitContexts(task.contextIds);
  const scored = operationContexts
    .filter((context) => !explicit.some((item) => item.id === context.id))
    .map((context) => ({
      context,
      score: scoreContext(context, task)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.context);

  return [...explicit, ...scored].slice(0, maxContexts);
}

export function renderOperationContexts(contexts: OperationContext[]): string {
  if (!contexts.length) {
    return "";
  }

  return [
    "按需页面操作提示：以下提示只在当前截图和任务匹配时使用；如果当前界面不符合，请忽略无关提示。",
    ...contexts.flatMap((context, index) => [
      "",
      `${index + 1}. ${context.title} (${context.id})`,
      `适用时机：${context.whenToUse}`,
      "界面理解：",
      ...context.description.map((item) => `- ${item}`),
      "常用操作：",
      ...context.commonActions.map((item) => `- ${item}`),
      "安全规则：",
      ...context.safetyRules.map((item) => `- ${item}`)
    ])
  ].join("\n");
}

function selectExplicitContexts(contextIds: string[] | undefined): OperationContext[] {
  if (!contextIds?.length) {
    return [];
  }
  const idSet = new Set(contextIds);
  return operationContexts.filter((context) => idSet.has(context.id));
}

function scoreContext(context: OperationContext, task: AgentTask): number {
  let score = 0;
  if (context.product === "auto") {
    score += 1;
  }
  if (context.product === task.product) {
    score += 5;
  }

  const haystack = [
    task.instruction,
    task.userPrompt,
    task.parsedGoal,
    task.groupName,
    task.messageContent,
    task.documentTitle,
    task.documentBody
  ]
    .filter(Boolean)
    .join(" ");

  for (const trigger of context.triggers) {
    if (haystack.includes(trigger)) {
      score += 2;
    }
  }

  return score;
}
