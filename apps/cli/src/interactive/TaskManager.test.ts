import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { TaskManager } from "./TaskManager.js";

const originalProjectRoot = process.env.KIGO_PROJECT_ROOT;
const originalHome = process.env.HOME;
const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
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

    const subAgentManager = {
      async runSubAgent(options: { task: string }) {
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
});
