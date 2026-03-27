import { afterEach, describe, expect, it } from 'vitest';
import { registry } from './registry.js';
import './index.js';
import { CompactionRuntime } from './agent/compact.js';

describe('compact tool runtime', () => {
  afterEach(() => {
    delete process.env.KIGO_SESSION_ID;
  });

  it('executes the compact tool against the active session controller', async () => {
    process.env.KIGO_SESSION_ID = 'compact_session';
    const runtime = new CompactionRuntime();
    runtime.register('compact_session', {
      compact: async ({ reason }) => ({
        mode: 'manual',
        transcriptPath: '/tmp/transcript.jsonl',
        summary: `reason=${reason}`,
        messagesBefore: 10,
        messagesAfter: 3,
        estimatedTokensBefore: 1000,
        estimatedTokensAfter: 150,
      }),
    });

    const compactTool = registry.get('compact');
    expect(compactTool).toBeDefined();
    const payload = JSON.parse(await compactTool!.execute({ reason: 'manual_test' }));

    expect(payload.type).toBe('compact_result');
    expect(payload.artifact.summary).toBe('reason=manual_test');

    runtime.clear();
  });
});
