import { describe, expect, it } from "vitest";
import {
  buildPermissionRule,
  classifyToolRisk,
  evaluatePermissionPolicy,
  isMutatingTool,
} from "./approval.js";

describe("approval policy", () => {
  const baseConfig = {
    allow: [],
    block: [],
    dontAsk: false,
  };

  it("auto-allows low-risk builtin tools", () => {
    const decision = evaluatePermissionPolicy(
      baseConfig,
      "read_file",
      { path: "README.md" },
      "builtin",
    );

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("auto_allow_low_risk");
    expect(decision.risk.level).toBe("low");
  });

  it("prompts for high-risk builtin tools", () => {
    const decision = evaluatePermissionPolicy(
      baseConfig,
      "write_file",
      { path: "README.md", content: "x" },
      "builtin",
    );

    expect(decision.requiresApproval).toBe(true);
    expect(decision.resolution).toBe("prompt");
    expect(decision.risk.level).toBe("high");
  });

  it("treats destructive shell commands as critical", () => {
    const risk = classifyToolRisk(
      "run_shell",
      { command: "rm -rf node_modules" },
      "builtin",
    );

    expect(risk.level).toBe("critical");
    expect(isMutatingTool("run_shell", "builtin", { command: "rm -rf ." })).toBe(true);
  });

  it("matches Bash rules for persistent decisions", () => {
    const rule = buildPermissionRule("run_shell", { command: "pnpm test" });
    expect(rule).toBe("Bash(pnpm test)");

    const decision = evaluatePermissionPolicy(
      {
        allow: [rule],
        block: [],
        dontAsk: false,
      },
      "run_shell",
      { command: "pnpm test" },
      "builtin",
    );

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("allowed");
  });

  it("denies prompt-required tools when dontAsk is enabled", () => {
    const decision = evaluatePermissionPolicy(
      {
        allow: [],
        block: [],
        dontAsk: true,
      },
      "write_file",
      { path: "README.md", content: "x" },
      "builtin",
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("approval_required_but_dont_ask");
  });
});
