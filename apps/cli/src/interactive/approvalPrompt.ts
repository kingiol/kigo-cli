import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type {
  PermissionDecision,
  PermissionDecisionAction,
  ToolExecutionSource,
} from "./PermissionController.js";

export interface ToolApprovalPromptRequest {
  toolName: string;
  toolSource: ToolExecutionSource;
  params: unknown;
  decision: PermissionDecision;
}

function formatParams(params: unknown): string {
  try {
    const raw = JSON.stringify(params, null, 2) || "";
    if (raw.length <= 800) {
      return raw;
    }
    return `${raw.slice(0, 800)}\n...`;
  } catch {
    return String(params);
  }
}

export async function promptForToolApproval(
  request: ToolApprovalPromptRequest,
): Promise<PermissionDecisionAction> {
  if (!stdin.isTTY || !stdout.isTTY) {
    return "deny_once";
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const body = [
    "",
    "Approval required",
    `Tool: ${request.toolName} (${request.toolSource})`,
    `Risk: ${request.decision.risk.level}`,
    `Why: ${request.decision.risk.reason}`,
    "Params:",
    formatParams(request.params),
    "",
    "[1] allow once",
    "[2] allow always",
    "[3] deny once",
    "[4] deny always",
    "",
  ].join("\n");

  try {
    const answer = (await rl.question(`${body}Choose [1-4] (default: 3): `))
      .trim()
      .toLowerCase();

    if (answer === "1" || answer === "a" || answer === "allow") {
      return "allow_once";
    }
    if (answer === "2" || answer === "aa" || answer === "always") {
      return "allow_always";
    }
    if (answer === "4" || answer === "da" || answer === "block") {
      return "deny_always";
    }

    return "deny_once";
  } finally {
    rl.close();
  }
}
