import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { AgentAction, Position } from "./types.js";
import { sleep } from "../utils/time.js";

const execFileAsync = promisify(execFile);

interface ScreenshotOutput {
  base64: string;
  scaleFactor?: number;
}

interface NutLikeOperator {
  screenshot(): Promise<ScreenshotOutput>;
  execute?(params: unknown): Promise<unknown>;
}

interface ScreenSize {
  width: number;
  height: number;
}

export interface DesktopOperatorOptions {
  screenshotFallback: boolean;
  actionFallback: boolean;
}

export class UiTarsDesktopOperator {
  private nutOperator?: NutLikeOperator;
  private lastScreenSize?: ScreenSize;

  constructor(private readonly options: DesktopOperatorOptions) {}

  async activateFirstAvailableApplication(appNames: string[], delayMs: number): Promise<string | undefined> {
    if (!appNames.length) {
      return undefined;
    }
    if (process.platform !== "darwin") {
      throw new Error("Application activation is currently implemented for macOS only.");
    }

    const errors: string[] = [];
    for (const appName of appNames) {
      try {
        await execFileAsync("open", ["-a", appName]);
        await sleep(delayMs);
        return appName;
      } catch (error) {
        errors.push(`${appName}: ${formatError(error)}`);
      }
    }

    throw new Error(`Could not activate target app. Tried: ${errors.join("; ")}`);
  }

  async captureScreenshot(filePath: string): Promise<{ scaleFactor?: number; backend: string }> {
    try {
      const operator = await this.loadNutOperator();
      const screenshot = await operator.screenshot();
      if (!screenshot.base64) {
        throw new Error("UI-TARS screenshot returned empty base64 data");
      }
      const screenshotBuffer = Buffer.from(screenshot.base64, "base64");
      this.lastScreenSize = readImageSize(screenshotBuffer);
      await writeFile(filePath, screenshotBuffer);
      return { scaleFactor: screenshot.scaleFactor, backend: "ui-tars-nut-js" };
    } catch (error) {
      if (!this.options.screenshotFallback || process.platform !== "darwin") {
        throw new Error(`ScreenObserver screenshot failed: ${formatError(error)}`);
      }
      await execFileAsync("screencapture", ["-x", filePath]);
      this.lastScreenSize = undefined;
      return { backend: "macos-screencapture" };
    }
  }

  async executeAction(action: AgentAction, point?: Position): Promise<void> {
    if (action.type === "wait") {
      await sleep(action.timeoutMs ?? 1000);
      return;
    }

    if (action.type === "screenshot") {
      return;
    }

    if (process.env.CUA_LARK_PREFER_UI_TARS_EXECUTE === "true") {
      try {
        await this.executeViaUiTarsOperator(action, point);
        return;
      } catch (error) {
        if (!this.options.actionFallback) {
          throw new Error(`ActionExecutor UI-TARS execution failed: ${formatError(error)}`);
        }
      }
    }

    if (process.platform !== "darwin") {
      throw new Error(
        "ActionExecutor native fallback currently supports macOS only. Set CUA_LARK_PREFER_UI_TARS_EXECUTE=true to try UI-TARS operator.execute()."
      );
    }

    await this.executeViaMacOs(action, point);
  }

  async getFrontmostWindowTitle(): Promise<string | undefined> {
    if (process.platform !== "darwin") {
      return undefined;
    }
    try {
      const script = [
        'tell application "System Events"',
        "set frontProcess to first process whose frontmost is true",
        "set appName to name of frontProcess",
        "try",
        "set windowName to name of front window of frontProcess",
        "return appName & \" - \" & windowName",
        "on error",
        "return appName",
        "end try",
        "end tell"
      ].join("\n");
      const { stdout } = await execFileAsync("osascript", ["-e", script]);
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  private async loadNutOperator(): Promise<NutLikeOperator> {
    if (this.nutOperator) {
      return this.nutOperator;
    }
    const mod = await import("@ui-tars/operator-nut-js");
    const OperatorCtor = mod.NutJSOperator ?? mod.default;
    if (!OperatorCtor) {
      throw new Error("@ui-tars/operator-nut-js does not export NutJSOperator");
    }
    this.nutOperator = new OperatorCtor() as NutLikeOperator;
    return this.nutOperator;
  }

  private async executeViaUiTarsOperator(action: AgentAction, point?: Position): Promise<void> {
    const operator = await this.loadNutOperator();
    if (!operator.execute) {
      throw new Error("UI-TARS NutJSOperator does not expose execute()");
    }

    const parsedPrediction = toUiTarsParsedPrediction(action, point);
    const screenSize = this.lastScreenSize;
    if (!screenSize && point) {
      throw new Error("UI-TARS execution requires a prior screenshot to determine screen size");
    }
    await operator.execute({
      prediction: action.description,
      parsedPrediction,
      screenWidth: screenSize?.width ?? 0,
      screenHeight: screenSize?.height ?? 0,
      scaleFactor: 1,
      factors: [1, 1]
    });
  }

  private async executeViaMacOs(action: AgentAction, point?: Position): Promise<void> {
    switch (action.type) {
      case "click":
        await runAppleScript(`tell application "System Events" to click at {${requiredPoint(point).x}, ${requiredPoint(point).y}}`);
        return;
      case "double_click":
        await runAppleScript(
          `tell application "System Events" to double click at {${requiredPoint(point).x}, ${requiredPoint(point).y}}`
        );
        return;
      case "right_click": {
        const p = requiredPoint(point);
        await runAppleScript(
          [
            'tell application "System Events"',
            "key down control",
            `click at {${p.x}, ${p.y}}`,
            "key up control",
            "end tell"
          ].join("\n")
        );
        return;
      }
      case "type_text":
        if (!action.text) {
          throw new Error("ActionExecutor type_text requires action.text");
        }
        await runAppleScript(`tell application "System Events" to keystroke ${appleString(action.text)}`);
        return;
      case "hotkey":
        await runAppleScript(toHotkeyAppleScript(action.hotkeys));
        return;
      case "scroll":
        await runAppleScript(toScrollAppleScript(action.scrollDelta ?? 0));
        return;
      default:
        throw new Error(`ActionExecutor unsupported action type: ${action.type}`);
    }
  }
}

function toUiTarsParsedPrediction(action: AgentAction, point?: Position): Record<string, unknown> {
  const actionTypeMap: Partial<Record<AgentAction["type"], string>> = {
    click: "click",
    double_click: "double_click",
    right_click: "right_click",
    type_text: "type",
    hotkey: "hotkey",
    scroll: "scroll"
  };

  return {
    action_type: actionTypeMap[action.type] ?? action.type,
    action_inputs: {
      start_box: point ? toNormalizedPointBox(point) : undefined,
      content: action.text,
      hotkey: action.hotkeys?.join("+"),
      scroll_delta: action.scrollDelta
    },
    reflection: null,
    thought: action.description
  };
}

function toNormalizedPointBox(point: Position): string {
  const screenSize = getCurrentScreenSize();
  return `[${point.x / screenSize.width},${point.y / screenSize.height},${point.x / screenSize.width},${point.y / screenSize.height}]`;
}

let currentScreenSize: ScreenSize | undefined;

function getCurrentScreenSize(): ScreenSize {
  if (!currentScreenSize) {
    throw new Error("UI-TARS execution requires a prior screenshot to determine screen size");
  }
  return currentScreenSize;
}

function readImageSize(buffer: Buffer): ScreenSize | undefined {
  if (buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    const size = {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
    currentScreenSize = size;
    return size;
  }
  return undefined;
}

function requiredPoint(point?: Position): Position {
  if (!point) {
    throw new Error("ActionExecutor click-like action requires a point");
  }
  return point;
}

async function runAppleScript(script: string): Promise<void> {
  try {
    await execFileAsync("osascript", ["-e", script]);
  } catch (error) {
    throw new Error(`macOS automation failed: ${formatError(error)}`);
  }
}

function appleString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function toHotkeyAppleScript(hotkeys?: string[]): string {
  if (!hotkeys?.length) {
    throw new Error("ActionExecutor hotkey requires action.hotkeys");
  }

  const modifiers: string[] = [];
  const normalKeys: string[] = [];
  for (const key of hotkeys) {
    const normalized = key.toLowerCase();
    if (["cmd", "command", "meta"].includes(normalized)) {
      modifiers.push("command down");
    } else if (["ctrl", "control"].includes(normalized)) {
      modifiers.push("control down");
    } else if (["shift"].includes(normalized)) {
      modifiers.push("shift down");
    } else if (["alt", "option"].includes(normalized)) {
      modifiers.push("option down");
    } else {
      normalKeys.push(key);
    }
  }

  if (normalKeys.length !== 1) {
    throw new Error(`ActionExecutor hotkey expects exactly one non-modifier key, got ${normalKeys.length}`);
  }

  const suffix = modifiers.length ? ` using {${modifiers.join(", ")}}` : "";
  return `tell application "System Events" to keystroke ${appleString(normalKeys[0])}${suffix}`;
}

function toScrollAppleScript(scrollDelta: number): string {
  const keyCode = scrollDelta >= 0 ? 125 : 126;
  const repeats = Math.max(1, Math.min(20, Math.ceil(Math.abs(scrollDelta) / 120)));
  return [
    'tell application "System Events"',
    ...Array.from({ length: repeats }, () => `key code ${keyCode}`),
    "end tell"
  ].join("\n");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
