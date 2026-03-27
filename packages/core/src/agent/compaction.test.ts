import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Message } from '../types.js';
import { Agent } from './Agent.js';
import { BaseProvider, type ChatOptions, type ChatResponse, type StreamChunk } from '../models/BaseProvider.js';
import { microCompactMessages } from './compaction.js';

class MockProvider extends BaseProvider {
  async *chat(_options: ChatOptions): AsyncIterable<StreamChunk> {
    yield { delta: { content: 'done' } };
    yield {
      finish_reason: 'stop',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
    };
  }

  async chatNonStream(_options: ChatOptions): Promise<ChatResponse> {
    return {
      content: '- Summary preserved for continuity.',
      finishReason: 'stop',
    };
  }
}

const tempDirs: string[] = [];
const originalProjectRoot = process.env.KIGO_PROJECT_ROOT;

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

  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('conversation compaction', () => {
  it('micro compact keeps only recent tool messages intact', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: 'Calling tool 1',
        toolCalls: [{ id: 'tool-1', name: 'read_file', arguments: '{}' }],
      },
      {
        role: 'tool',
        content: 'old tool result',
        toolCallId: 'tool-1',
      },
      {
        role: 'assistant',
        content: 'Calling tool 2',
        toolCalls: [{ id: 'tool-2', name: 'grep_search', arguments: '{}' }],
      },
      {
        role: 'tool',
        content: 'recent tool result',
        toolCallId: 'tool-2',
      },
    ];

    const compacted = microCompactMessages(messages, 1);
    expect(compacted[1].content).toContain('read_file');
    expect(compacted[3].content).toBe('recent tool result');
  });

  it('auto compact saves a transcript and keeps the latest user request', async () => {
    const projectRoot = await createTempDir('kigo-compaction-');
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    const agent = new Agent({
      provider: new MockProvider(),
      systemPrompt: 'You are a test agent.',
      compaction: {
        enabled: true,
        autoThresholdTokens: 1,
        microKeepRecentToolMessages: 1,
        transcriptDir: '.kigo/state/transcripts',
      },
    });

    agent.loadMessages([
      { role: 'user', content: 'Read lots of code and commands.' },
      { role: 'assistant', content: 'I inspected the repository.' },
      {
        role: 'assistant',
        content: 'Calling grep',
        toolCalls: [{ id: 'tool-1', name: 'grep_search', arguments: '{}' }],
      },
      { role: 'tool', content: 'very long tool output that should be compacted', toolCallId: 'tool-1' },
    ]);

    const events = [];
    for await (const event of agent.run('Continue with the next step.')) {
      events.push(event);
    }

    expect(events.some((event) => event.type === 'done')).toBe(true);
    const messages = agent.getMessages();
    expect(messages[0].content).toContain('[Compacted conversation]');
    expect(messages[0].content).toContain('Transcript:');
    expect(messages[2].content).toBe('Continue with the next step.');
    expect(messages[messages.length - 1].role).toBe('assistant');

    const artifact = agent.getLatestCompactionArtifact();
    expect(artifact).not.toBeNull();
    expect(artifact?.transcriptPath).toContain(path.join('.kigo', 'state', 'transcripts'));
    if (artifact) {
      const transcript = await fs.readFile(artifact.transcriptPath, 'utf-8');
      expect(transcript).toContain('Read lots of code and commands.');
    }
  });
});
