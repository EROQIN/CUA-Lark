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
      reason: "规则校验未通过，已跳过 VLM 复核。"
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
    reasons.push(`最终状态应为${formatFinalStatus(targetFinalStatus)}，实际为${formatFinalStatus(report.finalStatus)}`);
  }
  if (expected?.maxDurationMs && report.durationMs > expected.maxDurationMs) {
    reasons.push(`耗时 ${report.durationMs}ms 超过上限 ${expected.maxDurationMs}ms`);
  }
  if (expected?.maxTurns && report.totalTurns > expected.maxTurns) {
    reasons.push(`轮次 ${report.totalTurns} 超过上限 ${expected.maxTurns}`);
  }

  for (const text of expected?.requiredTexts ?? []) {
    if (!report.sourceText.includes(text)) {
      reasons.push(`未找到必需文本：${text}`);
    }
  }

  for (const actionType of expected?.requiredActionTypes ?? []) {
    if (!report.actionTypes.includes(actionType)) {
      reasons.push(`未找到必需动作：${actionType}`);
    }
  }

  for (const text of expected?.forbiddenTexts ?? []) {
    if (report.sourceText.includes(text)) {
      reasons.push(`出现禁止文本：${text}`);
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
      reason: "已请求 VLM 复核，但缺少模型地址、API Key 或模型名称。"
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
        reason: `VLM 复核请求失败，HTTP 状态码 ${response.status}`
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
      reason: parsed.reason || "VLM 复核完成。"
    };
  } catch (error) {
    return {
      enabled: true,
      passed: false,
      reason: `VLM 复核异常：${error instanceof Error ? error.message : String(error)}`
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

function formatFinalStatus(status: string): string {
  if (status === "success") {
    return "成功";
  }
  if (status === "failed") {
    return "失败";
  }
  if (status === "max_turns") {
    return "达到最大轮次";
  }
  return status;
}
