import path from "node:path";
import type { UiTarsDesktopOperator } from "../core/ui-tars-operator.js";
import type { Observation } from "../core/types.js";
import { ensureDir } from "../utils/file.js";
import { nowIso } from "../utils/time.js";
import type { CaptureContext } from "./types.js";

export class ScreenObserver {
  private captureIndex = 0;
  private readonly screenshotDir: string;

  constructor(
    private readonly runDir: string,
    private readonly desktopOperator: UiTarsDesktopOperator
  ) {
    this.screenshotDir = path.join(this.runDir, "screenshots");
  }

  async capture(context?: CaptureContext): Promise<Observation> {
    await ensureDir(this.screenshotDir);
    const stepIndex = context?.stepIndex ?? this.captureIndex;
    const phase = context?.phase ?? "before";
    const screenshotPath = path.join(this.screenshotDir, `step-${stepIndex}-${phase}.png`);
    const screenshot = await this.desktopOperator.captureScreenshot(screenshotPath);
    const windowTitle = await this.desktopOperator.getFrontmostWindowTitle();
    this.captureIndex += 1;

    return {
      timestamp: nowIso(),
      screenshotPath,
      windowTitle,
      extra: {
        backend: screenshot.backend,
        scaleFactor: screenshot.scaleFactor
      }
    };
  }
}
