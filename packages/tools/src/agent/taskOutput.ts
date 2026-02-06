import { z } from "zod";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { tool } from "../registry.js";

type StoredTask = {
  id: string;
  profile: string;
  task: string;
  status: "running" | "completed" | "failed";
  createdAt: number;
  completedAt?: number;
  output?: string;
  error?: string;
};

const taskOutputSchema = z.object({
  taskId: z.string().optional().describe("Task id to fetch. Omit to list tasks."),
  sessionId: z.string().optional().describe("Session id. Defaults to current session."),
  limit: z.number().int().min(1).max(100).default(20),
});

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getTaskFile(sessionId: string): string {
  return path.join(os.homedir(), ".kigo", "tasks", `${sanitizeId(sessionId)}.json`);
}

async function loadTasks(sessionId: string): Promise<StoredTask[]> {
  try {
    const content = await fs.readFile(getTaskFile(sessionId), "utf-8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as StoredTask[]) : [];
  } catch {
    return [];
  }
}

tool({
  name: "task_output",
  description:
    "Retrieve outputs for persisted sub-agent tasks. Provide taskId for one task, omit it to list recent tasks.",
  schema: taskOutputSchema,
  execute: async ({ taskId, sessionId, limit }) => {
    const effectiveSessionId = sessionId || process.env.KIGO_SESSION_ID || "session_default";
    const tasks = await loadTasks(effectiveSessionId);

    if (!taskId) {
      const recent = [...tasks]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map((task) => ({
          id: task.id,
          profile: task.profile,
          status: task.status,
          createdAt: task.createdAt,
          completedAt: task.completedAt,
        }));

      return JSON.stringify(
        {
          type: "task_list",
          sessionId: effectiveSessionId,
          count: recent.length,
          tasks: recent,
        },
        null,
        2,
      );
    }

    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return JSON.stringify(
        {
          type: "task_not_found",
          sessionId: effectiveSessionId,
          taskId,
        },
        null,
        2,
      );
    }

    return JSON.stringify(
      {
        type: "task_output",
        sessionId: effectiveSessionId,
        task,
      },
      null,
      2,
    );
  },
});
