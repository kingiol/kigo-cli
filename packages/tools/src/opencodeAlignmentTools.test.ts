import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registry } from './registry.js';
import './index.js';

const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('OpenCode-aligned tools', () => {
  it('apply_patch supports add/update/move operations', async () => {
    const dir = await createTempDir('kigo-apply-patch-');
    const fromPath = path.join(dir, 'from.txt');
    const toPath = path.join(dir, 'to.txt');
    const addPath = path.join(dir, 'created.txt');
    await fs.writeFile(fromPath, 'before\n', 'utf-8');

    const patch = `*** Begin Patch
*** Add File: ${addPath}
+new file
*** Update File: ${fromPath}
*** Move to: ${toPath}
@@
-before
+after
*** End Patch`;

    const applyPatchTool = registry.get('apply_patch');
    expect(applyPatchTool).toBeDefined();
    const output = await applyPatchTool!.execute({ patchText: patch });

    expect(output).toContain('Success. Updated files');
    expect(await fs.readFile(addPath, 'utf-8')).toBe('new file');
    expect(await fs.readFile(toPath, 'utf-8')).toBe('after\n');
    await expect(fs.readFile(fromPath, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('multiedit is atomic and leaves file unchanged on failure', async () => {
    const dir = await createTempDir('kigo-multiedit-');
    const filePath = path.join(dir, 'example.ts');
    await fs.writeFile(filePath, 'const value = 1;\nconst value2 = 1;\n', 'utf-8');

    const multiedit = registry.get('multiedit');
    expect(multiedit).toBeDefined();

    await expect(
      multiedit!.execute({
        filePath,
        edits: [
          { oldString: 'const value = 1;', newString: 'const count = 1;', replaceAll: false },
          { oldString: 'not-exists', newString: 'noop', replaceAll: false },
        ],
      }),
    ).rejects.toThrow('not found');

    const unchanged = await fs.readFile(filePath, 'utf-8');
    expect(unchanged).toBe('const value = 1;\nconst value2 = 1;\n');

    const ok = await multiedit!.execute({
      filePath,
      edits: [{ oldString: 'value', newString: 'count', replaceAll: true }],
    });
    expect(ok).toContain('Applied 1 edit');
    const changed = await fs.readFile(filePath, 'utf-8');
    expect(changed).toContain('count = 1;');
    expect(changed).toContain('count2 = 1;');
  });

  it('codesearch parses SSE payload', async () => {
    const snippet = 'useEffect(() => { return () => cleanup(); }, [])';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          `data: ${JSON.stringify({
            jsonrpc: '2.0',
            result: {
              content: [{ type: 'text', text: snippet }],
            },
          })}\n\n`,
          {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          },
        );
      }),
    );

    const codesearch = registry.get('codesearch');
    expect(codesearch).toBeDefined();
    const output = await codesearch!.execute({ query: 'react useEffect cleanup', endpoint: 'https://example.com/mcp' });
    expect(output).toContain(snippet);
  });

  it('batch executes multiple tool calls and reports failures', async () => {
    const okToolName = `batch_test_ok_${Date.now()}`;
    const failToolName = `batch_test_fail_${Date.now()}`;

    registry.registerExternal(
      {
        name: okToolName,
        description: 'batch test success',
        parameters: {},
        execute: async () => 'ok-result',
      },
      'plugin',
      'test',
    );

    registry.registerExternal(
      {
        name: failToolName,
        description: 'batch test fail',
        parameters: {},
        execute: async () => {
          throw new Error('boom');
        },
      },
      'plugin',
      'test',
    );

    try {
      const batch = registry.get('batch');
      expect(batch).toBeDefined();
      const output = await batch!.execute({
        tool_calls: [
          { tool: okToolName, parameters: {} },
          { tool: failToolName, parameters: {} },
        ],
      });

      expect(output).toContain('Batch execution: 1/2 successful');
      expect(output).toContain('[ok]');
      expect(output).toContain('[error]');
      expect(output).toContain('boom');
    } finally {
      registry.unregister(okToolName);
      registry.unregister(failToolName);
    }
  });
});
