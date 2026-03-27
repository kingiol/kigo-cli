import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildPermissionRule,
  evaluatePermissionPolicy,
  type PermissionDecision,
  type PermissionDecisionAction,
  type PermissionPolicyConfig,
  type ToolExecutionSource,
} from "./approval.js";

export interface PermissionControllerOptions {
  persist?: (config: PermissionPolicyConfig) => Promise<void>;
}

function normalizeAuditPath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

export class PermissionController {
  private allowOnceRules = new Set<string>();
  private denyOnceRules = new Set<string>();

  constructor(
    private readonly config: PermissionPolicyConfig,
    private readonly options: PermissionControllerOptions = {},
  ) {}

  getConfig(): PermissionPolicyConfig {
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

  denyOnce(rule: string): void {
    this.denyOnceRules.add(rule);
  }

  evaluate(
    toolName: string,
    args: unknown,
    source: ToolExecutionSource = "builtin",
  ): PermissionDecision {
    return evaluatePermissionPolicy(
      this.config,
      toolName,
      args,
      source,
      this.allowOnceRules,
      this.denyOnceRules,
    );
  }

  async applyDecision(
    toolName: string,
    args: unknown,
    action: PermissionDecisionAction,
    source: ToolExecutionSource = "builtin",
  ): Promise<PermissionDecision> {
    const rule = buildPermissionRule(toolName, args);

    if (action === "allow_once") {
      this.allowOnce(rule);
    } else if (action === "deny_once") {
      this.denyOnce(rule);
    } else if (action === "allow_always") {
      this.addAllow(rule);
      await this.persist();
    } else if (action === "deny_always") {
      this.addBlock(rule);
      await this.persist();
    }

    return this.evaluate(toolName, args, source);
  }

  async recordAudit(
    toolName: string,
    args: unknown,
    decision: PermissionDecision,
  ): Promise<void> {
    const auditPath = normalizeAuditPath(
      this.config.auditLogPath || "~/.kigo/permission-audit.log",
    );
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

  private async persist(): Promise<void> {
    if (!this.options.persist) {
      return;
    }
    await this.options.persist({
      ...this.config,
      allow: [...this.config.allow],
      block: [...this.config.block],
    });
  }
}
