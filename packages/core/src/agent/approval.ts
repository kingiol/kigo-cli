export type ToolExecutionSource = "builtin" | "local" | "plugin" | "mcp";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type PermissionResolution =
  | "allow"
  | "deny"
  | "prompt";

export type PermissionDecisionAction =
  | "allow_auto"
  | "allow_once"
  | "allow_always"
  | "deny_auto"
  | "deny_once"
  | "deny_always"
  | "prompt";

export interface PermissionPolicyConfig {
  allow: string[];
  block: string[];
  dontAsk: boolean;
  auditLogPath?: string;
}

export interface ApprovalRisk {
  level: RiskLevel;
  reason: string;
}

export interface PermissionDecision {
  resolution: PermissionResolution;
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
  matchedRule?: string;
  action: PermissionDecisionAction;
  risk: ApprovalRisk;
  source: ToolExecutionSource;
}

const LOW_RISK_TOOLS = new Set([
  "read_file",
  "list_directory",
  "glob_search",
  "grep_search",
  "codesearch",
  "web_search",
  "web_fetch",
  "todo_read",
  "task_get",
  "task_list",
  "task_ready",
  "task_output",
  "answer_questions",
  "ask_user_question",
  "get_skill",
  "compact",
  "shell_output",
]);

const MUTATING_TOOLS = new Set([
  "write_file",
  "edit_file",
  "apply_patch",
  "multi_edit",
  "run_shell",
  "shell_kill",
  "git_command",
  "todo_write",
  "task_create",
  "task_update",
  "task_claim",
  "sub_agent_run",
]);

const DESTRUCTIVE_SHELL_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-fd/i,
  /\bgit\s+push\b/i,
  /\bsudo\b/i,
  /\bcurl\b.*\|\s*(bash|sh)\b/i,
  /\bwget\b.*\|\s*(bash|sh)\b/i,
  />\s*\/dev\//i,
  /\bchmod\b/i,
  /\bchown\b/i,
];

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesWildcard(input: string, pattern: string): boolean {
  const regex = new RegExp(`^${escapeRegExp(pattern).replace(/\\\*/g, ".*")}$`);
  return regex.test(input);
}

export function matchPermissionRule(
  rule: string,
  toolName: string,
  args: unknown,
): boolean {
  const trimmed = rule.trim();
  if (!trimmed) return false;

  const bashMatch = /^Bash\((.*)\)$/i.exec(trimmed);
  if (bashMatch) {
    if (toolName !== "run_shell") {
      return false;
    }

    const expected = bashMatch[1]?.trim();
    const command =
      args &&
      typeof args === "object" &&
      "command" in args &&
      typeof (args as { command?: unknown }).command === "string"
        ? (args as { command: string }).command
        : "";

    if (!expected) {
      return false;
    }

    return command.includes(expected);
  }

  return matchesWildcard(toolName, trimmed) || trimmed === toolName;
}

function getStringArg(args: unknown, key: string): string {
  if (!args || typeof args !== "object" || !(key in args)) {
    return "";
  }

  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function isCriticalShellCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) {
    return false;
  }

  return DESTRUCTIVE_SHELL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function classifyToolRisk(
  toolName: string,
  args: unknown,
  source: ToolExecutionSource,
): ApprovalRisk {
  if (source === "mcp") {
    return {
      level: "high",
      reason: "External MCP tools require explicit confirmation.",
    };
  }

  if (source === "plugin" || source === "local") {
    if (LOW_RISK_TOOLS.has(toolName)) {
      return {
        level: "medium",
        reason: "Extension tools are semi-trusted and should be reviewed before use.",
      };
    }

    return {
      level: "high",
      reason: "Extension tools can execute code outside the built-in safety boundary.",
    };
  }

  if (toolName === "run_shell") {
    const command = getStringArg(args, "command");
    if (isCriticalShellCommand(command)) {
      return {
        level: "critical",
        reason: "This shell command looks destructive or hard to reverse.",
      };
    }

    return {
      level: "high",
      reason: "Shell commands can modify the workspace or local machine.",
    };
  }

  if (toolName === "git_command") {
    const gitArgs = getStringArg(args, "args");
    if (isCriticalShellCommand(`git ${gitArgs}`)) {
      return {
        level: "critical",
        reason: "This git command can rewrite history or publish changes.",
      };
    }

    return {
      level: "high",
      reason: "Git commands can rewrite repository state.",
    };
  }

  if (MUTATING_TOOLS.has(toolName)) {
    return {
      level: "high",
      reason: "This tool changes files, tasks, or running processes.",
    };
  }

  if (LOW_RISK_TOOLS.has(toolName)) {
    return {
      level: "low",
      reason: "This tool is read-oriented and does not directly modify state.",
    };
  }

  return {
    level: "medium",
    reason: "This tool is not explicitly classified and should be reviewed.",
  };
}

export function isMutatingTool(
  toolName: string,
  source: ToolExecutionSource,
  args: unknown,
): boolean {
  const risk = classifyToolRisk(toolName, args, source);
  return risk.level === "high" || risk.level === "critical";
}

export function buildPermissionRule(toolName: string, args: unknown): string {
  if (toolName === "run_shell") {
    const command = getStringArg(args, "command").trim();
    if (command) {
      return `Bash(${command})`;
    }
  }

  return toolName;
}

export function evaluatePermissionPolicy(
  config: PermissionPolicyConfig,
  toolName: string,
  args: unknown,
  source: ToolExecutionSource,
  allowOnceRules: Iterable<string> = [],
  denyOnceRules: Iterable<string> = [],
): PermissionDecision {
  const risk = classifyToolRisk(toolName, args, source);

  for (const rule of denyOnceRules) {
    if (matchPermissionRule(rule, toolName, args)) {
      return {
        resolution: "deny",
        allowed: false,
        requiresApproval: false,
        reason: "denied_once",
        matchedRule: rule,
        action: "deny_once",
        risk,
        source,
      };
    }
  }

  for (const rule of allowOnceRules) {
    if (matchPermissionRule(rule, toolName, args)) {
      return {
        resolution: "allow",
        allowed: true,
        requiresApproval: false,
        reason: "allowed_once",
        matchedRule: rule,
        action: "allow_once",
        risk,
        source,
      };
    }
  }

  for (const rule of config.block) {
    if (matchPermissionRule(rule, toolName, args)) {
      return {
        resolution: "deny",
        allowed: false,
        requiresApproval: false,
        reason: "blocked",
        matchedRule: rule,
        action: "deny_always",
        risk,
        source,
      };
    }
  }

  for (const rule of config.allow) {
    if (matchPermissionRule(rule, toolName, args)) {
      return {
        resolution: "allow",
        allowed: true,
        requiresApproval: false,
        reason: "allowed",
        matchedRule: rule,
        action: "allow_always",
        risk,
        source,
      };
    }
  }

  if (risk.level === "low") {
    return {
      resolution: "allow",
      allowed: true,
      requiresApproval: false,
      reason: "auto_allow_low_risk",
      action: "allow_auto",
      risk,
      source,
    };
  }

  if (config.dontAsk) {
    return {
      resolution: "deny",
      allowed: false,
      requiresApproval: false,
      reason: "approval_required_but_dont_ask",
      action: "deny_auto",
      risk,
      source,
    };
  }

  return {
    resolution: "prompt",
    allowed: false,
    requiresApproval: true,
    reason: "approval_required",
    action: "prompt",
    risk,
    source,
  };
}
