import type { SubAgentManager, SubAgentRunOptions } from "@kigo/core";

export type TaskProfile =
  | "general-purpose"
  | "explore"
  | "plan"
  | "claude-code-guide"
  | "statusline-setup";

export type TaskStatus = "running" | "completed" | "failed";

export interface TaskRecord {
  id: string;
  profile: TaskProfile;
  task: string;
  status: TaskStatus;
  createdAt: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

function buildProfilePrompt(profile: TaskProfile): string {
  switch (profile) {
    case "explore":
      return "You are an Explore sub-agent. Quickly locate files, symbols, and patterns. Return concise findings.";
    case "plan":
      return "You are a Plan sub-agent. Produce implementation design, risks, and incremental steps before coding.";
    case "claude-code-guide":
      return "You are a Claude Code guide sub-agent. Explain capabilities, workflows, and usage clearly.";
    case "statusline-setup":
      return "You are a statusline setup sub-agent. Configure and verify concise terminal status line behavior.";
    default:
      return "You are a general-purpose sub-agent. Solve the assigned task pragmatically.";
  }
}

export class TaskManager {
  private tasks = new Map<string, TaskRecord>();

  constructor(private readonly subAgentManager: SubAgentManager) {}

  private async executeTask(id: string, options: SubAgentRunOptions): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) {
      return;
    }

    try {
      const result = await this.subAgentManager.runSubAgent(options);
      task.status = "completed";
      task.output = result.output;
      task.completedAt = Date.now();
    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.completedAt = Date.now();
    }
  }

  async start(options: {
    task: string;
    profile?: TaskProfile;
    context?: string;
    runInBackground?: boolean;
  }): Promise<TaskRecord> {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const profile = options.profile || "general-purpose";

    const record: TaskRecord = {
      id,
      profile,
      task: options.task,
      status: "running",
      createdAt: Date.now(),
    };

    this.tasks.set(id, record);

    const runOptions: SubAgentRunOptions = {
      task: options.task,
      context: options.context,
      systemPrompt: buildProfilePrompt(profile),
      returnEvents: false,
    };

    if (options.runInBackground) {
      void this.executeTask(id, runOptions);
      return record;
    }

    await this.executeTask(id, runOptions);
    return this.tasks.get(id)!;
  }

  list(): TaskRecord[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  get(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  async resume(taskId: string): Promise<TaskRecord | undefined> {
    const existing = this.tasks.get(taskId);
    if (!existing) {
      return undefined;
    }

    const resumed = await this.start({
      task: `Continue this task from previous output:\n${existing.output || existing.task}`,
      profile: existing.profile,
      runInBackground: false,
    });

    return resumed;
  }
}
