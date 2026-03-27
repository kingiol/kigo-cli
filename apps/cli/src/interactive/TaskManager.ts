import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SubAgentManager, SubAgentRunOptions } from "@kigo/core";
import {
  TaskGraphStore,
  type TaskExecutionSummary,
  type TaskNode,
  type TaskNodeStatus,
} from "@kigo/tools";

export type TaskProfile =
  | "general-purpose"
  | "explore"
  | "plan"
  | "claude-code-guide"
  | "statusline-setup";

export type TaskStatus = "running" | "completed" | "failed";

export type TaskEventType =
  | "task_created"
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "task_resumed";

export interface TaskEventRecord {
  id: string;
  type: TaskEventType;
  sessionId: string;
  taskRunId: string;
  taskNodeId?: number;
  profile: TaskProfile;
  task: string;
  timestamp: number;
  status: TaskStatus;
  output?: string;
  error?: string;
}

export interface TaskRecord {
  id: string;
  taskNodeId?: number;
  profile: TaskProfile;
  agentType: TaskProfile;
  task: string;
  status: TaskStatus;
  parentSessionId: string;
  attempt: number;
  startedAt?: number;
  lastErrorCode?: string;
  createdAt: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

export interface TaskOutputView {
  id: string;
  source: "task_record" | "task_node";
  profile: TaskProfile;
  status: TaskStatus;
  task: string;
  taskNodeId?: number;
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

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getProjectRoot(): string {
  return process.env.KIGO_PROJECT_ROOT || process.cwd();
}

function getTaskRunFilePath(sessionId: string): string {
  return path.join(getProjectRoot(), ".kigo", "state", "task-runs", `${sanitizeId(sessionId)}.json`);
}

function getTaskEventFilePath(sessionId: string): string {
  return path.join(getProjectRoot(), ".kigo", "state", "task-events", `${sanitizeId(sessionId)}.jsonl`);
}

function getLegacyTaskFilePath(sessionId: string): string {
  return path.join(os.homedir(), ".kigo", "tasks", `${sanitizeId(sessionId)}.json`);
}

export class TaskManager {
  private tasks = new Map<string, TaskRecord>();
  private taskFilePath: string;
  private taskEventFilePath: string;
  private active = new Set<string>();
  private taskGraphStore = new TaskGraphStore();

  constructor(
    private readonly subAgentManager: SubAgentManager,
    private readonly sessionId: string,
  ) {
    this.taskFilePath = getTaskRunFilePath(sessionId);
    this.taskEventFilePath = getTaskEventFilePath(sessionId);
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      const content = fs.readFileSync(this.taskFilePath, "utf-8");
      const parsed = JSON.parse(content) as TaskRecord[];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.id) {
            this.tasks.set(item.id, item);
          }
        }
      }
      return;
    } catch {
      // ignore if file does not exist or invalid
    }

    try {
      const content = fs.readFileSync(getLegacyTaskFilePath(this.sessionId), "utf-8");
      const parsed = JSON.parse(content) as TaskRecord[];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.id) {
            this.tasks.set(item.id, item);
          }
        }
        this.saveToDisk();
      }
    } catch {
      // ignore if legacy file does not exist or invalid
    }
  }

  private saveToDisk(): void {
    const dir = path.dirname(this.taskFilePath);
    fs.mkdirSync(dir, { recursive: true });
    const allTasks = Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
    fs.writeFileSync(this.taskFilePath, JSON.stringify(allTasks, null, 2), "utf-8");
  }

  private appendEvent(event: TaskEventRecord): void {
    const dir = path.dirname(this.taskEventFilePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(this.taskEventFilePath, `${JSON.stringify(event)}\n`, "utf-8");
  }

  private async executeTask(id: string, options: SubAgentRunOptions): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) {
      return;
    }

    task.startedAt = Date.now();
    this.active.add(id);
    this.appendEvent({
      id: `${task.id}:started:${task.startedAt}`,
      type: "task_started",
      sessionId: this.sessionId,
      taskRunId: task.id,
      taskNodeId: task.taskNodeId,
      profile: task.profile,
      task: task.task,
      timestamp: task.startedAt,
      status: "running",
    });
    try {
      if (task.taskNodeId) {
        await this.taskGraphStore.update({
          taskId: task.taskNodeId,
          status: "in_progress",
          owner: `subagent:${this.sessionId}`,
        });
        await this.taskGraphStore.recordExecution({
          taskId: task.taskNodeId,
          runId: task.id,
          status: "running",
          startedAt: task.startedAt,
        });
      }

      const result = await this.subAgentManager.runSubAgent(options);
      task.status = "completed";
      task.output = result.output;
      task.completedAt = Date.now();
      task.lastErrorCode = undefined;
      if (task.taskNodeId) {
        await this.taskGraphStore.update({
          taskId: task.taskNodeId,
          status: "completed",
          owner: `subagent:${this.sessionId}`,
        });
        await this.taskGraphStore.recordExecution({
          taskId: task.taskNodeId,
          runId: task.id,
          status: "completed",
          startedAt: task.startedAt,
          completedAt: task.completedAt,
          output: result.output,
        });
      }
      this.appendEvent({
        id: `${task.id}:completed:${task.completedAt}`,
        type: "task_completed",
        sessionId: this.sessionId,
        taskRunId: task.id,
        taskNodeId: task.taskNodeId,
        profile: task.profile,
        task: task.task,
        timestamp: task.completedAt,
        status: "completed",
        output: result.output,
      });
      this.saveToDisk();
    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.completedAt = Date.now();
      task.lastErrorCode = "SUB_AGENT_EXECUTION_FAILED";
      if (task.taskNodeId) {
        await this.taskGraphStore.update({
          taskId: task.taskNodeId,
          status: "failed",
        });
        await this.taskGraphStore.recordExecution({
          taskId: task.taskNodeId,
          runId: task.id,
          status: "failed",
          startedAt: task.startedAt,
          completedAt: task.completedAt,
          error: task.error,
        });
      }
      this.appendEvent({
        id: `${task.id}:failed:${task.completedAt}`,
        type: "task_failed",
        sessionId: this.sessionId,
        taskRunId: task.id,
        taskNodeId: task.taskNodeId,
        profile: task.profile,
        task: task.task,
        timestamp: task.completedAt,
        status: "failed",
        error: task.error,
      });
      this.saveToDisk();
    } finally {
      this.active.delete(id);
    }
  }

  async start(options: {
    task: string;
    profile?: TaskProfile;
    context?: string;
    runInBackground?: boolean;
    taskNodeId?: number;
  }): Promise<TaskRecord> {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const profile = options.profile || "general-purpose";

    const record: TaskRecord = {
      id,
      taskNodeId: options.taskNodeId,
      profile,
      agentType: profile,
      task: options.task,
      status: "running",
      parentSessionId: this.sessionId,
      attempt: 1,
      createdAt: Date.now(),
    };

    this.tasks.set(id, record);
    this.saveToDisk();
    this.appendEvent({
      id: `${record.id}:created:${record.createdAt}`,
      type: "task_created",
      sessionId: this.sessionId,
      taskRunId: record.id,
      taskNodeId: record.taskNodeId,
      profile: record.profile,
      task: record.task,
      timestamp: record.createdAt,
      status: "running",
    });

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

  private isTaskNodeTarget(value: string): boolean {
    return /^\d+$/.test(value.trim());
  }

  private buildTaskNodeResumePrompt(
    taskNode: TaskNode,
    previous?: TaskExecutionSummary,
  ): string {
    const taskPrompt = this.buildTaskNodePrompt(taskNode);
    if (!previous) {
      return taskPrompt;
    }

    const context: string[] = [];
    if (previous.output) {
      context.push(`Previous output:\n${previous.output}`);
    }
    if (previous.error) {
      context.push(`Previous error:\n${previous.error}`);
    }
    if (context.length === 0) {
      return taskPrompt;
    }

    return `Continue this task from the latest known execution.\n\nTask:\n${taskPrompt}\n\n${context.join("\n\n")}`;
  }

  private async findTaskNodeExecutionByRunId(
    runId: string,
  ): Promise<{ taskNode: TaskNode; execution: TaskExecutionSummary } | undefined> {
    const taskNodes = await this.taskGraphStore.list();
    for (const taskNode of taskNodes) {
      const execution = taskNode.executionHistory.find((entry) => entry.runId === runId);
      if (execution) {
        return { taskNode, execution };
      }
    }
    return undefined;
  }

  private toTaskOutputViewFromNode(
    taskNode: TaskNode,
    execution: TaskExecutionSummary,
  ): TaskOutputView {
    return {
      id: execution.runId,
      source: "task_node",
      profile: "general-purpose",
      status: execution.status,
      task: taskNode.subject,
      taskNodeId: taskNode.id,
      createdAt: execution.startedAt ?? execution.updatedAt,
      completedAt: execution.completedAt,
      output: execution.output,
      error: execution.error,
    };
  }

  private appendResumeEvent(record: TaskRecord): void {
    this.appendEvent({
      id: `${record.id}:resumed:${Date.now()}`,
      type: "task_resumed",
      sessionId: this.sessionId,
      taskRunId: record.id,
      taskNodeId: record.taskNodeId,
      profile: record.profile,
      task: record.task,
      timestamp: Date.now(),
      status: record.status,
      output: record.output,
      error: record.error,
    });
  }

  list(): TaskRecord[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  get(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  getTaskRunFilePath(): string {
    return this.taskFilePath;
  }

  getTaskEventFilePath(): string {
    return this.taskEventFilePath;
  }

  async getTaskOutputView(taskId: string): Promise<TaskOutputView | undefined> {
    const existing = this.tasks.get(taskId);
    if (existing) {
      return {
        id: existing.id,
        source: "task_record",
        profile: existing.profile,
        status: existing.status,
        task: existing.task,
        taskNodeId: existing.taskNodeId,
        createdAt: existing.createdAt,
        completedAt: existing.completedAt,
        output: existing.output,
        error: existing.error,
      };
    }

    if (this.isTaskNodeTarget(taskId)) {
      const taskNode = await this.taskGraphStore.get(Number(taskId));
      const latest = taskNode.executionHistory[0];
      if (!latest) {
        return undefined;
      }
      return this.toTaskOutputViewFromNode(taskNode, latest);
    }

    const resolved = await this.findTaskNodeExecutionByRunId(taskId);
    if (!resolved) {
      return undefined;
    }

    return this.toTaskOutputViewFromNode(resolved.taskNode, resolved.execution);
  }

  async resume(taskId: string): Promise<TaskRecord | undefined> {
    const existing = this.tasks.get(taskId);
    if (existing) {
      const resumed = await this.start({
        task: `Continue this task from previous output:\n${existing.output || existing.task}`,
        profile: existing.profile,
        runInBackground: false,
      });
      resumed.parentSessionId = existing.parentSessionId;
      resumed.attempt = existing.attempt + 1;
      this.saveToDisk();
      this.appendResumeEvent(resumed);
      return resumed;
    }

    if (this.isTaskNodeTarget(taskId)) {
      const taskNode = await this.taskGraphStore.get(Number(taskId));
      const resumed = await this.start({
        task: this.buildTaskNodeResumePrompt(taskNode, taskNode.executionHistory[0]),
        profile: "general-purpose",
        runInBackground: false,
        taskNodeId: taskNode.id,
      });
      this.appendResumeEvent(resumed);
      return resumed;
    }

    const resolved = await this.findTaskNodeExecutionByRunId(taskId);
    if (!resolved) {
      return undefined;
    }

    const resumed = await this.start({
      task: this.buildTaskNodeResumePrompt(resolved.taskNode, resolved.execution),
      profile: "general-purpose",
      runInBackground: false,
      taskNodeId: resolved.taskNode.id,
    });
    this.appendResumeEvent(resumed);
    return resumed;
  }

  getStats(): { running: number; total: number; queue: number } {
    const managerStats = this.subAgentManager.getStats();
    return {
      running: this.active.size,
      total: this.tasks.size,
      queue: managerStats.queued,
    };
  }

  listTaskEvents(filters?: {
    taskNodeId?: number;
    taskRunId?: string;
    limit?: number;
  }): TaskEventRecord[] {
    try {
      const content = fs.readFileSync(this.taskEventFilePath, "utf-8");
      const records = content
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as TaskEventRecord)
        .filter((record) => {
          if (filters?.taskNodeId !== undefined && record.taskNodeId !== filters.taskNodeId) {
            return false;
          }
          if (filters?.taskRunId && record.taskRunId !== filters.taskRunId) {
            return false;
          }
          return true;
        })
        .sort((a, b) => b.timestamp - a.timestamp);
      return records.slice(0, filters?.limit ?? 20);
    } catch {
      return [];
    }
  }

  async listTaskNodes(filters?: {
    status?: TaskNodeStatus;
    owner?: string;
    readyOnly?: boolean;
  }): Promise<TaskNode[]> {
    return this.taskGraphStore.list(filters);
  }

  async getTaskNode(taskId: number): Promise<TaskNode> {
    return this.taskGraphStore.get(taskId);
  }

  async createTaskNode(input: {
    subject: string;
    description?: string;
    blockedBy?: number[];
    owner?: string;
  }): Promise<TaskNode> {
    return this.taskGraphStore.create(input);
  }

  async claimTaskNode(taskId: number, owner: string): Promise<TaskNode> {
    return this.taskGraphStore.claim(taskId, owner);
  }

  async runTaskNode(options: {
    taskId: number;
    profile?: TaskProfile;
    context?: string;
    runInBackground?: boolean;
  }): Promise<TaskRecord> {
    const taskNode = await this.taskGraphStore.get(options.taskId);
    if (taskNode.status === "completed") {
      throw new Error(`Task node already completed: ${taskNode.id}`);
    }
    if (taskNode.status === "in_progress") {
      throw new Error(`Task node already in progress: ${taskNode.id}`);
    }
    if (taskNode.blockedBy.length > 0) {
      throw new Error(`Task node is blocked: ${taskNode.id}`);
    }

    return this.start({
      task: this.buildTaskNodePrompt(taskNode),
      profile: options.profile,
      context: options.context,
      runInBackground: options.runInBackground,
      taskNodeId: taskNode.id,
    });
  }

  private buildTaskNodePrompt(taskNode: TaskNode): string {
    if (taskNode.description.trim().length === 0) {
      return taskNode.subject;
    }

    return `${taskNode.subject}\n\n${taskNode.description}`;
  }
}
