import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SubAgentManager, SubAgentRunOptions } from "@kigo/core";
import {
  MailboxStore,
  TaskGraphStore,
  type TaskExecutionSummary,
  type MailMessage,
  type MailMessageType,
  type TaskNode,
  type TaskNodeStatus,
} from "@kigo/tools";
import { GitWorktreeManager } from "./GitWorktreeManager.js";

export type TaskProfile =
  | "general-purpose"
  | "explore"
  | "plan"
  | "claude-code-guide"
  | "statusline-setup";

export type TaskStatus = "running" | "waiting" | "completed" | "failed";
export type TaskWaitingType = "input" | "approval";

export type TaskEventType =
  | "task_created"
  | "task_started"
  | "task_waiting"
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
  mailboxId?: string;
  profile: TaskProfile;
  agentType: TaskProfile;
  task: string;
  status: TaskStatus;
  parentSessionId: string;
  attempt: number;
  startedAt?: number;
  lastErrorCode?: string;
  waitingReason?: string;
  waitingType?: TaskWaitingType;
  createdAt: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

export interface TaskBatchRunOptions {
  owner?: string;
  limit?: number;
  profile?: TaskProfile;
  context?: string;
  runInBackground?: boolean;
}

export interface TaskOutputView {
  id: string;
  source: "task_record" | "task_node";
  profile: TaskProfile;
  status: TaskStatus;
  task: string;
  taskNodeId?: number;
  mailboxId?: string;
  waitingReason?: string;
  waitingType?: TaskWaitingType;
  createdAt: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

export interface TaskMailboxThreadEntry extends MailMessage {
  mailbox: "human" | "task";
}

export interface TaskProtocolRound {
  index: number;
  waitingType: TaskWaitingType;
  waitingReason?: string;
  request?: TaskMailboxThreadEntry;
  response?: TaskMailboxThreadEntry;
  outcome?: string;
}

export interface TaskDispatchTarget {
  task: TaskNode;
  mode: "execute" | "resume";
  pendingInboxCount: number;
  waitingType?: TaskWaitingType;
}

export interface TaskDispatchStats {
  resumable: number;
  executable: number;
  total: number;
}

const WAITING_FOR_INPUT_MARKER = "TASK_WAITING_FOR_INPUT";

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

function getThreadMessagePriority(type: MailMessageType): number {
  switch (type) {
    case "question":
    case "approval_request":
      return 0;
    case "note":
    case "status":
      return 1;
    case "answer":
    case "approval_decision":
      return 2;
    case "handoff":
      return 3;
    default:
      return 4;
  }
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

function summarizeText(value: string | undefined, maxChars: number): string {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxChars)}\n\n[truncated at ${maxChars} chars]`;
}

function parseWaitingDirective(output: string | undefined): { waiting: boolean; reason?: string; cleanOutput?: string } {
  if (!output) {
    return { waiting: false, cleanOutput: output };
  }

  const lines = output.split("\n");
  const directiveIndex = lines.findIndex((line) => line.trim().startsWith(WAITING_FOR_INPUT_MARKER));
  if (directiveIndex === -1) {
    return { waiting: false, cleanOutput: output };
  }

  const directive = lines[directiveIndex].trim();
  const reason = directive.includes(":")
    ? directive.slice(directive.indexOf(":") + 1).trim() || undefined
    : undefined;
  const cleanOutput = lines
    .filter((_, index) => index !== directiveIndex)
    .join("\n")
    .trim();

  return {
    waiting: true,
    reason,
    cleanOutput: cleanOutput || undefined,
  };
}

export class TaskManager {
  private tasks = new Map<string, TaskRecord>();
  private taskFilePath: string;
  private taskEventFilePath: string;
  private active = new Set<string>();
  private taskGraphStore = new TaskGraphStore();
  private readonly projectRoot: string;
  private readonly worktreeManager: GitWorktreeManager;
  private readonly mailboxStore: MailboxStore;

  constructor(
    private readonly subAgentManager: SubAgentManager,
    private readonly sessionId: string,
  ) {
    this.projectRoot = getProjectRoot();
    this.taskFilePath = getTaskRunFilePath(sessionId);
    this.taskEventFilePath = getTaskEventFilePath(sessionId);
    this.worktreeManager = new GitWorktreeManager(this.projectRoot);
    this.mailboxStore = new MailboxStore(this.projectRoot);
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

  private formatMailboxMessages(messages: MailMessage[]): string {
    return messages
      .map((message, index) => {
        const parts = [
          `${index + 1}. [${message.type}] from ${message.from}`,
          `subject: ${message.subject}`,
          `body:\n${summarizeText(message.body, 800)}`,
        ];
        if (message.taskId !== undefined) {
          parts.push(`taskId: ${message.taskId}`);
        }
        if (message.runId) {
          parts.push(`runId: ${message.runId}`);
        }
        return parts.join("\n");
      })
      .join("\n\n");
  }

  private async acknowledgeTaskInboxMessages(taskNodeId: number, messages: MailMessage[]): Promise<void> {
    const mailboxId = this.getTaskAgentId(taskNodeId);
    await Promise.all(
      messages
        .filter((message) => !message.acknowledgedAt)
        .map((message) =>
          this.mailboxStore.acknowledge(mailboxId, message.id, "system:task_manager")
        ),
    );
  }

  private buildTaskMailboxProtocol(taskNodeId: number, pendingMessages: MailMessage[]): string {
    const agentId = this.getTaskAgentId(taskNodeId);
    const sections = [
      `Task mailbox protocol:`,
      `- Your mailbox identity is ${agentId}.`,
      `- Use mail_inbox with agent "${agentId}" when you need to inspect pending messages.`,
      `- Use mail_ack with agent "${agentId}" after you have handled a message.`,
      `- Use mail_send to send blockers, questions, or handoff notes to "human". Include taskId ${taskNodeId} whenever possible.`,
      `- If you are blocked on human input, first send a mail_send message to "human" with type "question" or "approval_request", then end your final response with exactly: ${WAITING_FOR_INPUT_MARKER}: <brief reason>.`,
      `- Final completion and failure notifications are sent automatically after your run; only send extra mail when human input or special handoff detail is needed.`,
    ];

    if (pendingMessages.length > 0) {
      sections.push(`Pending mailbox messages:\n${this.formatMailboxMessages(pendingMessages)}`);
    }

    return sections.join("\n");
  }

  private async findLatestHumanMessageForTask(
    taskNodeId: number,
    types?: MailMessageType[],
  ): Promise<MailMessage | undefined> {
    const messages = await this.mailboxStore.list("human", {
      includeAcknowledged: false,
      limit: 200,
    });

    return messages.find((message) => {
      if (message.taskId !== taskNodeId) {
        return false;
      }
      if (types && types.length > 0 && !types.includes(message.type)) {
        return false;
      }
      return true;
    });
  }

  private async detectWaitingType(task: TaskRecord, agentId?: string): Promise<TaskWaitingType> {
    if (task.taskNodeId === undefined || !agentId) {
      return "input";
    }

    const latest = await this.findLatestHumanMessageForTask(task.taskNodeId, [
      "approval_request",
      "question",
    ]);
    if (latest?.type === "approval_request") {
      return "approval";
    }
    return "input";
  }

  private async acknowledgeHumanRequest(taskNodeId: number, types: MailMessageType[]): Promise<void> {
    const message = await this.findLatestHumanMessageForTask(taskNodeId, types);
    if (!message) {
      return;
    }
    await this.mailboxStore.acknowledge("human", message.id, `human:${this.sessionId}`);
  }

  private async resolveTaskReference(taskId: string): Promise<{
    mailboxId: string;
    taskNodeId: number;
    sourceRunId?: string;
    record?: TaskRecord;
  }> {
    if (this.isTaskNodeTarget(taskId)) {
      const taskNodeId = Number(taskId);
      const latestRecord = this.list().find((entry) => entry.taskNodeId === taskNodeId);
      return {
        mailboxId: this.getTaskAgentId(taskNodeId),
        taskNodeId,
        sourceRunId: latestRecord?.id,
        record: latestRecord,
      };
    }

    const record = this.tasks.get(taskId);
    if (record?.taskNodeId !== undefined) {
      return {
        mailboxId: record.mailboxId || this.getTaskAgentId(record.taskNodeId),
        taskNodeId: record.taskNodeId,
        sourceRunId: record.id,
        record,
      };
    }

    const resolved = await this.findTaskNodeExecutionByRunId(taskId);
    if (!resolved) {
      throw new Error(`Task not found or does not support answers: ${taskId}`);
    }

    return {
      mailboxId: this.getTaskAgentId(resolved.taskNode.id),
      taskNodeId: resolved.taskNode.id,
      sourceRunId: taskId,
    };
  }

  private async sendTaskLifecycleMail(input: {
    task: TaskRecord;
    agentId?: string;
    status: TaskStatus;
    output?: string;
    error?: string;
  }): Promise<void> {
    if (!input.agentId || input.task.taskNodeId === undefined) {
      return;
    }

    const type: MailMessageType = input.status === "completed" ? "handoff" : "status";
    const subjectPrefix = input.status === "completed" ? "Task completed" : "Task failed";
    const detail = input.status === "completed"
      ? summarizeText(input.output, 1200) || "Task finished without additional output."
      : summarizeText(input.error, 1200) || "Task failed without an error message.";

    await this.mailboxStore.send({
      from: input.agentId,
      to: "human",
      type,
      subject: `${subjectPrefix}: #${input.task.taskNodeId} ${input.task.task.slice(0, 80)}`,
      body: [
        `taskId: ${input.task.taskNodeId}`,
        `runId: ${input.task.id}`,
        `status: ${input.status}`,
        "",
        detail,
      ].join("\n"),
      taskId: input.task.taskNodeId,
      runId: input.task.id,
    });
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
      const waiting = parseWaitingDirective(result.output);
      task.output = waiting.cleanOutput;
      task.error = undefined;
      task.completedAt = Date.now();

      if (waiting.waiting) {
        task.status = "waiting";
        task.waitingReason = waiting.reason;
        task.waitingType = await this.detectWaitingType(task, options.agentId);
        task.lastErrorCode = "WAITING_FOR_INPUT";
        if (task.taskNodeId) {
          await this.taskGraphStore.recordExecution({
            taskId: task.taskNodeId,
            runId: task.id,
            status: "waiting",
            startedAt: task.startedAt,
            completedAt: task.completedAt,
            output: task.output,
            error: waiting.reason,
          });
        }
        this.appendEvent({
          id: `${task.id}:waiting:${task.completedAt}`,
          type: "task_waiting",
          sessionId: this.sessionId,
          taskRunId: task.id,
          taskNodeId: task.taskNodeId,
          profile: task.profile,
          task: task.task,
          timestamp: task.completedAt,
          status: "waiting",
          output: task.output,
          error: waiting.reason,
        });
        this.saveToDisk();
        return;
      }

      task.status = "completed";
      task.waitingReason = undefined;
      task.waitingType = undefined;
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
      await this.sendTaskLifecycleMail({
        task,
        agentId: options.agentId,
        status: "completed",
        output: result.output,
      });
      this.saveToDisk();
    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.waitingReason = undefined;
      task.waitingType = undefined;
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
      await this.sendTaskLifecycleMail({
        task,
        agentId: options.agentId,
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
    projectRoot?: string;
    agentId?: string;
  }): Promise<TaskRecord> {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const profile = options.profile || "general-purpose";

    const record: TaskRecord = {
      id,
      taskNodeId: options.taskNodeId,
      mailboxId: options.agentId,
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
      projectRoot: options.projectRoot,
      agentId: options.agentId,
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

  private getDefaultTaskOwner(): string {
    return `subagent:${this.sessionId}`;
  }

  private getTaskAgentId(taskNodeId: number): string {
    return `task:${taskNodeId}`;
  }

  private async buildTaskExecutionContext(
    baseContext: string | undefined,
    projectRoot: string,
    taskNodeId?: number,
  ): Promise<string | undefined> {
    const sections = [baseContext];

    if (projectRoot !== this.projectRoot) {
      sections.push(
        `Use this isolated git worktree as the execution root for all file, search, shell, and git operations:\n${projectRoot}`,
      );
    }

    if (taskNodeId !== undefined) {
      const pendingMessages = await this.mailboxStore.list(this.getTaskAgentId(taskNodeId), {
        limit: 5,
      });
      sections.push(this.buildTaskMailboxProtocol(taskNodeId, pendingMessages));
      if (pendingMessages.length > 0) {
        await this.acknowledgeTaskInboxMessages(taskNodeId, pendingMessages);
      }
    }

    const combined = sections.filter(Boolean).join("\n\n");
    return combined || undefined;
  }

  private async prepareTaskProjectRoot(taskNode: TaskNode): Promise<string> {
    const worktreePath = await this.worktreeManager.ensureTaskWorktree(taskNode.id, taskNode.worktree);
    if (!worktreePath) {
      return this.projectRoot;
    }

    if (taskNode.worktree !== worktreePath) {
      await this.taskGraphStore.update({
        taskId: taskNode.id,
        worktree: worktreePath,
      });
    }

    return worktreePath;
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

  getLatestTaskRecordForTaskNode(taskNodeId: number): TaskRecord | undefined {
    return this.list().find((task) => task.taskNodeId === taskNodeId);
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
        mailboxId: existing.mailboxId,
        waitingReason: existing.waitingReason,
        waitingType: existing.waitingType,
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

  async getTaskMailboxThread(
    taskId: string,
    options: { includeAcknowledged?: boolean } = {},
  ): Promise<TaskMailboxThreadEntry[]> {
    const target = await this.resolveTaskReference(taskId);
    const [humanMessages, taskMessages] = await Promise.all([
      this.mailboxStore.list("human", {
        includeAcknowledged: options.includeAcknowledged ?? true,
        limit: 200,
      }),
      this.mailboxStore.list(target.mailboxId, {
        includeAcknowledged: options.includeAcknowledged ?? true,
        limit: 200,
      }),
    ]);

    return [
      ...humanMessages
        .filter((message) => message.taskId === target.taskNodeId)
        .map((message) => ({ ...message, mailbox: "human" as const })),
      ...taskMessages
        .filter((message) => message.taskId === undefined || message.taskId === target.taskNodeId)
        .map((message) => ({ ...message, mailbox: "task" as const })),
    ].sort(
      (a, b) =>
        a.createdAt - b.createdAt ||
        getThreadMessagePriority(a.type) - getThreadMessagePriority(b.type) ||
        a.id.localeCompare(b.id),
    );
  }

  async getTaskProtocolView(taskId: string): Promise<TaskProtocolRound[]> {
    const target = await this.resolveTaskReference(taskId);
    const thread = await this.getTaskMailboxThread(taskId, { includeAcknowledged: true });
    const events = this.listTaskEvents({ taskNodeId: target.taskNodeId, limit: 200 }).reverse();
    const waitingEvents = events.filter((event) => event.type === "task_waiting");

    return waitingEvents.map((waitingEvent, index) => {
      const nextWaiting = waitingEvents[index + 1];
      const nextWaitingAt = nextWaiting?.timestamp ?? Number.POSITIVE_INFINITY;
      const currentEventIndex = events.findIndex((event) => event.id === waitingEvent.id);
      const nextWaitingEventIndex =
        nextWaiting ? events.findIndex((event) => event.id === nextWaiting.id) : events.length;
      const request = [...thread]
        .reverse()
        .find((message) =>
          message.createdAt <= waitingEvent.timestamp &&
          message.createdAt < nextWaitingAt &&
          (message.type === "question" || message.type === "approval_request")
        );
      const requestIndex = request ? thread.findIndex((message) => message.id === request.id) : -1;
      const responseSearchStart = requestIndex >= 0 ? requestIndex + 1 : 0;
      const response = thread
        .slice(responseSearchStart)
        .find((message) =>
          message.createdAt < nextWaitingAt &&
          (message.type === "answer" || message.type === "approval_decision")
        );
      const responseIndex = response ? thread.findIndex((message) => message.id === response.id) : requestIndex;
      const lifecycleMail = thread
        .slice(responseIndex >= 0 ? responseIndex + 1 : responseSearchStart)
        .find((message) =>
          message.createdAt < nextWaitingAt &&
          (message.type === "handoff" || message.type === "status")
        );

      const roundEvents = events.slice(
        currentEventIndex >= 0 ? currentEventIndex + 1 : 0,
        nextWaitingEventIndex >= 0 ? nextWaitingEventIndex : events.length,
      );
      const resumed = roundEvents.find((event) => event.type === "task_resumed");
      const terminalCandidates = nextWaitingEventIndex >= 0 && nextWaitingEventIndex < events.length
        ? [...roundEvents, events[nextWaitingEventIndex]]
        : roundEvents;
      const terminal = terminalCandidates.find((event) =>
        event.type === "task_completed" || event.type === "task_failed" || event.type === "task_waiting"
      );

      const outcomeParts: string[] = [];
      if (response) {
        outcomeParts.push("continued");
      }
      if (resumed) {
        outcomeParts.push(`resumed:${resumed.taskRunId}`);
      }
      if (terminal) {
        outcomeParts.push(`${terminal.type}:${terminal.status}`);
      }
      if (lifecycleMail) {
        outcomeParts.push(`mail:${lifecycleMail.type}`);
      }

      const waitingType: TaskWaitingType = request?.type === "approval_request" ? "approval" : "input";

      return {
        index: index + 1,
        waitingType,
        waitingReason: waitingEvent.error,
        request,
        response,
        outcome: outcomeParts.join(" -> ") || undefined,
      };
    });
  }

  private async listResumableWaitingTargets(options: {
    owner?: string;
    limit?: number;
  } = {}): Promise<TaskDispatchTarget[]> {
    const owner = options.owner || this.getDefaultTaskOwner();
    const taskNodes = await this.taskGraphStore.list({ status: "in_progress", owner });
    const targets: TaskDispatchTarget[] = [];

    for (const taskNode of taskNodes) {
      if (targets.length >= (options.limit ?? Number.POSITIVE_INFINITY)) {
        break;
      }

      const latestRecord = this.getLatestTaskRecordForTaskNode(taskNode.id);
      if (!latestRecord || latestRecord.status !== "waiting") {
        continue;
      }

      const pendingMessages = await this.mailboxStore.list(this.getTaskAgentId(taskNode.id), {
        limit: 20,
      });
      if (pendingMessages.length === 0) {
        continue;
      }

      targets.push({
        task: taskNode,
        mode: "resume",
        pendingInboxCount: pendingMessages.length,
        waitingType: latestRecord.waitingType,
      });
    }

    return targets;
  }

  async listDispatchTargets(options: {
    owner?: string;
    limit?: number;
  } = {}): Promise<TaskDispatchTarget[]> {
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    const resumeTargets = await this.listResumableWaitingTargets({
      owner: options.owner,
      limit,
    });
    if (resumeTargets.length >= limit) {
      return resumeTargets.slice(0, limit);
    }

    const readyTasks = await this.taskGraphStore.list({ readyOnly: true });
    const executeTargets = readyTasks
      .filter((task) => {
        const owner = options.owner || this.getDefaultTaskOwner();
        if (task.owner && task.owner !== owner) {
          return false;
        }
        return !resumeTargets.some((target) => target.task.id === task.id);
      })
      .slice(0, Math.max(0, limit - resumeTargets.length))
      .map((task) => ({
        task,
        mode: "execute" as const,
        pendingInboxCount: 0,
      }));

    return [...resumeTargets, ...executeTargets];
  }

  async getDispatchStats(options: {
    owner?: string;
  } = {}): Promise<TaskDispatchStats> {
    const owner = options.owner || this.getDefaultTaskOwner();
    const resumeTargets = await this.listResumableWaitingTargets({
      owner,
      limit: Number.POSITIVE_INFINITY,
    });
    const resumableTaskIds = new Set(resumeTargets.map((target) => target.task.id));
    const readyTasks = await this.taskGraphStore.list({ readyOnly: true });
    const executable = readyTasks.filter((task) => {
      if (task.owner && task.owner !== owner) {
        return false;
      }
      return !resumableTaskIds.has(task.id);
    }).length;

    return {
      resumable: resumeTargets.length,
      executable,
      total: resumeTargets.length + executable,
    };
  }

  async runResumableTaskNodes(options: {
    owner?: string;
    limit?: number;
    runInBackground?: boolean;
  } = {}): Promise<TaskRecord[]> {
    const targets = await this.listResumableWaitingTargets({
      owner: options.owner,
      limit: options.limit,
    });

    const records: TaskRecord[] = [];
    for (const target of targets) {
      const resumed = await this.resume(String(target.task.id), {
        runInBackground: options.runInBackground,
      });
      if (resumed) {
        records.push(resumed);
      }
    }

    return records;
  }

  async resume(
    taskId: string,
    options: { runInBackground?: boolean } = {},
  ): Promise<TaskRecord | undefined> {
    const existing = this.tasks.get(taskId);
    if (existing) {
      const resumed = await this.start({
        task: `Continue this task from previous output:\n${existing.output || existing.task}`,
        profile: existing.profile,
        runInBackground: options.runInBackground,
        agentId: existing.mailboxId,
      });
      resumed.parentSessionId = existing.parentSessionId;
      resumed.attempt = existing.attempt + 1;
      this.saveToDisk();
      this.appendResumeEvent(resumed);
      return resumed;
    }

    if (this.isTaskNodeTarget(taskId)) {
      const taskNode = await this.taskGraphStore.get(Number(taskId));
      const projectRoot = await this.prepareTaskProjectRoot(taskNode);
      const resumed = await this.start({
        task: this.buildTaskNodeResumePrompt(taskNode, taskNode.executionHistory[0]),
        profile: "general-purpose",
        context: await this.buildTaskExecutionContext(undefined, projectRoot, taskNode.id),
        runInBackground: options.runInBackground,
        taskNodeId: taskNode.id,
        projectRoot,
        agentId: this.getTaskAgentId(taskNode.id),
      });
      this.appendResumeEvent(resumed);
      return resumed;
    }

    const resolved = await this.findTaskNodeExecutionByRunId(taskId);
    if (!resolved) {
      return undefined;
    }

    const projectRoot = await this.prepareTaskProjectRoot(resolved.taskNode);

    const resumed = await this.start({
      task: this.buildTaskNodeResumePrompt(resolved.taskNode, resolved.execution),
      profile: "general-purpose",
      context: await this.buildTaskExecutionContext(undefined, projectRoot, resolved.taskNode.id),
      runInBackground: options.runInBackground,
      taskNodeId: resolved.taskNode.id,
      projectRoot,
      agentId: this.getTaskAgentId(resolved.taskNode.id),
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

  async autoClaimTaskNodes(options: { owner?: string; limit?: number } = {}): Promise<TaskNode[]> {
    const owner = options.owner || this.getDefaultTaskOwner();
    const limit = options.limit ?? 1;
    const readyTasks = await this.taskGraphStore.list({ readyOnly: true });
    const claimed: TaskNode[] = [];

    for (const task of readyTasks) {
      if (claimed.length >= limit) {
        break;
      }
      if (task.owner && task.owner !== owner) {
        continue;
      }
      claimed.push(task.owner === owner ? task : await this.taskGraphStore.claim(task.id, owner));
    }

    return claimed;
  }

  async cleanupTaskWorktree(taskId: number): Promise<{ task: TaskNode; removed: boolean }> {
    const task = await this.taskGraphStore.get(taskId);
    const removed = await this.worktreeManager.cleanupWorktree(task.worktree);
    if (!removed) {
      return { task, removed };
    }

    const updated = await this.taskGraphStore.update({
      taskId,
      clearWorktree: true,
    });
    return { task: updated, removed };
  }

  async runReadyTaskNodes(options: TaskBatchRunOptions = {}): Promise<TaskRecord[]> {
    const records: TaskRecord[] = [];
    const targets = await this.listDispatchTargets({
      owner: options.owner,
      limit: options.limit,
    });

    for (const target of targets) {
      if (target.mode === "resume") {
        const resumed = await this.resume(String(target.task.id), {
          runInBackground: options.runInBackground,
        });
        if (resumed) {
          records.push(resumed);
        }
        continue;
      }

      const claimed = target.task.owner
        ? target.task
        : await this.taskGraphStore.claim(target.task.id, options.owner || this.getDefaultTaskOwner());
      records.push(
        await this.runTaskNode({
          taskId: claimed.id,
          profile: options.profile,
          context: options.context,
          runInBackground: options.runInBackground,
        }),
      );
    }

    return records;
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

    const projectRoot = await this.prepareTaskProjectRoot(taskNode);

    return this.start({
      task: this.buildTaskNodePrompt(taskNode),
      profile: options.profile,
      context: await this.buildTaskExecutionContext(options.context, projectRoot, taskNode.id),
      runInBackground: options.runInBackground,
      taskNodeId: taskNode.id,
      projectRoot,
      agentId: this.getTaskAgentId(taskNode.id),
    });
  }

  async answerTask(
    taskId: string,
    answer: string,
  ): Promise<{ mailboxId: string; resumed?: TaskRecord }> {
    const trimmed = answer.trim();
    if (!trimmed) {
      throw new Error("Answer cannot be empty.");
    }
    const target = await this.resolveTaskReference(taskId);
    if (target.record?.waitingType === "approval") {
      throw new Error(`Task requires approval. Use /task approve ${taskId} [approve|reject] -- <message>.`);
    }

    await this.mailboxStore.send({
      from: `human:${this.sessionId}`,
      to: target.mailboxId,
      type: "answer",
      subject: `Answer for task #${target.taskNodeId}`,
      body: trimmed,
      taskId: target.taskNodeId,
      runId: target.sourceRunId,
    });
    await this.acknowledgeHumanRequest(target.taskNodeId, ["question"]);
    const resumed = await this.resume(String(target.taskNodeId));
    return { mailboxId: target.mailboxId, resumed };
  }

  async approveTask(
    taskId: string,
    approved: boolean,
    note?: string,
  ): Promise<{ mailboxId: string; resumed?: TaskRecord }> {
    const target = await this.resolveTaskReference(taskId);
    const decision = approved ? "approved" : "rejected";

    await this.mailboxStore.send({
      from: `human:${this.sessionId}`,
      to: target.mailboxId,
      type: "approval_decision",
      subject: `${decision} task #${target.taskNodeId}`,
      body: [approved ? "Decision: approve" : "Decision: reject", note?.trim()].filter(Boolean).join("\n\n"),
      taskId: target.taskNodeId,
      runId: target.sourceRunId,
    });
    await this.acknowledgeHumanRequest(target.taskNodeId, ["approval_request"]);
    const resumed = await this.resume(String(target.taskNodeId));
    return { mailboxId: target.mailboxId, resumed };
  }

  private buildTaskNodePrompt(taskNode: TaskNode): string {
    if (taskNode.description.trim().length === 0) {
      return taskNode.subject;
    }

    return `${taskNode.subject}\n\n${taskNode.description}`;
  }
}
