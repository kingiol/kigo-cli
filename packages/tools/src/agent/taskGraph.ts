import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { tool } from '../registry.js';

export type TaskNodeStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface TaskExecutionSummary {
  runId: string;
  status: 'running' | 'waiting' | 'completed' | 'failed';
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

export interface TaskNode {
  id: number;
  subject: string;
  description: string;
  status: TaskNodeStatus;
  blockedBy: number[];
  blocks: number[];
  owner: string;
  worktree: string;
  source: 'task_graph' | 'legacy_todo';
  lastRunId?: string;
  lastRunStatus?: 'running' | 'waiting' | 'completed' | 'failed';
  lastRunOutput?: string;
  lastRunError?: string;
  lastRunAt?: number;
  executionHistory: TaskExecutionSummary[];
  createdAt: number;
  updatedAt: number;
}

type LegacyTodo = {
  content: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  children?: LegacyTodo[];
};

const TASK_GRAPH_DIR = path.join('.kigo', 'state', 'tasks');
const MAX_EXECUTION_HISTORY = 10;

function getProjectRoot(): string {
  return process.env.KIGO_PROJECT_ROOT || process.cwd();
}

function getTaskGraphDir(): string {
  return path.join(getProjectRoot(), TASK_GRAPH_DIR);
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getLegacyTodoPath(sessionId: string): string {
  return path.join(os.homedir(), '.kigo', 'todos', `${sanitizeId(sessionId)}.json`);
}

function getTaskPath(dir: string, taskId: number): string {
  return path.join(dir, `task_${taskId}.json`);
}

async function ensureTaskGraphDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function listTaskFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((entry) => /^task_\d+\.json$/.test(entry));
  } catch {
    return [];
  }
}

async function loadTask(dir: string, taskId: number): Promise<TaskNode> {
  const content = await fs.readFile(getTaskPath(dir, taskId), 'utf-8');
  return normalizeTask(JSON.parse(content) as TaskNode);
}

async function saveTask(dir: string, task: TaskNode): Promise<void> {
  await fs.writeFile(
    getTaskPath(dir, task.id),
    JSON.stringify(normalizeTask(task), null, 2),
    'utf-8'
  );
}

async function loadAllTasks(dir: string): Promise<TaskNode[]> {
  const files = await listTaskFiles(dir);
  const tasks = await Promise.all(
    files.map(async (file) => {
      const content = await fs.readFile(path.join(dir, file), 'utf-8');
      return normalizeTask(JSON.parse(content) as TaskNode);
    })
  );
  return tasks.sort((a, b) => a.id - b.id);
}

async function getNextTaskId(dir: string): Promise<number> {
  const files = await listTaskFiles(dir);
  const maxId = files.reduce((current, file) => {
    const match = /^task_(\d+)\.json$/.exec(file);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return maxId + 1;
}

async function maybeMigrateLegacyTodos(dir: string): Promise<void> {
  const existingFiles = await listTaskFiles(dir);
  if (existingFiles.length > 0) {
    return;
  }

  const sessionId = process.env.KIGO_SESSION_ID;
  if (!sessionId) {
    return;
  }

  try {
    const content = await fs.readFile(getLegacyTodoPath(sessionId), 'utf-8');
    const parsed = JSON.parse(content) as LegacyTodo[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return;
    }

    let nextId = 1;
    const migrated: TaskNode[] = [];

    const visit = (todo: LegacyTodo, parent: TaskNode | null): TaskNode => {
      const now = Date.now();
      const task: TaskNode = {
        id: nextId++,
        subject: todo.content,
        description: '',
        status: todo.status || 'pending',
        blockedBy:
          parent && parent.status !== 'completed'
            ? [parent.id]
            : [],
        blocks: [],
        owner: '',
        worktree: '',
        source: 'legacy_todo',
        executionHistory: [],
        createdAt: now,
        updatedAt: now,
      };
      migrated.push(task);
      if (parent) {
        parent.blocks.push(task.id);
        parent.updatedAt = now;
      }
      for (const child of todo.children || []) {
        visit(child, task);
      }
      return task;
    };

    for (const todo of parsed) {
      visit(todo, null);
    }

    await ensureTaskGraphDir(dir);
    await Promise.all(migrated.map((task) => saveTask(dir, task)));
  } catch {
    // Ignore missing or invalid legacy todo files.
  }
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

function summarizeRunText(value: string | undefined, maxChars: number = 2000): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n\n[truncated at ${maxChars} chars]`;
}

function normalizeExecutionHistory(
  history: TaskExecutionSummary[] | undefined
): TaskExecutionSummary[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((entry) => entry && entry.runId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_EXECUTION_HISTORY)
    .map((entry) => ({
      ...entry,
      output: summarizeRunText(entry.output),
      error: summarizeRunText(entry.error, 500),
    }));
}

function normalizeTask(task: TaskNode): TaskNode {
  return {
    ...task,
    blockedBy: Array.isArray(task.blockedBy) ? task.blockedBy : [],
    blocks: Array.isArray(task.blocks) ? task.blocks : [],
    owner: task.owner || '',
    worktree: task.worktree || '',
    executionHistory: normalizeExecutionHistory(task.executionHistory),
  };
}

function upsertExecutionHistory(
  history: TaskExecutionSummary[],
  input: {
    runId: string;
    status: 'running' | 'waiting' | 'completed' | 'failed';
    startedAt?: number;
    completedAt?: number;
    output?: string;
    error?: string;
  }
): TaskExecutionSummary[] {
  const updatedAt = input.completedAt ?? input.startedAt ?? Date.now();
  const nextEntry: TaskExecutionSummary = {
    runId: input.runId,
    status: input.status,
    updatedAt,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    output: summarizeRunText(input.output),
    error: summarizeRunText(input.error, 500),
  };

  const existing = history.find((entry) => entry.runId === input.runId);
  const merged = existing
    ? history.map((entry) =>
        entry.runId === input.runId
          ? {
              ...entry,
              ...nextEntry,
              startedAt: input.startedAt ?? entry.startedAt,
              completedAt: input.completedAt ?? entry.completedAt,
              output: nextEntry.output ?? entry.output,
              error: nextEntry.error ?? entry.error,
            }
          : entry
      )
    : [nextEntry, ...history];

  return normalizeExecutionHistory(merged);
}

class TaskGraphStore {
  constructor(private readonly dir: string = getTaskGraphDir()) {}

  async ready(): Promise<void> {
    await ensureTaskGraphDir(this.dir);
    await maybeMigrateLegacyTodos(this.dir);
  }

  async list(filters?: {
    status?: TaskNodeStatus;
    owner?: string;
    readyOnly?: boolean;
  }): Promise<TaskNode[]> {
    await this.ready();
    const tasks = await loadAllTasks(this.dir);
    return tasks.filter((task) => {
      if (filters?.status && task.status !== filters.status) {
        return false;
      }
      if (filters?.owner && task.owner !== filters.owner) {
        return false;
      }
      if (filters?.readyOnly && (task.status !== 'pending' || task.blockedBy.length > 0)) {
        return false;
      }
      return true;
    });
  }

  async get(taskId: number): Promise<TaskNode> {
    await this.ready();
    return loadTask(this.dir, taskId);
  }

  async create(input: {
    subject: string;
    description?: string;
    blockedBy?: number[];
    owner?: string;
  }): Promise<TaskNode> {
    await this.ready();
    const taskId = await getNextTaskId(this.dir);
    const now = Date.now();
    const task: TaskNode = {
      id: taskId,
      subject: input.subject,
      description: input.description || '',
      status: 'pending',
      blockedBy: [],
      blocks: [],
      owner: input.owner || '',
      worktree: '',
      source: 'task_graph',
      executionHistory: [],
      createdAt: now,
      updatedAt: now,
    };

    await saveTask(this.dir, task);

    for (const dependencyId of uniqueNumbers(input.blockedBy || [])) {
      await this.addDependency(dependencyId, taskId);
    }

    return this.get(taskId);
  }

  async update(input: {
    taskId: number;
    subject?: string;
    description?: string;
    status?: TaskNodeStatus;
    addBlockedBy?: number[];
    removeBlockedBy?: number[];
    owner?: string;
    clearOwner?: boolean;
    worktree?: string;
    clearWorktree?: boolean;
  }): Promise<TaskNode> {
    await this.ready();
    const task = await this.get(input.taskId);
    const now = Date.now();

    if (input.subject !== undefined) {
      task.subject = input.subject;
    }
    if (input.description !== undefined) {
      task.description = input.description;
    }
    if (input.owner !== undefined) {
      task.owner = input.owner;
    }
    if (input.clearOwner) {
      task.owner = '';
    }
    if (input.worktree !== undefined) {
      task.worktree = input.worktree;
    }
    if (input.clearWorktree) {
      task.worktree = '';
    }

    await saveTask(this.dir, { ...task, updatedAt: now });

    for (const dependencyId of uniqueNumbers(input.addBlockedBy || [])) {
      await this.addDependency(dependencyId, input.taskId);
    }

    for (const dependencyId of uniqueNumbers(input.removeBlockedBy || [])) {
      await this.removeDependency(dependencyId, input.taskId);
    }

    if (input.status) {
      const refreshed = await this.get(input.taskId);
      refreshed.status = input.status;
      refreshed.updatedAt = Date.now();
      await saveTask(this.dir, refreshed);

      if (input.status === 'completed') {
        await this.clearDependencyFromDependents(input.taskId);
      }
    }

    return this.get(input.taskId);
  }

  async claim(taskId: number, owner: string): Promise<TaskNode> {
    return this.update({ taskId, owner });
  }

  async recordExecution(input: {
    taskId: number;
    runId: string;
    status: 'running' | 'completed' | 'failed';
    startedAt?: number;
    completedAt?: number;
    output?: string;
    error?: string;
  }): Promise<TaskNode> {
    await this.ready();
    const task = await this.get(input.taskId);
    task.lastRunId = input.runId;
    task.lastRunStatus = input.status;
    task.lastRunOutput = summarizeRunText(input.output);
    task.lastRunError = input.error;
    task.lastRunAt = input.completedAt ?? input.startedAt ?? Date.now();
    task.executionHistory = upsertExecutionHistory(task.executionHistory, input);
    task.updatedAt = task.lastRunAt;
    await saveTask(this.dir, task);
    return task;
  }

  private async addDependency(fromTaskId: number, toTaskId: number): Promise<void> {
    if (fromTaskId === toTaskId) {
      throw new Error('A task cannot depend on itself.');
    }

    const fromTask = await this.get(fromTaskId);
    const toTask = await this.get(toTaskId);
    fromTask.blocks = uniqueNumbers([...fromTask.blocks, toTaskId]);
    toTask.blockedBy = uniqueNumbers([...toTask.blockedBy, fromTaskId]);
    fromTask.updatedAt = Date.now();
    toTask.updatedAt = Date.now();

    await Promise.all([
      saveTask(this.dir, fromTask),
      saveTask(this.dir, toTask),
    ]);
  }

  private async removeDependency(fromTaskId: number, toTaskId: number): Promise<void> {
    const fromTask = await this.get(fromTaskId);
    const toTask = await this.get(toTaskId);
    fromTask.blocks = fromTask.blocks.filter((taskId) => taskId !== toTaskId);
    toTask.blockedBy = toTask.blockedBy.filter((taskId) => taskId !== fromTaskId);
    fromTask.updatedAt = Date.now();
    toTask.updatedAt = Date.now();

    await Promise.all([
      saveTask(this.dir, fromTask),
      saveTask(this.dir, toTask),
    ]);
  }

  private async clearDependencyFromDependents(taskId: number): Promise<void> {
    const tasks = await this.list();
    const updates = tasks
      .filter((task) => task.blockedBy.includes(taskId))
      .map(async (task) => {
        task.blockedBy = task.blockedBy.filter((dependencyId) => dependencyId !== taskId);
        task.updatedAt = Date.now();
        await saveTask(this.dir, task);
      });

    await Promise.all(updates);
  }
}

const taskCreateSchema = z.object({
  subject: z.string().min(1),
  description: z.string().default(''),
  blockedBy: z.array(z.number().int().positive()).default([]),
  owner: z.string().optional(),
});

const taskUpdateSchema = z.object({
  taskId: z.number().int().positive(),
  subject: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional(),
  addBlockedBy: z.array(z.number().int().positive()).optional(),
  removeBlockedBy: z.array(z.number().int().positive()).optional(),
  owner: z.string().optional(),
  clearOwner: z.boolean().default(false),
  worktree: z.string().optional(),
  clearWorktree: z.boolean().default(false),
});

const taskGetSchema = z.object({
  taskId: z.number().int().positive(),
});

const taskListSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional(),
  owner: z.string().optional(),
  readyOnly: z.boolean().default(false),
});

const taskClaimSchema = z.object({
  taskId: z.number().int().positive(),
  owner: z.string().min(1),
});

function createStore(): TaskGraphStore {
  return new TaskGraphStore();
}

tool({
  name: 'task_create',
  description: 'Create a project-level task graph node.',
  schema: taskCreateSchema,
  execute: async ({ subject, description, blockedBy, owner }) => {
    const store = createStore();
    const task = await store.create({ subject, description, blockedBy, owner });
    return JSON.stringify({ type: 'task_created', task }, null, 2);
  },
});

tool({
  name: 'task_update',
  description: 'Update a project-level task graph node, including dependencies and status.',
  schema: taskUpdateSchema,
  execute: async (params) => {
    const store = createStore();
    const task = await store.update(params);
    return JSON.stringify({ type: 'task_updated', task }, null, 2);
  },
});

tool({
  name: 'task_get',
  description: 'Get one project-level task graph node by id.',
  schema: taskGetSchema,
  execute: async ({ taskId }) => {
    const store = createStore();
    const task = await store.get(taskId);
    return JSON.stringify({ type: 'task', task }, null, 2);
  },
});

tool({
  name: 'task_list',
  description: 'List project-level task graph nodes.',
  schema: taskListSchema,
  execute: async ({ status, owner, readyOnly }) => {
    const store = createStore();
    const tasks = await store.list({ status, owner, readyOnly });
    return JSON.stringify(
      {
        type: readyOnly ? 'task_ready_list' : 'task_list',
        count: tasks.length,
        tasks,
      },
      null,
      2
    );
  },
});

tool({
  name: 'task_ready',
  description: 'List ready-to-run task graph nodes that have no unresolved dependencies.',
  schema: z.object({
    owner: z.string().optional(),
  }),
  execute: async ({ owner }) => {
    const store = createStore();
    const tasks = await store.list({ owner, readyOnly: true });
    return JSON.stringify({ type: 'task_ready_list', count: tasks.length, tasks }, null, 2);
  },
});

tool({
  name: 'task_claim',
  description: 'Claim a ready task for an owner.',
  schema: taskClaimSchema,
  execute: async ({ taskId, owner }) => {
    const store = createStore();
    const task = await store.claim(taskId, owner);
    return JSON.stringify({ type: 'task_claimed', task }, null, 2);
  },
});

export { TaskGraphStore };
