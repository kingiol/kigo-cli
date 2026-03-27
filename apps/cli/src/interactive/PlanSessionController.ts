import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isMutatingTool, type ToolExecutionSource } from "@kigo/core";

export type PlanSessionState = "inactive" | "drafting" | "approved" | "applied";

export interface PlanToolDecision {
  allowed: boolean;
  reason: string;
}

export class PlanSessionController {
  private state: PlanSessionState = "inactive";
  private savedAt: string | null = null;
  private latestContent = "";

  constructor(
    private readonly projectRoot: string,
    private readonly sessionId: string,
  ) {}

  getState(): PlanSessionState {
    return this.state;
  }

  isBlockingWrites(): boolean {
    return this.state === "drafting" || this.state === "approved";
  }

  getPlanFilePath(): string {
    return path.join(this.projectRoot, ".kigo", "state", "plans", `${this.sessionId}.md`);
  }

  enter(): void {
    this.state = "drafting";
  }

  async cancel(): Promise<void> {
    this.state = "inactive";
    await this.persist();
  }

  async approve(): Promise<boolean> {
    if (!this.savedAt) {
      return false;
    }
    this.state = "approved";
    await this.persist();
    return true;
  }

  async apply(): Promise<boolean> {
    if (this.state !== "approved") {
      return false;
    }
    this.state = "applied";
    await this.persist();
    return true;
  }

  canSwitchToAgent(agentId: string): boolean {
    if (agentId !== "build") {
      return true;
    }

    return !this.isBlockingWrites();
  }

  async savePlan(content: string): Promise<string> {
    this.latestContent = content.trim();
    return this.persist();
  }

  async captureDraft(content: string): Promise<string | null> {
    if (this.state === "inactive" || this.state === "applied") {
      return null;
    }

    const trimmed = content.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed === this.latestContent && this.savedAt) {
      return null;
    }

    this.latestContent = trimmed;
    return this.persist();
  }

  describe(): { state: PlanSessionState; path: string; savedAt: string | null; hasDraft: boolean } {
    return {
      state: this.state,
      path: this.getPlanFilePath(),
      savedAt: this.savedAt,
      hasDraft: this.latestContent.length > 0,
    };
  }

  evaluateTool(
    toolName: string,
    args: unknown,
    source: ToolExecutionSource,
  ): PlanToolDecision {
    if (!this.isBlockingWrites()) {
      return { allowed: true, reason: "plan_gate_inactive" };
    }

    if (!isMutatingTool(toolName, source, args)) {
      return { allowed: true, reason: "plan_gate_read_only" };
    }

    return {
      allowed: false,
      reason: `plan_pending_${this.state}`,
    };
  }

  private async persist(): Promise<string> {
    const filePath = this.getPlanFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const savedAt = new Date().toISOString();
    const body = [
      `# Plan for ${this.sessionId}`,
      "",
      `- State: ${this.state}`,
      `- SavedAt: ${savedAt}`,
      "",
      this.latestContent || "_No plan draft saved yet._",
      "",
    ].join("\n");

    await fs.writeFile(filePath, body, "utf-8");
    this.savedAt = savedAt;
    return filePath;
  }
}
