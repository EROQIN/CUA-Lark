import { imageToBase64DataUrl } from "./image.js";
import { buildGroundingUserPrompt, VLM_GROUNDING_SYSTEM_PROMPT } from "./prompt.js";
import type {
  VLMConfig,
  VLMGroundingCandidate,
  VLMGroundingRequest,
  VLMGroundingResult,
  VLMJsonCompletionRequest,
  VLMJsonCompletionResult
} from "./types.js";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

export class VLMClient {
  constructor(private readonly config: VLMConfig) {}

  async groundUIElement(request: VLMGroundingRequest): Promise<VLMGroundingResult> {
    const completion = await this.completeJsonWithImage({
      screenshotPath: request.screenshotPath,
      systemPrompt: VLM_GROUNDING_SYSTEM_PROMPT,
      userPrompt: buildGroundingUserPrompt(request)
    });

    if (!completion.success) {
      return this.failure(request.target, completion.rawResponse, completion.error ?? "vlm request error");
    }

    return parseGroundingResult(request.target, completion.rawResponse);
  }

  async completeJsonWithImage(request: VLMJsonCompletionRequest): Promise<VLMJsonCompletionResult> {
    if (!this.config.apiKey) {
      return {
        success: false,
        rawResponse: "",
        error: "VLM_API_KEY is required when using VLM locator"
      };
    }

    let lastResult: VLMJsonCompletionResult | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const result = await this.completeJsonWithImageOnce(request);
      if (result.success || !isRetryableError(result.error)) {
        return result;
      }
      lastResult = result;
    }

    return lastResult ?? {
      success: false,
      rawResponse: "",
      error: "vlm request error: unknown retry failure"
    };
  }

  private async completeJsonWithImageOnce(request: VLMJsonCompletionRequest): Promise<VLMJsonCompletionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const imageUrl = await imageToBase64DataUrl(request.screenshotPath);
      const response = await fetch(`${trimTrailingSlash(this.config.baseUrl)}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          messages: [
            {
              role: "system",
              content: request.systemPrompt
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: request.userPrompt
                },
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                    detail: "high"
                  }
                }
              ]
            }
          ]
        }),
        signal: controller.signal
      });

      const body = (await response.json().catch(() => undefined)) as ChatCompletionResponse | undefined;
      if (!response.ok) {
        return {
          success: false,
          rawResponse: JSON.stringify(body ?? {}),
          error: `vlm request error: ${body?.error?.message ?? response.statusText}`
        };
      }

      const rawResponse = extractAssistantContent(body);
      if (!rawResponse) {
        return {
          success: false,
          rawResponse: JSON.stringify(body ?? {}),
          error: "vlm parse error: empty assistant response"
        };
      }

      return {
        success: true,
        rawResponse,
        data: parseJsonObject(rawResponse)
      };
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError" ? "vlm request error: timeout" : `vlm request error: ${formatError(error)}`;
      return {
        success: false,
        rawResponse: "",
        error: message
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private failure(target: string, rawResponse: string, error: string): VLMGroundingResult {
    return {
      success: false,
      target,
      candidates: [],
      rawResponse,
      error
    };
  }
}

function parseGroundingResult(target: string, rawResponse: string): VLMGroundingResult {
  try {
    const parsed = parseJsonObject(rawResponse) as Partial<VLMGroundingResult>;
    const candidates = Array.isArray(parsed.candidates) ? parsed.candidates.filter(isCandidate) : [];
    const sortedCandidates = [...candidates].sort((a, b) => b.confidence - a.confidence);
    const bestCandidate = sortedCandidates[0];
    const success = Boolean(parsed.success) && Boolean(bestCandidate);

    return {
      success,
      target: typeof parsed.target === "string" ? parsed.target : target,
      candidates: sortedCandidates,
      bestCandidate,
      rawResponse,
      error: typeof parsed.error === "string" ? parsed.error : success ? undefined : "vlm parse error: no valid candidates"
    };
  } catch (error) {
    return {
      success: false,
      target,
      candidates: [],
      rawResponse,
      error: `vlm parse error: ${formatError(error)}`
    };
  }
}

function parseJsonObject(raw: string): unknown {
  return JSON.parse(extractJsonObject(raw));
}

function extractAssistantContent(body?: ChatCompletionResponse): string {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("response does not contain a JSON object");
  }
  return match[0];
}

function isCandidate(value: unknown): value is VLMGroundingCandidate {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<VLMGroundingCandidate>;
  const hasPoint =
    candidate.point !== undefined &&
    typeof candidate.point.x === "number" &&
    typeof candidate.point.y === "number";
  const hasBbox =
    candidate.bbox !== undefined &&
    Array.isArray(candidate.bbox) &&
    candidate.bbox.length === 4 &&
    candidate.bbox.every((item) => typeof item === "number");

  return (
    typeof candidate.label === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.confidence === "number" &&
    typeof candidate.reason === "string" &&
    (hasPoint || hasBbox)
  );
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableError(error?: string): boolean {
  if (!error) {
    return false;
  }
  return error.includes("timeout") || error.includes("empty assistant response") || error.includes("choices");
}
