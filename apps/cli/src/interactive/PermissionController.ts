import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { PermissionsConfig } from "@kigo/config";

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
  matchedRule?: string;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesWildcard(input: string, pattern: string): boolean {
  const regex = new RegExp(`^${escapeRegExp(pattern).replace(/\\\*/g, ".*")}$`);
  return regex.test(input);
}

function normalizeAuditPath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function matchRule(rule: string, toolName: string, args: unknown): boolean {
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

export class PermissionController {
  private allowOnceRules = new Set<string>();

  constructor(private readonly config: PermissionsConfig) {}

  getConfig(): PermissionsConfig {
    return this.config;
  }

  addAllow(rule: string): void {
    if (!this.config.allow.includes(rule)) {
      this.config.allow.push(rule);
    }
  }

  addBlock(rule: string): void {
    if (!this.config.block.includes(rule)) {
      this.config.block.push(rule);
    }
  }

  removeAllow(rule: string): boolean {
    const i = this.config.allow.indexOf(rule);
    if (i < 0) return false;
    this.config.allow.splice(i, 1);
    return true;
  }

  removeBlock(rule: string): boolean {
    const i = this.config.block.indexOf(rule);
    if (i < 0) return false;
    this.config.block.splice(i, 1);
    return true;
  }

  setDontAsk(value: boolean): void {
    this.config.dontAsk = value;
  }

  allowOnce(rule: string): void {
    this.allowOnceRules.add(rule);
  }

  evaluate(toolName: string, args: unknown): PermissionDecision {
    for (const rule of this.allowOnceRules) {
      if (matchRule(rule, toolName, args)) {
        return { allowed: true, reason: "allowed_once", matchedRule: rule };
      }
    }

    for (const rule of this.config.block) {
      if (matchRule(rule, toolName, args)) {
        return { allowed: false, reason: "blocked", matchedRule: rule };
      }
    }

    for (const rule of this.config.allow) {
      if (matchRule(rule, toolName, args)) {
        return { allowed: true, reason: "allowed", matchedRule: rule };
      }
    }

    if (this.config.allow.length > 0 && this.config.dontAsk) {
      return { allowed: false, reason: "not_in_allowlist" };
    }

    return { allowed: true, reason: "default_allow" };
  }

  async recordAudit(
    toolName: string,
    args: unknown,
    decision: PermissionDecision,
  ): Promise<void> {
    const auditPath = normalizeAuditPath(this.config.auditLogPath || "~/.kigo/permission-audit.log");
    const dir = path.dirname(auditPath);
    await fs.mkdir(dir, { recursive: true });

    const line = JSON.stringify({
      ts: new Date().toISOString(),
      toolName,
      args,
      decision,
    });

    await fs.appendFile(auditPath, `${line}\n`, "utf-8");
  }
}
