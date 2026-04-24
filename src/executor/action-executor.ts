import type { AgentAction, LocateResult, Position } from "../core/types.js";
import type { UiTarsDesktopOperator } from "../core/ui-tars-operator.js";

const clickLikeActions = new Set<AgentAction["type"]>(["click", "double_click", "right_click"]);

export class ActionExecutor {
  constructor(private readonly desktopOperator: UiTarsDesktopOperator) {}

  async execute(action: AgentAction, locateResult?: LocateResult): Promise<void> {
    const point = this.resolvePoint(action, locateResult);
    await this.desktopOperator.executeAction(action, point);
  }

  private resolvePoint(action: AgentAction, locateResult?: LocateResult): Position | undefined {
    if (!clickLikeActions.has(action.type)) {
      return locateResult?.point ?? action.position;
    }

    const point = locateResult?.point ?? action.position;
    if (!point) {
      throw new Error(
        `ActionExecutor ${action.type} requires a coordinate. Target: ${action.target ?? "(none)"}. Provide action.position or implement HybridLocator.`
      );
    }
    return point;
  }
}
