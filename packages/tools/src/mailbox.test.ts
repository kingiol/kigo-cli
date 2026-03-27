import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MailboxStore } from './agent/mailbox.js';
import { registry } from './registry.js';
import './index.js';

const tempDirs: string[] = [];
const originalProjectRoot = process.env.KIGO_PROJECT_ROOT;
const originalAgentId = process.env.KIGO_AGENT_ID;
const originalSessionId = process.env.KIGO_SESSION_ID;

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

  if (originalAgentId === undefined) {
    delete process.env.KIGO_AGENT_ID;
  } else {
    process.env.KIGO_AGENT_ID = originalAgentId;
  }

  if (originalSessionId === undefined) {
    delete process.env.KIGO_SESSION_ID;
  } else {
    process.env.KIGO_SESSION_ID = originalSessionId;
  }

  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('mailbox tools', () => {
  it('sends, lists, and acknowledges mailbox messages through the store', async () => {
    const projectRoot = await createTempDir('kigo-mailbox-store-');
    const store = new MailboxStore(projectRoot);

    const message = await store.send({
      from: 'build',
      to: 'human',
      type: 'handoff',
      subject: 'Need review',
      body: 'Please review task #12.',
      taskId: 12,
      runId: 'run_12',
    });

    const unread = await store.list('human');
    expect(unread).toHaveLength(1);
    expect(unread[0].id).toBe(message.id);
    expect(unread[0].acknowledgedAt).toBeUndefined();

    const acknowledged = await store.acknowledge('human', message.id, 'human');
    expect(acknowledged.acknowledgedBy).toBe('human');

    const unreadAfterAck = await store.list('human');
    expect(unreadAfterAck).toHaveLength(0);

    const allMessages = await store.list('human', { includeAcknowledged: true });
    expect(allMessages).toHaveLength(1);
    expect(allMessages[0].acknowledgedBy).toBe('human');
  });

  it('uses tool execution context to resolve the active mailbox identity', async () => {
    const projectRoot = await createTempDir('kigo-mailbox-tool-');
    process.env.KIGO_PROJECT_ROOT = projectRoot;

    const mailSend = registry.get('mail_send');
    const mailInbox = registry.get('mail_inbox');
    const mailAck = registry.get('mail_ack');

    expect(mailSend).toBeDefined();
    expect(mailInbox).toBeDefined();
    expect(mailAck).toBeDefined();

    const sent = JSON.parse(
      await mailSend!.execute(
        {
          to: 'human',
          type: 'question',
          subject: 'Need input',
          body: 'Which approach should I take?',
        },
        { projectRoot, agentId: 'build', sessionId: 'session_mail' },
      ),
    );

    const inbox = JSON.parse(await mailInbox!.execute({ agent: 'human' }, { projectRoot }));
    expect(inbox.count).toBe(1);
    expect(inbox.messages[0].from).toBe('build');
    expect(inbox.messages[0].subject).toBe('Need input');

    const acknowledged = JSON.parse(
      await mailAck!.execute(
        {
          agent: 'human',
          messageId: sent.message.id,
        },
        { projectRoot, agentId: 'human' },
      ),
    );

    expect(acknowledged.message.acknowledgedBy).toBe('human');
  });
});
