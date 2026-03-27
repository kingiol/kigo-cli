import { describe, expect, it, vi, afterEach } from "vitest";
import { TaskCommand } from "./TaskCommand.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TaskCommand", () => {
  it("shows scheduler state and dispatch preview", async () => {
    const command = new TaskCommand();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => {
      logs.push(String(value ?? ""));
    });

    const context = {
      taskManager: {
        async getDispatchStats() {
          return {
            resumable: 1,
            executable: 2,
            total: 3,
          };
        },
        async listDispatchTargets() {
          return [
            {
              task: {
                id: 12,
                subject: "Resume schema task",
                owner: "subagent:test",
                status: "in_progress",
              },
              mode: "resume",
              pendingInboxCount: 1,
              waitingType: "input",
            },
          ];
        },
        getStats() {
          return { running: 0, total: 3, queue: 0 };
        },
      },
      getTaskSchedulerState: () => ({
        enabled: true,
        pollMs: 3000,
        interactiveRunCount: 0,
        autoResumeInFlight: false,
        lastTickAt: new Date("2026-03-27T10:00:00+08:00").getTime(),
        lastResumeAt: new Date("2026-03-27T10:00:03+08:00").getTime(),
        lastResumedTaskId: 12,
        lastResumeRunId: "task_run_12",
        lastResumedCount: 1,
        lastSkipReason: "no_resumable_tasks" as const,
        lastError: undefined,
      }),
      isPlanModeEnabled: () => false,
      session: {
        getId: () => "session_test",
      },
    } as any;

    await command.execute(["scheduler"], context);

    expect(logs.some((line) => line.includes("Task Scheduler:"))).toBe(true);
    expect(logs.some((line) => line.includes("resumableTargets: 1"))).toBe(true);
    expect(logs.some((line) => line.includes("executableTargets: 2"))).toBe(true);
    expect(logs.some((line) => line.includes("lastResumedTaskId: 12"))).toBe(true);
    expect(logs.some((line) => line.includes("dispatchPreview:"))).toBe(true);
    expect(logs.some((line) => line.includes("#12 [resume]"))).toBe(true);
  });
});
