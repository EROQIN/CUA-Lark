import type { AppConfig } from "../config/env.js";
import type { EvaluableRunReport, EvalExpected, VerificationResult } from "./types.js";

interface VerifyOptions {
  vlmVerify: boolean;
  appConfig?: AppConfig;
}

export async function verifyRunReport(
  report: EvaluableRunReport,
  expected: EvalExpected | undefined,
  options: VerifyOptions
): Promise<VerificationResult> {
  const rule = verifyByRules(report, expected);
  const result: VerificationResult = {
    passed: rule.passed,
    method: options.vlmVerify ? "rules+vlm" : "rules",
    reasons: [...rule.reasons],
    rule
  };

  if (!options.vlmVerify) {
    return result;
  }

  if (!rule.passed) {
    result.vlm = {
      enabled: true,
      passed: false,
      reason: "Skipped because rule verification already failed."
    };
    return result;
  }

  const vlm = await verifyByVlm(report, expected, options.appConfig);
  result.vlm = vlm;
  result.passed = Boolean(vlm.passed);
  if (!vlm.passed && vlm.reason) {
    result.reasons.push(vlm.reason);
  }
  return result;
}

function verifyByRules(report: EvaluableRunReport, expected: EvalExpected | undefined): VerificationResult["rule"] {
  const reasons: string[] = [];
  const targetFinalStatus = expected?.finalStatus ?? "success";

  if (report.finalStatus !== targetFinalStatus) {
    reasons.push(`finalStatus expected ${targetFinalStatus}, got ${report.finalStatus}`);
  }
  if (expected?.maxDurationMs && report.durationMs > expected.maxDurationMs) {
    reasons.push(`duration ${report.durationMs}ms exceeded ${expected.maxDurationMs}ms`);
  }
  if (expected?.maxTurns && report.totalTurns > expected.maxTurns) {
    reasons.push(`turn count ${report.totalTurns} exceeded ${expected.maxTurns}`);
  }

  for (const text of expected?.requiredTexts ?? []) {
    if (!report.sourceText.includes(text)) {
      reasons.push(`required text not found: ${text}`);
    }
  }

  for (const actionType of expected?.requiredActionTypes ?? []) {
    if (!report.actionTypes.includes(actionType)) {
      reasons.push(`required action type not found: ${actionType}`);
    }
  }

  for (const text of expected?.forbiddenTexts ?? []) {
    if (report.sourceText.includes(text)) {
      reasons.push(`forbidden text found: ${text}`);
    }
  }

  return {
    passed: reasons.length === 0,
    reasons
  };
}

async function verifyByVlm(
  report: EvaluableRunReport,
  expected: EvalExpected | undefined,
  appConfig: AppConfig | undefined
): Promise<NonNullable<VerificationResult["vlm"]>> {
  const baseURL = appConfig?.uiTars.baseUrl || appConfig?.fallbackModel.baseUrl;
  const apiKey = appConfig?.uiTars.apiKey || appConfig?.fallbackModel.apiKey;
  const model = appConfig?.uiTars.model || appConfig?.fallbackModel.model;

  if (!baseURL || !apiKey || !model) {
    return {
      enabled: true,
      passed: false,
      reason: "VLM verification requested but model endpoint, API key, or model name is missing."
    };
  }

  try {
    const response = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content:
              "You are a GUI test evaluator. Return only compact JSON with keys passed:boolean and reason:string."
          },
          {
            role: "user",
            content: [
              "Decide whether this Feishu/Lark GUI-agent test run satisfies the expected outcome.",
              `Expected: ${JSON.stringify(expected ?? { finalStatus: "success" })}`,
              `Final status: ${report.finalStatus}`,
              `Duration ms: ${report.durationMs}`,
              `Turns: ${report.totalTurns}`,
              `Action types: ${report.actionTypes.join(", ")}`,
              "Evidence excerpt:",
              truncate(report.sourceText, 8000)
            ].join("\n")
          }
        ]
      })
    });

    if (!response.ok) {
      return {
        enabled: true,
        passed: false,
        reason: `VLM verification failed with HTTP ${response.status}`
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = parseVlmJson(content);
    return {
      enabled: true,
      passed: parsed.passed,
      reason: parsed.reason || "VLM verification completed."
    };
  } catch (error) {
    return {
      enabled: true,
      passed: false,
      reason: `VLM verification error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function parseVlmJson(content: string): { passed: boolean; reason: string } {
  const jsonBlock = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
  const parsed = JSON.parse(jsonBlock) as { passed?: unknown; reason?: unknown };
  return {
    passed: parsed.passed === true,
    reason: typeof parsed.reason === "string" ? parsed.reason : ""
  };
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n...<truncated>`;
}
