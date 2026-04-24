import type { AgentAction, Observation, VerificationResult } from "../core/types.js";

export class StateVerifier {
  async verify(action: AgentAction, before: Observation, after: Observation): Promise<VerificationResult> {
    if (action.type === "wait" || action.type === "screenshot") {
      return {
        success: true,
        method: "rule",
        reason: `${action.type} does not require visual state change validation in M1.`
      };
    }

    return {
      success: true,
      method: "placeholder",
      reason:
        "M1 assumes action success after execution. Future verifiers should add VLM semantic checks, OCR assertions, and pixel diff checks.",
      details: {
        beforeScreenshot: before.screenshotPath,
        afterScreenshot: after.screenshotPath
      }
    };
  }
}
