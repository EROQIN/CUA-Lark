import type { VLMGroundingRequest, VLMGroundingResult } from "./types.js";
import { VLMClient } from "./vlm-client.js";

export class VLMGroundingService {
  constructor(private readonly client: VLMClient) {}

  async locateByVision(request: VLMGroundingRequest): Promise<VLMGroundingResult> {
    // Extension points for M2/M3: multi-model voting, local crop recheck,
    // OCR-assisted reranking, coordinate normalization, and history fusion.
    return this.client.groundUIElement(request);
  }
}
