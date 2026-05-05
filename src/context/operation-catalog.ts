import type { AgentTask, OperationContext, ProductType } from "../core/types.js";

export const operationContexts: OperationContext[] = [
  {
    id: "global-resilience",
    product: "auto",
    title: "异常场景处理 / 自愈执行",
    triggers: ["弹窗", "权限", "加载", "失败", "重试", "异常", "超时", "替代路径"],
    whenToUse: "遇到弹窗干扰、权限不足、页面加载慢、搜索无结果或操作路径失败时使用。",
    description: [
      "飞书桌面端可能出现升级提示、权限提示、网络/加载提示、确认弹窗或搜索空结果。",
      "弹窗遮挡目标区域时，应先判断弹窗是否与任务相关；无关弹窗优先关闭、稍后处理或按 Escape。",
      "权限不足、无访问权限、成员不存在等提示属于真实阻塞，不要强行继续执行真实提交。"
    ],
    commonActions: [
      "如果页面加载中，等待一次或刷新当前视图，再继续判断。",
      "如果 Command+K 搜索失败，尝试通过左侧产品入口或顶部导航进入目标产品。",
      "如果目标按钮不可见，尝试关闭遮挡弹窗、滚动表单或回到上一级重新进入。",
      "如果权限不足或对象不存在，停止并说明阻塞原因。"
    ],
    safetyRules: [
      "不要为了绕过权限提示而随机点击不明确按钮。",
      "自愈尝试应保持原任务目标不变，只改变进入路径或处理遮挡方式。",
      "只有看到最终状态证据后才调用 finished。"
    ]
  },
  {
    id: "global-command-search",
    product: "auto",
    title: "飞书全局搜索 / Command+K",
    triggers: ["搜索", "切换", "打开", "进入", "群", "联系人", "云文档", "日历", "日程", "视频会议"],
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
    id: "im-task-inbox",
    product: "im",
    title: "IM 任务群收件箱 / 状态回写",
    triggers: ["任务群", "任务", "收件箱", "最新消息", "执行", "状态", "汇报", "完成"],
    whenToUse: "任务要求进入 IM 任务群读取最新任务、执行后返回群聊汇报状态时使用。",
    description: [
      "任务群是自动化任务的入口，通常需要先打开群聊并查看消息区最新一条任务消息。",
      "读取任务时只需要让最新任务消息清晰可见，不要在读取阶段执行真实业务动作。",
      "执行完成后应回到任务群，发送包含状态、任务摘要和结果的简短消息。"
    ],
    commonActions: [
      "使用 Command+K 搜索任务群名称并进入对应群聊。",
      "查看消息区底部或最新消息位置，确认任务文本或任务卡片可见后停止。",
      "回写状态时在群聊输入框输入状态消息，按 Enter 发送，并确认消息出现在时间线。"
    ],
    safetyRules: [
      "读取任务阶段不要点击任务卡片里的确认、接受或跳转按钮。",
      "如果当前会话不是指定任务群，不要发送状态消息。",
      "如果最新任务不清晰或无法提取，停止并报告无法读取任务。"
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
    id: "calendar-invite-confirm",
    product: "calendar",
    title: "日历邀请确认 / 跨产品跳转",
    triggers: ["日历邀请", "接受", "确认参加", "参与", "跳转日历", "返回IM", "状态"],
    whenToUse: "任务要求从 IM 中的日历邀请或任务卡片进入日历，确认参与后返回 IM 验证状态时使用。",
    description: [
      "IM 中的日历邀请可能表现为卡片、链接或通知消息，点击后会进入日历详情或日程页面。",
      "日历详情中可能有“接受”“参加”“确认”“保存”等状态按钮，也可能已经显示为已接受。",
      "跨产品任务完成后需要回到原 IM 任务群，验证或发送完成状态。"
    ],
    commonActions: [
      "在 IM 任务消息中点击日历邀请卡片或可见的日程链接。",
      "进入日历后确认日程标题、时间和参会状态，再点击接受/确认参加/保存。",
      "完成后使用 Command+K 搜索任务群名称返回 IM，发送或验证状态消息。"
    ],
    safetyRules: [
      "如果日历详情与任务群消息中的标题或时间不一致，不要确认。",
      "如果参会状态已经是已接受，可直接把该状态作为完成证据。",
      "不要把日历邀请任务误切到视频会议预约页面。"
    ]
  },
  {
    id: "calendar-create-event",
    product: "calendar",
    title: "日历创建日程 / 会议",
    triggers: ["日历", "日程", "会议", "明天", "下午", "上午", "邀请", "参会人", "参加"],
    whenToUse: "任务要求在日历中创建日程、安排会议时间或邀请参会人时使用。",
    description: [
      "日历页面通常包含日/周/月视图、左侧日历列表、右上角或页面内的新建/创建按钮。",
      "日历里的“会议”表示日程事件；只有用户明确说“视频会议”“预约会议”时，才切换到视频会议页面。",
      "创建日程表单通常包含标题、日期、开始时间、结束时间、地点/会议方式、参会人和保存按钮。",
      "添加参会人时应优先选择与用户提示完全匹配的联系人；匹配不确定时不要随意选择。"
    ],
    commonActions: [
      "如果不在日历页面，可先用 Command+K 搜索“日历”进入。",
      "进入日历后点击可见的“新建”“创建”或加号入口，打开日程编辑表单。",
      "按任务要求填写标题、日期、开始时间、结束时间和参会人；“明天下午2点”应设置为明天 14:00。",
      "保存后确认日程出现在日历视图中，或看到创建成功/已保存提示后再结束。"
    ],
    safetyRules: [
      "不要把“创建日程”“明天下午2点会议”反复输入到全局搜索框。",
      "如果任务要求邀请参会人，保存前需要确认参会人已添加到日程表单。",
      "不要进入视频会议页面完成日历任务，除非用户明确要求视频会议或预约视频会议。"
    ]
  },
  {
    id: "vc-home-schedule-meeting",
    product: "vc",
    title: "视频会议首页预约会议",
    triggers: ["视频会议", "VC", "预约会议", "预定会议", "安排会议"],
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
