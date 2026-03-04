import type { AgentProfile } from "./AgentRegistry.js";
import { AgentRegistry } from "./AgentRegistry.js";

function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

export interface ToolPolicyDecision {
  allowed: boolean;
  reason: string;
}

export class ExecutionModeController {
  private activeAgentId: string;

  constructor(private readonly registry: AgentRegistry, initialAgentId: string = "build") {
    this.activeAgentId = this.registry.has(initialAgentId) ? initialAgentId : "build";
  }

  getActiveAgentId(): string {
    return this.activeAgentId;
  }

  getActiveAgent(): AgentProfile | undefined {
    return this.registry.get(this.activeAgentId);
  }

  setActiveAgent(id: string): boolean {
    if (!this.registry.has(id)) {
      return false;
    }
    this.activeAgentId = id;
    return true;
  }

  isPlanMode(): boolean {
    return this.activeAgentId === "plan";
  }

  evaluateTool(toolName: string): ToolPolicyDecision {
    const profile = this.getActiveAgent();
    if (!profile) {
      return { allowed: false, reason: "active_agent_not_found" };
    }

    if (profile.blockedTools?.some((pattern) => matchesPattern(toolName, pattern))) {
      return { allowed: false, reason: `blocked_by_agent:${profile.id}` };
    }

    if (profile.allowedTools && profile.allowedTools.length > 0) {
      const ok = profile.allowedTools.some((pattern) => matchesPattern(toolName, pattern));
      if (!ok) {
        return { allowed: false, reason: `not_allowed_by_agent:${profile.id}` };
      }
    }

    if (profile.readOnly && /(write|edit|run_shell|shell_kill|git_command|sub_agent_run)/.test(toolName)) {
      return { allowed: false, reason: `read_only_agent:${profile.id}` };
    }

    return { allowed: true, reason: "agent_policy_allow" };
  }
}
