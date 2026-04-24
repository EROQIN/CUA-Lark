import type { LocateRequest, LocateResult } from "../core/types.js";
import type { VLMGroundingCandidate } from "../vlm/types.js";
import type { VLMGroundingService } from "../vlm/vlm-grounding.js";

const minimumVlmConfidence = 0.55;

export class HybridLocator {
  constructor(private readonly vlmGroundingService?: VLMGroundingService) {}

  async locate(request: LocateRequest): Promise<LocateResult> {
    const manualPosition = request.hints?.manualPosition;
    if (manualPosition) {
      return {
        success: true,
        target: request.target,
        point: manualPosition,
        confidence: 1,
        sources: ["manual-position"],
        reason: "M1 uses manually provided coordinates."
      };
    }

    if (request.target) {
      if (!this.vlmGroundingService) {
        return {
          success: false,
          target: request.target,
          confidence: 0,
          sources: ["vlm-grounding"],
          reason: "VLM grounding service is not configured",
          error: "vlm request error: service not configured"
        };
      }

      const grounding = await this.vlmGroundingService.locateByVision({
        screenshotPath: request.screenContext.screenshotPath,
        target: request.target,
        actionType: request.actionType,
        hints: request.hints
      });
      const bestCandidate = grounding.bestCandidate;

      if (!grounding.success || !bestCandidate) {
        return {
          success: false,
          target: grounding.target,
          confidence: bestCandidate?.confidence ?? 0,
          sources: ["vlm-grounding"],
          reason: grounding.error ?? "VLM could not locate the target",
          rawResponse: grounding.rawResponse,
          candidates: grounding.candidates,
          error: grounding.error
        };
      }

      const point = bestCandidate.point ?? pointFromBbox(bestCandidate);
      if (!point) {
        return {
          success: false,
          target: grounding.target,
          confidence: bestCandidate.confidence,
          sources: ["vlm-grounding"],
          reason: "VLM returned a candidate without a usable point or bbox",
          rawResponse: grounding.rawResponse,
          candidates: grounding.candidates,
          error: "vlm parse error: missing point"
        };
      }

      if (bestCandidate.confidence < minimumVlmConfidence) {
        return {
          success: false,
          target: grounding.target,
          point,
          bbox: bboxFromCandidate(bestCandidate),
          confidence: bestCandidate.confidence,
          sources: ["vlm-grounding"],
          reason: `VLM confidence too low: ${bestCandidate.confidence}`,
          rawResponse: grounding.rawResponse,
          candidates: grounding.candidates,
          error: "VLM confidence too low"
        };
      }

      return {
        success: true,
        target: grounding.target,
        point,
        bbox: bboxFromCandidate(bestCandidate),
        confidence: bestCandidate.confidence,
        sources: ["vlm-grounding"],
        reason: bestCandidate.reason,
        rawResponse: grounding.rawResponse,
        candidates: grounding.candidates
      };
    }

    // Extension points for M2/M3: collect candidates from vision, OCR,
    // accessibility tree, DOM, action history, and layout priors, then
    // normalize them into bbox/point candidates with confidence scores.
    return {
      success: false,
      target: request.target,
      confidence: 0,
      sources: [],
      reason:
        "No manual position or semantic target provided. Planned sources: vision, OCR, accessibility tree, DOM, action history, and layout priors."
    };
  }
}

function pointFromBbox(candidate: VLMGroundingCandidate): { x: number; y: number } | undefined {
  if (!candidate.bbox) {
    return undefined;
  }
  const [x1, y1, x2, y2] = candidate.bbox;
  return {
    x: Math.round((x1 + x2) / 2),
    y: Math.round((y1 + y2) / 2)
  };
}

function bboxFromCandidate(candidate: VLMGroundingCandidate): LocateResult["bbox"] {
  if (!candidate.bbox) {
    return undefined;
  }
  const [x1, y1, x2, y2] = candidate.bbox;
  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1
  };
}
