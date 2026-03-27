import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { TaskManager } from "./TaskManager.js";
import { MailboxStore } from "@kigo/tools";

const execFile = promisify(execFileCallback);
const originalProjectRoot = process.env.KIGO_PROJECT_ROOT;
const originalHome = process.env.HOME;
const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function initGitRepo(root: string): Promise<void> {
  await execFile("git", ["init"], { cwd: root });
  await execFile("git", ["config", "user.email", "kigo@example.com"], { cwd: root });
  await execFile("git", ["config", "user.name", "Kigo Test"], { cwd: root });
  await fs.writeFile(path.join(root, "README.md"), "# test\n", "utf-8");
  await execFile("git", ["add", "README.md"], { cwd: root });
  await execFile("git", ["commit", "-m", "init"], { cwd: root });
}

afterEach(async () => {
  if (originalProjectRoot === undefined) {
    delete process.env.KIGO_PROJECT_ROOT;
  } else {
    process.env.KIGO_PROJECT_ROOT = originalProjectRoot;
  }

  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }

  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("TaskManager", () => {
  it("executes a task graph node and marks it completed", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    let lastRunOptions: { task: string; context?: string; agentId?: string } | undefined;
    const subAgentManager = {
      async runSubAgent(options: { task: string; context?: string; agentId?: string }) {
        lastRunOptions = options;
        return {
          output: `executed:${options.task}`,
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_test");
    const node = await manager.createTaskNode({
      subject: "Implement feature",
      description: "Touch the code path",
    });

    const record = await manager.runTaskNode({
      taskId: node.id,
      profile: "general-purpose",
      runInBackground: false,
    });

    expect(record.taskNodeId).toBe(node.id);
    expect(record.status).toBe("completed");
    expect(record.output).toContain("executed:Implement feature");

    const updatedNode = await manager.getTaskNode(node.id);
    expect(updatedNode.status).toBe("completed");
    expect(updatedNode.owner).toBe("subagent:session_test");
    expect(updatedNode.lastRunId).toBe(record.id);
    expect(updatedNode.lastRunStatus).toBe("completed");
    expect(updatedNode.lastRunOutput).toContain("executed:Implement feature");
    expect(updatedNode.executionHistory).toHaveLength(1);
    expect(updatedNode.executionHistory[0].runId).toBe(record.id);
    expect(updatedNode.executionHistory[0].status).toBe("completed");
    expect(updatedNode.executionHistory[0].startedAt).toBeTypeOf("number");
    expect(updatedNode.executionHistory[0].completedAt).toBeTypeOf("number");
    expect(updatedNode.executionHistory[0].output).toContain("executed:Implement feature");

    const runFile = manager.getTaskRunFilePath();
    expect(runFile).toContain(path.join(".kigo", "state", "task-runs"));
    expect(await fs.readFile(runFile, "utf-8")).toContain(record.id);

    const eventFile = manager.getTaskEventFilePath();
    expect(eventFile).toContain(path.join(".kigo", "state", "task-events"));
    const eventTypes = (await fs.readFile(eventFile, "utf-8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).type);
    expect(eventTypes).toEqual(["task_created", "task_started", "task_completed"]);

    const history = manager.listTaskEvents({ taskNodeId: node.id });
    expect(history.map((event) => event.type)).toContain("task_completed");
    expect(lastRunOptions?.agentId).toBe(`task:${node.id}`);
    expect(lastRunOptions?.context).toContain(`Your mailbox identity is task:${node.id}.`);

    const mailboxStore = new MailboxStore(projectRoot);
    const humanMail = await mailboxStore.list("human", { includeAcknowledged: true });
    expect(humanMail).toHaveLength(1);
    expect(humanMail[0].type).toBe("handoff");
    expect(humanMail[0].from).toBe(`task:${node.id}`);
    expect(humanMail[0].subject).toContain(`Task completed: #${node.id}`);
  });

  it("marks a task graph node as failed and records failure history", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-failed-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    const subAgentManager = {
      async runSubAgent() {
        throw new Error("boom");
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_test");
    const node = await manager.createTaskNode({
      subject: "Break the task",
      description: "",
    });

    const record = await manager.runTaskNode({
      taskId: node.id,
      profile: "general-purpose",
      runInBackground: false,
    });

    expect(record.status).toBe("failed");
    expect(record.error).toContain("boom");

    const updatedNode = await manager.getTaskNode(node.id);
    expect(updatedNode.status).toBe("failed");
    expect(updatedNode.lastRunId).toBe(record.id);
    expect(updatedNode.lastRunStatus).toBe("failed");
    expect(updatedNode.lastRunError).toContain("boom");
    expect(updatedNode.executionHistory).toHaveLength(1);
    expect(updatedNode.executionHistory[0].runId).toBe(record.id);
    expect(updatedNode.executionHistory[0].status).toBe("failed");
    expect(updatedNode.executionHistory[0].startedAt).toBeTypeOf("number");
    expect(updatedNode.executionHistory[0].completedAt).toBeTypeOf("number");
    expect(updatedNode.executionHistory[0].error).toContain("boom");

    const history = manager.listTaskEvents({ taskNodeId: node.id });
    expect(history.map((event) => event.type)).toContain("task_failed");

    const mailboxStore = new MailboxStore(projectRoot);
    const humanMail = await mailboxStore.list("human", { includeAcknowledged: true });
    expect(humanMail).toHaveLength(1);
    expect(humanMail[0].type).toBe("status");
    expect(humanMail[0].subject).toContain(`Task failed: #${node.id}`);
    expect(humanMail[0].body).toContain("boom");
  });

  it("migrates legacy task run files into the project state directory", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-project-");
    const fakeHome = await createTempDir("kigo-task-manager-home-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;
    process.env.HOME = fakeHome;

    const legacyDir = path.join(fakeHome, ".kigo", "tasks");
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, "session_test.json"),
      JSON.stringify([
        {
          id: "task_legacy",
          profile: "general-purpose",
          agentType: "general-purpose",
          task: "Legacy task",
          status: "completed",
          parentSessionId: "session_test",
          attempt: 1,
          createdAt: Date.now(),
          output: "legacy output",
        },
      ]),
      "utf-8",
    );

    const subAgentManager = {
      async runSubAgent() {
        return {
          output: "",
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_test");
    const migrated = manager.get("task_legacy");
    expect(migrated?.output).toBe("legacy output");
    expect(await fs.readFile(manager.getTaskRunFilePath(), "utf-8")).toContain("task_legacy");
  });

  it("reads task output from node-owned history when the run store is unavailable", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-derived-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    const subAgentManager = {
      async runSubAgent(options: { task: string }) {
        return {
          output: `derived:${options.task}`,
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_test");
    const node = await manager.createTaskNode({ subject: "Recover output" });
    const record = await manager.runTaskNode({
      taskId: node.id,
      runInBackground: false,
    });

    await fs.rm(manager.getTaskRunFilePath(), { force: true });

    const recovered = new TaskManager(subAgentManager as any, "session_test");
    expect(recovered.get(record.id)).toBeUndefined();

    const byRunId = await recovered.getTaskOutputView(record.id);
    expect(byRunId?.source).toBe("task_node");
    expect(byRunId?.taskNodeId).toBe(node.id);
    expect(byRunId?.output).toContain("derived:Recover output");

    const byNodeId = await recovered.getTaskOutputView(String(node.id));
    expect(byNodeId?.source).toBe("task_node");
    expect(byNodeId?.id).toBe(record.id);
  });

  it("resumes a run from node-owned history when the run store is unavailable", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-resume-derived-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    const subAgentManager = {
      async runSubAgent(options: { task: string }) {
        return {
          output: `resume:${options.task}`,
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_test");
    const node = await manager.createTaskNode({ subject: "Recover resume" });
    const record = await manager.runTaskNode({
      taskId: node.id,
      runInBackground: false,
    });

    await fs.rm(manager.getTaskRunFilePath(), { force: true });

    const recovered = new TaskManager(subAgentManager as any, "session_test");
    const resumed = await recovered.resume(record.id);
    expect(resumed?.taskNodeId).toBe(node.id);
    expect(resumed?.status).toBe("completed");

    const updatedNode = await recovered.getTaskNode(node.id);
    expect(updatedNode.executionHistory).toHaveLength(2);
    expect(updatedNode.executionHistory[0].runId).toBe(resumed?.id);
    expect(updatedNode.executionHistory[1].runId).toBe(record.id);
  });

  it("auto-claims and executes ready task nodes", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-ready-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    const subAgentManager = {
      async runSubAgent(options: { task: string; projectRoot?: string }) {
        return {
          output: `ready:${options.task}:${options.projectRoot || "none"}`,
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_ready");
    await manager.createTaskNode({ subject: "Ready one" });
    await manager.createTaskNode({ subject: "Ready two" });

    const claimed = await manager.autoClaimTaskNodes({ limit: 2 });
    expect(claimed).toHaveLength(2);
    expect(claimed.every((task) => task.owner === "subagent:session_ready")).toBe(true);

    const records = await manager.runReadyTaskNodes({ limit: 2 });
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.status === "completed")).toBe(true);
  });

  it("prioritizes resumable waiting tasks with new inbox mail over fresh ready tasks", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-dispatch-priority-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    let callCount = 0;
    const contexts: string[] = [];
    const subAgentManager = {
      async runSubAgent(options: { context?: string; task: string }) {
        callCount += 1;
        contexts.push(options.context || "");
        if (callCount === 1) {
          return {
            output: "TASK_WAITING_FOR_INPUT: waiting for a schema answer",
            durationMs: 1,
            messages: [],
          };
        }

        return {
          output: `completed:${options.task}`,
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_dispatch");
    const waitingNode = await manager.createTaskNode({ subject: "Waiting task" });
    const readyNode = await manager.createTaskNode({ subject: "Fresh ready task" });

    const waitingRun = await manager.runTaskNode({
      taskId: waitingNode.id,
      runInBackground: false,
    });
    expect(waitingRun.status).toBe("waiting");

    const mailboxStore = new MailboxStore(projectRoot);
    await mailboxStore.send({
      from: "human:session_dispatch",
      to: `task:${waitingNode.id}`,
      type: "answer",
      subject: "Schema answer",
      body: "Use schema D.",
      taskId: waitingNode.id,
    });

    const targets = await manager.listDispatchTargets({ limit: 2 });
    expect(targets[0].task.id).toBe(waitingNode.id);
    expect(targets[0].mode).toBe("resume");
    expect(targets[1].task.id).toBe(readyNode.id);
    expect(targets[1].mode).toBe("execute");

    const records = await manager.runReadyTaskNodes({ limit: 1 });
    expect(records).toHaveLength(1);
    expect(records[0].taskNodeId).toBe(waitingNode.id);
    expect(records[0].status).toBe("completed");
    expect(contexts[1]).toContain("Use schema D.");

    const readyStillPending = await manager.getTaskNode(readyNode.id);
    expect(readyStillPending.status).toBe("pending");
  });

  it("runs only resumable waiting tasks in the resumable helper", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-resumable-helper-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    let callCount = 0;
    const contexts: string[] = [];
    const subAgentManager = {
      async runSubAgent(options: { context?: string; task: string }) {
        callCount += 1;
        contexts.push(options.context || "");
        if (callCount === 1) {
          return {
            output: "TASK_WAITING_FOR_INPUT: waiting for answer",
            durationMs: 1,
            messages: [],
          };
        }

        return {
          output: `done:${options.task}`,
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_resumable_helper");
    const waitingNode = await manager.createTaskNode({ subject: "Waiting target" });
    const readyNode = await manager.createTaskNode({ subject: "Fresh pending target" });

    const waitingRun = await manager.runTaskNode({ taskId: waitingNode.id, runInBackground: false });
    expect(waitingRun.status).toBe("waiting");

    const mailboxStore = new MailboxStore(projectRoot);
    await mailboxStore.send({
      from: "human:session_resumable_helper",
      to: `task:${waitingNode.id}`,
      type: "answer",
      subject: "Resume",
      body: "Continue now.",
      taskId: waitingNode.id,
    });

    const records = await manager.runResumableTaskNodes({ limit: 2 });
    expect(records).toHaveLength(1);
    expect(records[0].taskNodeId).toBe(waitingNode.id);
    expect(records[0].status).toBe("completed");
    expect(contexts[1]).toContain("Continue now.");

    const untouchedReadyNode = await manager.getTaskNode(readyNode.id);
    expect(untouchedReadyNode.status).toBe("pending");
  });

  it("reports dispatch stats for resumable and executable task nodes", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-dispatch-stats-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    let callCount = 0;
    const subAgentManager = {
      async runSubAgent() {
        callCount += 1;
        if (callCount === 1) {
          return {
            output: "TASK_WAITING_FOR_INPUT: waiting for human input",
            durationMs: 1,
            messages: [],
          };
        }

        return {
          output: "completed",
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_dispatch_stats");
    const waitingNode = await manager.createTaskNode({ subject: "Waiting target" });
    await manager.createTaskNode({ subject: "Fresh ready target" });

    const waitingRun = await manager.runTaskNode({
      taskId: waitingNode.id,
      runInBackground: false,
    });
    expect(waitingRun.status).toBe("waiting");

    const mailboxStore = new MailboxStore(projectRoot);
    await mailboxStore.send({
      from: "human:session_dispatch_stats",
      to: `task:${waitingNode.id}`,
      type: "answer",
      subject: "Resume",
      body: "Continue.",
      taskId: waitingNode.id,
    });

    const stats = await manager.getDispatchStats();
    expect(stats).toEqual({
      resumable: 1,
      executable: 1,
      total: 2,
    });
  });

  it("injects pending mailbox messages into task execution context", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-mailbox-context-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    let lastRunOptions: { context?: string; agentId?: string } | undefined;
    const subAgentManager = {
      async runSubAgent(options: { context?: string; agentId?: string }) {
        lastRunOptions = options;
        return {
          output: "context-loaded",
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_mailbox_context");
    const node = await manager.createTaskNode({ subject: "Read mailbox context" });

    const mailboxStore = new MailboxStore(projectRoot);
    await mailboxStore.send({
      from: "human:session_mailbox_context",
      to: `task:${node.id}`,
      type: "question",
      subject: "Need a status update",
      body: "Tell me whether the task is blocked.",
      taskId: node.id,
    });

    await manager.runTaskNode({
      taskId: node.id,
      runInBackground: false,
    });

    expect(lastRunOptions?.agentId).toBe(`task:${node.id}`);
    expect(lastRunOptions?.context).toContain("Pending mailbox messages:");
    expect(lastRunOptions?.context).toContain("Need a status update");
    expect(lastRunOptions?.context).toContain("Tell me whether the task is blocked.");
  });

  it("marks a task as waiting for input when the sub-agent requests it", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-waiting-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    const subAgentManager = {
      async runSubAgent() {
        return {
          output: [
            "Need confirmation before editing production config.",
            "",
            "TASK_WAITING_FOR_INPUT: waiting for deploy approval",
          ].join("\n"),
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_waiting");
    const node = await manager.createTaskNode({ subject: "Need approval" });

    const record = await manager.runTaskNode({
      taskId: node.id,
      runInBackground: false,
    });

    expect(record.status).toBe("waiting");
    expect(record.waitingReason).toBe("waiting for deploy approval");
    expect(record.output).toContain("Need confirmation before editing production config.");
    expect(record.output).not.toContain("TASK_WAITING_FOR_INPUT");

    const updatedNode = await manager.getTaskNode(node.id);
    expect(updatedNode.status).toBe("in_progress");
    expect(updatedNode.lastRunStatus).toBe("waiting");
    expect(updatedNode.lastRunError).toBe("waiting for deploy approval");

    const waitingEvents = manager.listTaskEvents({ taskNodeId: node.id }).map((event) => event.type);
    expect(waitingEvents).toContain("task_waiting");
  });

  it("sends a human answer to the task mailbox and resumes execution", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-answer-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    let callCount = 0;
    const contexts: string[] = [];
    const subAgentManager = {
      async runSubAgent(options: { context?: string }) {
        callCount += 1;
        contexts.push(options.context || "");
        if (callCount === 1) {
          return {
            output: [
              "Blocked on schema choice.",
              "",
              "TASK_WAITING_FOR_INPUT: choose the final schema",
            ].join("\n"),
            durationMs: 1,
            messages: [],
          };
        }

        return {
          output: "Applied the chosen schema.",
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_answer");
    const node = await manager.createTaskNode({ subject: "Pick schema" });
    const initial = await manager.runTaskNode({
      taskId: node.id,
      runInBackground: false,
    });

    expect(initial.status).toBe("waiting");

    const resumed = await manager.answerTask(String(node.id), "Use the normalized schema.");
    expect(resumed.mailboxId).toBe(`task:${node.id}`);
    expect(resumed.resumed?.status).toBe("completed");
    expect(resumed.resumed?.output).toContain("Applied the chosen schema.");
    expect(contexts[1]).toContain("Use the normalized schema.");

    const mailboxStore = new MailboxStore(projectRoot);
    const taskInbox = await mailboxStore.list(`task:${node.id}`, { includeAcknowledged: true });
    expect(taskInbox.some((message) => message.type === "answer" && message.body.includes("Use the normalized schema."))).toBe(true);
    expect(taskInbox.find((message) => message.type === "answer")?.acknowledgedBy).toBe("system:task_manager");
  });

  it("handles approval requests through approval decisions and resumes execution", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-approval-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    let callCount = 0;
    const contexts: string[] = [];
    const mailboxStore = new MailboxStore(projectRoot);
    const subAgentManager = {
      async runSubAgent(options: { context?: string }) {
        callCount += 1;
        contexts.push(options.context || "");
        if (callCount === 1) {
          await mailboxStore.send({
            from: "task:1",
            to: "human",
            type: "approval_request",
            subject: "Approve production migration",
            body: "Need explicit approval before applying migration.",
            taskId: 1,
          });
          return {
            output: [
              "Prepared the migration plan.",
              "",
              "TASK_WAITING_FOR_INPUT: waiting for migration approval",
            ].join("\n"),
            durationMs: 1,
            messages: [],
          };
        }

        return {
          output: "Applied the migration after approval.",
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_approval");
    const node = await manager.createTaskNode({ subject: "Run migration" });

    const initial = await manager.runTaskNode({
      taskId: node.id,
      runInBackground: false,
    });

    expect(initial.status).toBe("waiting");
    expect(initial.waitingType).toBe("approval");

    await expect(manager.answerTask(String(node.id), "Looks fine")).rejects.toThrow("Use /task approve");

    const resumed = await manager.approveTask(String(node.id), false, "Do not proceed today.");
    expect(resumed.resumed?.status).toBe("completed");
    expect(resumed.resumed?.output).toContain("Applied the migration after approval.");
    expect(contexts[1]).toContain("Decision: reject");
    expect(contexts[1]).toContain("Do not proceed today.");

    const humanMail = await mailboxStore.list("human", { includeAcknowledged: true });
    const approvalRequest = humanMail.find((message) => message.type === "approval_request");
    expect(approvalRequest?.acknowledgedBy).toBe("human:session_approval");

    const taskInbox = await mailboxStore.list(`task:${node.id}`, { includeAcknowledged: true });
    expect(taskInbox.some((message) => message.type === "approval_decision" && message.body.includes("Decision: reject"))).toBe(true);
    expect(taskInbox.find((message) => message.type === "approval_decision")?.acknowledgedBy).toBe("system:task_manager");
  });

  it("returns a merged mailbox thread for multi-round collaboration", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-thread-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    let callCount = 0;
    const mailboxStore = new MailboxStore(projectRoot);
    const subAgentManager = {
      async runSubAgent() {
        callCount += 1;
        if (callCount === 1) {
          await mailboxStore.send({
            from: "task:1",
            to: "human",
            type: "question",
            subject: "Need schema",
            body: "Which schema should I use?",
            taskId: 1,
          });
          return {
            output: "TASK_WAITING_FOR_INPUT: waiting for schema choice",
            durationMs: 1,
            messages: [],
          };
        }

        return {
          output: "Implemented chosen schema.",
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_thread");
    const node = await manager.createTaskNode({ subject: "Threaded task" });
    await manager.runTaskNode({ taskId: node.id, runInBackground: false });
    await manager.answerTask(String(node.id), "Use schema B.");

    const thread = await manager.getTaskMailboxThread(String(node.id));
    expect(thread.map((message) => `${message.mailbox}:${message.type}`)).toEqual([
      "human:question",
      "task:answer",
      "human:handoff",
    ]);
    expect(thread[0].subject).toContain("Need schema");
    expect(thread[1].body).toContain("Use schema B.");
    expect(thread[2].subject).toContain("Task completed");
  });

  it("builds protocol rounds from mailbox exchanges and task events", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-protocol-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    let callCount = 0;
    const mailboxStore = new MailboxStore(projectRoot);
    const subAgentManager = {
      async runSubAgent() {
        callCount += 1;
        if (callCount === 1) {
          await mailboxStore.send({
            from: "task:1",
            to: "human",
            type: "question",
            subject: "Need schema",
            body: "Which schema should I use?",
            taskId: 1,
          });
          return {
            output: "TASK_WAITING_FOR_INPUT: waiting for schema choice",
            durationMs: 1,
            messages: [],
          };
        }

        if (callCount === 2) {
          await mailboxStore.send({
            from: "task:1",
            to: "human",
            type: "approval_request",
            subject: "Approve rollout",
            body: "Can I roll this change out?",
            taskId: 1,
          });
          return {
            output: "TASK_WAITING_FOR_INPUT: waiting for rollout approval",
            durationMs: 1,
            messages: [],
          };
        }

        return {
          output: "Rolled out successfully.",
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_protocol");
    const node = await manager.createTaskNode({ subject: "Protocol task" });

    await manager.runTaskNode({ taskId: node.id, runInBackground: false });
    await manager.answerTask(String(node.id), "Use schema C.");
    await manager.approveTask(String(node.id), true, "Roll it out.");

    const rounds = await manager.getTaskProtocolView(String(node.id));
    expect(rounds).toHaveLength(2);

    expect(rounds[0].waitingType).toBe("input");
    expect(rounds[0].request?.type).toBe("question");
    expect(rounds[0].response?.type).toBe("answer");
    expect(rounds[0].outcome).toContain("continued");
    expect(rounds[0].outcome).toContain("task_waiting:waiting");

    expect(rounds[1].waitingType).toBe("approval");
    expect(rounds[1].request?.type).toBe("approval_request");
    expect(rounds[1].response?.type).toBe("approval_decision");
    expect(rounds[1].outcome).toContain("continued");
    expect(rounds[1].outcome).toContain("task_completed:completed");
    expect(rounds[1].outcome).toContain("mail:handoff");
  });

  it("creates a real git worktree for task execution", async () => {
    const projectRoot = await createTempDir("kigo-task-manager-worktree-");
    process.env.KIGO_PROJECT_ROOT = projectRoot;
    await initGitRepo(projectRoot);

    let lastProjectRoot: string | undefined;
    const subAgentManager = {
      async runSubAgent(options: { task: string; projectRoot?: string }) {
        lastProjectRoot = options.projectRoot;
        return {
          output: `worktree:${options.projectRoot || "none"}:${options.task}`,
          durationMs: 1,
          messages: [],
        };
      },
      getStats() {
        return { inflight: 0, queued: 0, maxConcurrent: 1 };
      },
    };

    const manager = new TaskManager(subAgentManager as any, "session_worktree");
    const node = await manager.createTaskNode({ subject: "Isolated task" });

    const record = await manager.runTaskNode({
      taskId: node.id,
      runInBackground: false,
    });

    const updatedNode = await manager.getTaskNode(node.id);
    expect(record.status).toBe("completed");
    expect(updatedNode.worktree).not.toBe("");
    expect(lastProjectRoot).toBe(updatedNode.worktree);
    expect(updatedNode.worktree.startsWith(path.join(os.tmpdir(), "kigo-worktrees"))).toBe(true);

    const gitDirStat = await fs.stat(path.join(updatedNode.worktree, ".git"));
    expect(gitDirStat.isFile() || gitDirStat.isDirectory()).toBe(true);

    const cleanup = await manager.cleanupTaskWorktree(node.id);
    expect(cleanup.removed).toBe(true);
    expect(cleanup.task.worktree).toBe("");
  });
});
