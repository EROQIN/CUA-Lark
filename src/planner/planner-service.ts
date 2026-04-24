import { buildPlannerUserPrompt, PLANNER_SYSTEM_PROMPT } from "./prompt.js";
import type { PlannerActionType, PlannerDecision, PlannerResult, PlannerState } from "./types.js";
import type { VLMClient } from "../vlm/vlm-client.js";

const allowedActions = new Set<PlannerActionType>(["locate_and_click", "type_text", "hotkey", "wait", "screenshot", "finish", "fail"]);

export class PlannerService {
  constructor(private readonly vlmClient: VLMClient) {}

  async planNext(state: PlannerState): Promise<PlannerResult> {
    const completion = await this.vlmClient.completeJsonWithImage({
      screenshotPath: state.screenshotPath,
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      userPrompt: buildPlannerUserPrompt(state)
    });

    if (!completion.success) {
      return {
        success: false,
        rawResponse: completion.rawResponse,
        error: completion.error
      };
    }

    const validation = validateDecision(completion.data);
    if (!validation.success) {
      return {
        success: false,
        rawResponse: completion.rawResponse,
        error: validation.error
      };
    }

    return {
      success: true,
      rawResponse: completion.rawResponse,
      decision: validation.decision
    };
  }
}

function validateDecision(data: unknown): { success: true; decision: PlannerDecision } | { success: false; error: string } {
  if (!data || typeof data !== "object") {
    return { success: false, error: "planner parse error: response is not an object" };
  }

  const value = data as Partial<PlannerDecision>;
  if (typeof value.thought !== "string" || typeof value.reason !== "string" || typeof value.nextAction !== "string") {
    return { success: false, error: "planner parse error: missing thought, nextAction, or reason" };
  }

  if (!allowedActions.has(value.nextAction as PlannerActionType)) {
    return { success: false, error: `planner parse error: unsupported action ${value.nextAction}` };
  }

  const nextAction = value.nextAction as PlannerActionType;
  if (nextAction === "locate_and_click" && typeof value.target !== "string") {
    return { success: false, error: "planner parse error: locate_and_click requires target" };
  }
  if (nextAction === "type_text" && typeof value.text !== "string") {
    return { success: false, error: "planner parse error: type_text requires text" };
  }
  if (nextAction === "hotkey" && (!Array.isArray(value.hotkeys) || !value.hotkeys.every((key) => typeof key === "string"))) {
    return { success: false, error: "planner parse error: hotkey requires hotkeys" };
  }

  return {
    success: true,
    decision: {
      thought: value.thought,
      nextAction,
      target: value.target,
      text: value.text,
      hotkeys: value.hotkeys,
      timeoutMs: typeof value.timeoutMs === "number" ? value.timeoutMs : undefined,
      successCriteria: value.successCriteria,
      reason: value.reason
    }
  };
}
