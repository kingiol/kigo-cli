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
}

const TODO_FILE = path.join(os.homedir(), '.koder', 'todos.json');

async function ensureTodoDir(): Promise<void> {
  await fs.mkdir(path.dirname(TODO_FILE), { recursive: true });
}

async function loadTodos(): Promise<TodoItem[]> {
  try {
    const content = await fs.readFile(TODO_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function saveTodos(todos: TodoItem[]): Promise<void> {
  await ensureTodoDir();
  await fs.writeFile(TODO_FILE, JSON.stringify(todos, null, 2), 'utf-8');
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
  const newTodo: TodoItem = {
    id: `todo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    content,
    status: 'pending',
    priority: 'normal',
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
    await saveTodos(todos);
    return true;
  }
  return false;
}