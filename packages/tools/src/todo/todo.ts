/**
 * Todo list tools
 */

import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { tool } from '../registry.js';

interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: string;
  sessionId?: string;
  toolCallId?: string;
  createdAt?: number;
  updatedAt?: number;
}

const LEGACY_TODO_FILE = path.join(os.homedir(), '.kigo', 'todos.json');
const TODO_DIR = path.join(os.homedir(), '.kigo', 'todos');

function getSessionContext(): { sessionId: string; toolCallId?: string } {
  const sessionId = process.env.KIGO_SESSION_ID || 'session_default';
  const toolCallId = process.env.KIGO_TOOL_CALL_ID || undefined;
  return { sessionId, toolCallId };
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getTodoFile(sessionId: string): string {
  const safeSessionId = sanitizeId(sessionId);
  return path.join(TODO_DIR, `${safeSessionId}.json`);
}

async function ensureTodoDir(): Promise<void> {
  await fs.mkdir(TODO_DIR, { recursive: true });
}

async function loadTodos(): Promise<TodoItem[]> {
  const { sessionId } = getSessionContext();
  const todoFile = getTodoFile(sessionId);
  try {
    const content = await fs.readFile(todoFile, 'utf-8');
    return JSON.parse(content);
  } catch {
    try {
      const legacyContent = await fs.readFile(LEGACY_TODO_FILE, 'utf-8');
      const legacyTodos = JSON.parse(legacyContent);
      const migrated = (Array.isArray(legacyTodos) ? legacyTodos : []).map((todo: TodoItem) => ({
        ...todo,
        sessionId: todo.sessionId || sessionId,
      }));
      await ensureTodoDir();
      await fs.writeFile(todoFile, JSON.stringify(migrated, null, 2), 'utf-8');
      return migrated;
    } catch {
      return [];
    }
  }
}

async function saveTodos(todos: TodoItem[]): Promise<void> {
  await ensureTodoDir();
  const { sessionId, toolCallId } = getSessionContext();
  const now = Date.now();
  const normalized = todos.map(todo => ({
    ...todo,
    sessionId: todo.sessionId || sessionId,
    toolCallId: todo.toolCallId || toolCallId,
    createdAt: todo.createdAt || now,
    updatedAt: now,
  }));
  await fs.writeFile(getTodoFile(sessionId), JSON.stringify(normalized, null, 2), 'utf-8');
}

const STATUS_EMOJI: Record<string, string> = {
  pending: '⬜',
  in_progress: '🔄',
  completed: '✅',
};

tool({
  name: 'todo_read',
  description: 'Read the current todo list.',
  schema: z.object({}),
  execute: async () => {
    const todos = await loadTodos();

    if (todos.length === 0) {
      return 'No todos';
    }

    const lines: string[] = [];
    const pending: TodoItem[] = [];
    const inProgress: TodoItem[] = [];
    const completed: TodoItem[] = [];

    for (const todo of todos) {
      if (todo.status === 'pending') pending.push(todo);
      else if (todo.status === 'in_progress') inProgress.push(todo);
      else completed.push(todo);
    }

    if (inProgress.length > 0) {
      lines.push('\nIn Progress:');
      for (const todo of inProgress) {
        lines.push(`  ${STATUS_EMOJI[todo.status]} ${todo.content}`);
      }
    }

    if (pending.length > 0) {
      lines.push('\nPending:');
      for (const todo of pending) {
        lines.push(`  ${STATUS_EMOJI[todo.status]} ${todo.content}`);
      }
    }

    if (completed.length > 0) {
      lines.push('\nCompleted:');
      for (const todo of completed) {
        lines.push(`  ${STATUS_EMOJI[todo.status]} ${todo.content}`);
      }
    }

    return lines.join('\n');
  },
});

const todoWriteSchema = z.object({
  todos: z
    .array(
      z.object({
        content: z.string(),
        status: z.enum(['pending', 'in_progress', 'completed']),
        priority: z.string(),
        id: z.string(),
        sessionId: z.string().optional(),
        toolCallId: z.string().optional(),
        createdAt: z.number().optional(),
        updatedAt: z.number().optional(),
      })
    )
    .describe('Array of todo items'),
});

tool({
  name: 'todo_write',
  description: 'Write the todo list. Replaces all existing todos.',
  schema: todoWriteSchema,
  execute: async ({ todos }) => {
    await saveTodos(todos);
    return `Saved ${todos.length} todos`;
  },
});

// Helper schema for creating a single todo
export const createTodoSchema = z.object({
  content: z.string().describe('Todo item content'),
  status: z.enum(['pending', 'in_progress', 'completed']).default('pending'),
  priority: z.string().default('normal'),
});

export async function createTodo(content: string): Promise<string> {
  const todos = await loadTodos();
  const { sessionId, toolCallId } = getSessionContext();
  const now = Date.now();
  const newTodo: TodoItem = {
    id: `todo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    content,
    status: 'pending',
    priority: 'normal',
    sessionId,
    toolCallId,
    createdAt: now,
    updatedAt: now,
  };
  todos.push(newTodo);
  await saveTodos(todos);
  return `Created todo: ${content}`;
}

export async function completeTodo(id: string): Promise<boolean> {
  const todos = await loadTodos();
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.status = 'completed';
    todo.updatedAt = Date.now();
    await saveTodos(todos);
    return true;
  }
  return false;
}
