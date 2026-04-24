export interface VLMConfig {
  provider: "openai-compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  maxRetries: number;
}

export interface VLMGroundingRequest {
  screenshotPath: string;
  target: string;
  actionType: string;
  instruction?: string;
  hints?: Record<string, unknown>;
}

export interface VLMGroundingCandidate {
  label: string;
  description: string;
  bbox?: [number, number, number, number];
  point?: { x: number; y: number };
  confidence: number;
  reason: string;
}

export interface VLMGroundingResult {
  success: boolean;
  target: string;
  candidates: VLMGroundingCandidate[];
  bestCandidate?: VLMGroundingCandidate;
  rawResponse: string;
  error?: string;
}

export interface VLMJsonCompletionRequest {
  screenshotPath: string;
  systemPrompt: string;
  userPrompt: string;
}

export interface VLMJsonCompletionResult {
  success: boolean;
  rawResponse: string;
  data?: unknown;
  error?: string;
}
