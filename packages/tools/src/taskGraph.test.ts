import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TaskGraphStore } from './agent/taskGraph.js';
import { registry } from './registry.js';
import './index.js';

const tempDirs: string[] = [];
const originalProjectRoot = process.env.KIGO_PROJECT_ROOT;
const originalSessionId = process.env.KIGO_SESSION_ID;
const originalHome = process.env.HOME;

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

  if (originalSessionId === undefined) {
    delete process.env.KIGO_SESSION_ID;
  } else {
    process.env.KIGO_SESSION_ID = originalSessionId;
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

describe('task graph tools', () => {
  it('creates tasks with dependencies and unlocks dependents when completed', async () => {
    const projectRoot = await createTempDir('kigo-task-graph-');
    process.env.KIGO_PROJECT_ROOT = projectRoot;
    process.env.KIGO_SESSION_ID = 'task_graph_session';

    const taskCreate = registry.get('task_create');
    const taskUpdate = registry.get('task_update');
    const taskReady = registry.get('task_ready');

    expect(taskCreate).toBeDefined();
    expect(taskUpdate).toBeDefined();
    expect(taskReady).toBeDefined();

    const first = JSON.parse(
      await taskCreate!.execute({ subject: 'Setup project', description: '' })
    );
    const second = JSON.parse(
      await taskCreate!.execute({
        subject: 'Write code',
        description: '',
        blockedBy: [first.task.id],
      })
    );

    let ready = JSON.parse(await taskReady!.execute({}));
    expect(ready.tasks.map((task: { id: number }) => task.id)).toEqual([first.task.id]);

    await taskUpdate!.execute({
      taskId: first.task.id,
      status: 'completed',
    });

    ready = JSON.parse(await taskReady!.execute({}));
    expect(ready.tasks.map((task: { id: number }) => task.id)).toEqual([second.task.id]);
  });

  it('migrates legacy todos into the project task graph on first access', async () => {
    const projectRoot = await createTempDir('kigo-task-migrate-');
    const fakeHome = await createTempDir('kigo-home-');
    process.env.KIGO_PROJECT_ROOT = projectRoot;
    process.env.KIGO_SESSION_ID = 'legacy_session';
    process.env.HOME = fakeHome;

    const todoDir = path.join(fakeHome, '.kigo', 'todos');
    await fs.mkdir(todoDir, { recursive: true });
    await fs.writeFile(
      path.join(todoDir, 'legacy_session.json'),
      JSON.stringify([
        {
          id: 'todo_1',
          content: 'Parent task',
          status: 'pending',
          priority: 'normal',
          children: [
            {
              id: 'todo_2',
              content: 'Child task',
              status: 'pending',
              priority: 'normal',
            },
          ],
        },
      ]),
      'utf-8'
    );

    const taskList = registry.get('task_list');
    expect(taskList).toBeDefined();

    const payload = JSON.parse(await taskList!.execute({}));
    expect(payload.count).toBe(2);
    expect(payload.tasks[0].subject).toBe('Parent task');
    expect(payload.tasks[0].blocks).toEqual([2]);
    expect(payload.tasks[1].blockedBy).toEqual([1]);
  });

  it('lists failed tasks after status updates', async () => {
    const projectRoot = await createTempDir('kigo-task-failed-');
    process.env.KIGO_PROJECT_ROOT = projectRoot;
    process.env.KIGO_SESSION_ID = 'failed_session';

    const taskCreate = registry.get('task_create');
    const taskUpdate = registry.get('task_update');
    const taskList = registry.get('task_list');

    expect(taskCreate).toBeDefined();
    expect(taskUpdate).toBeDefined();
    expect(taskList).toBeDefined();

    const created = JSON.parse(
      await taskCreate!.execute({ subject: 'Broken task', description: '' })
    );

    await taskUpdate!.execute({
      taskId: created.task.id,
      status: 'failed',
    });

    const failed = JSON.parse(await taskList!.execute({ status: 'failed' }));
    expect(failed.count).toBe(1);
    expect(failed.tasks[0].id).toBe(created.task.id);
    expect(failed.tasks[0].status).toBe('failed');
  });

  it('keeps bounded execution history on the task node itself', async () => {
    const projectRoot = await createTempDir('kigo-task-history-');
    process.env.KIGO_PROJECT_ROOT = projectRoot;
    process.env.KIGO_SESSION_ID = 'history_session';

    const store = new TaskGraphStore();
    const task = await store.create({ subject: 'Track execution history' });

    await store.recordExecution({
      taskId: task.id,
      runId: 'run_1',
      status: 'running',
      startedAt: 100,
    });

    await store.recordExecution({
      taskId: task.id,
      runId: 'run_1',
      status: 'completed',
      startedAt: 100,
      completedAt: 200,
      output: 'done',
    });

    const updated = await store.get(task.id);
    expect(updated.executionHistory).toHaveLength(1);
    expect(updated.executionHistory[0].runId).toBe('run_1');
    expect(updated.executionHistory[0].status).toBe('completed');
    expect(updated.executionHistory[0].startedAt).toBe(100);
    expect(updated.executionHistory[0].completedAt).toBe(200);
    expect(updated.executionHistory[0].output).toBe('done');
  });
});
