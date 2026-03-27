import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import type { ToolExecutionContext } from '@kigo/core';
import { registry } from '../registry.js';

const MAILBOX_DIR = path.join('.kigo', 'state', 'mailboxes');
const MAX_MAIL_SUBJECT_CHARS = 160;
const MAX_MAIL_BODY_CHARS = 4000;

export const mailMessageTypeSchema = z.enum([
  'note',
  'question',
  'answer',
  'status',
  'handoff',
  'approval_request',
  'approval_decision',
]);

export type MailMessageType = z.infer<typeof mailMessageTypeSchema>;

export interface MailMessage {
  id: string;
  from: string;
  to: string;
  type: MailMessageType;
  subject: string;
  body: string;
  taskId?: number;
  runId?: string;
  createdAt: number;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
}

type MailSentEvent = {
  eventType: 'message_sent';
  timestamp: number;
  message: MailMessage;
};

type MailAckEvent = {
  eventType: 'message_acknowledged';
  timestamp: number;
  messageId: string;
  acknowledgedAt: number;
  acknowledgedBy?: string;
};

type MailboxEvent = MailSentEvent | MailAckEvent;

function getProjectRoot(context?: ToolExecutionContext): string {
  return context?.projectRoot || process.env.KIGO_PROJECT_ROOT || process.cwd();
}

function sanitizeMailboxId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]/g, '_');
}

function resolveActor(context?: ToolExecutionContext): string | undefined {
  const agentId = context?.agentId || process.env.KIGO_AGENT_ID;
  if (agentId) {
    return agentId;
  }

  const sessionId = context?.sessionId || process.env.KIGO_SESSION_ID;
  if (sessionId) {
    return `session:${sessionId}`;
  }

  return undefined;
}

function truncateText(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars)}\n\n[truncated at ${maxChars} chars]`;
}

export class MailboxStore {
  constructor(private readonly projectRoot: string = getProjectRoot()) {}

  private getMailboxDir(): string {
    return path.join(this.projectRoot, MAILBOX_DIR);
  }

  private getMailboxPath(agent: string): string {
    return path.join(this.getMailboxDir(), `${sanitizeMailboxId(agent)}.jsonl`);
  }

  private async appendEvent(agent: string, event: MailboxEvent): Promise<void> {
    await fs.mkdir(this.getMailboxDir(), { recursive: true });
    await fs.appendFile(this.getMailboxPath(agent), `${JSON.stringify(event)}\n`, 'utf-8');
  }

  private async loadEvents(agent: string): Promise<MailboxEvent[]> {
    try {
      const content = await fs.readFile(this.getMailboxPath(agent), 'utf-8');
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as MailboxEvent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private materialize(events: MailboxEvent[]): MailMessage[] {
    const messages = new Map<string, MailMessage>();

    for (const event of events) {
      if (event.eventType === 'message_sent') {
        messages.set(event.message.id, { ...event.message });
        continue;
      }

      const message = messages.get(event.messageId);
      if (!message) {
        continue;
      }

      message.acknowledgedAt = event.acknowledgedAt;
      message.acknowledgedBy = event.acknowledgedBy;
    }

    return Array.from(messages.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  async send(input: {
    from: string;
    to: string;
    type?: MailMessageType;
    subject: string;
    body: string;
    taskId?: number;
    runId?: string;
  }): Promise<MailMessage> {
    const message: MailMessage = {
      id: `mail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      from: input.from,
      to: input.to,
      type: input.type || 'note',
      subject: truncateText(input.subject, MAX_MAIL_SUBJECT_CHARS),
      body: truncateText(input.body, MAX_MAIL_BODY_CHARS),
      taskId: input.taskId,
      runId: input.runId,
      createdAt: Date.now(),
    };

    await this.appendEvent(input.to, {
      eventType: 'message_sent',
      timestamp: message.createdAt,
      message,
    });

    return message;
  }

  async list(agent: string, options: {
    includeAcknowledged?: boolean;
    limit?: number;
  } = {}): Promise<MailMessage[]> {
    const events = await this.loadEvents(agent);
    const messages = this.materialize(events).filter((message) =>
      options.includeAcknowledged ? true : !message.acknowledgedAt
    );
    return messages.slice(0, options.limit ?? 20);
  }

  async acknowledge(agent: string, messageId: string, acknowledgedBy?: string): Promise<MailMessage> {
    const events = await this.loadEvents(agent);
    const messages = this.materialize(events);
    const message = messages.find((entry) => entry.id === messageId);
    if (!message) {
      throw new Error(`Message not found in ${agent}: ${messageId}`);
    }

    if (!message.acknowledgedAt) {
      const acknowledgedAt = Date.now();
      await this.appendEvent(agent, {
        eventType: 'message_acknowledged',
        timestamp: acknowledgedAt,
        messageId,
        acknowledgedAt,
        acknowledgedBy,
      });
      message.acknowledgedAt = acknowledgedAt;
      message.acknowledgedBy = acknowledgedBy;
    }

    return message;
  }
}

export const mailSendSchema = z.object({
  to: z.string().min(1),
  type: mailMessageTypeSchema.optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  taskId: z.number().int().positive().optional(),
  runId: z.string().min(1).optional(),
});

export const mailInboxSchema = z.object({
  agent: z.string().min(1).optional(),
  includeAcknowledged: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const mailAckSchema = z.object({
  agent: z.string().min(1).optional(),
  messageId: z.string().min(1),
});

if (!registry.has('mail_send')) {
  registry.register({
    name: 'mail_send',
    description: 'Send a mailbox message to another agent or the human inbox.',
    schema: mailSendSchema,
    execute: async (params, context) => {
      const from = resolveActor(context);
      if (!from) {
        throw new Error('Unable to resolve sender identity for mail_send');
      }

      const store = new MailboxStore(getProjectRoot(context));
      const message = await store.send({
        from,
        to: params.to,
        type: params.type,
        subject: params.subject,
        body: params.body,
        taskId: params.taskId,
        runId: params.runId,
      });

      return JSON.stringify({
        type: 'mail_sent',
        message,
      });
    },
  });
}

if (!registry.has('mail_inbox')) {
  registry.register({
    name: 'mail_inbox',
    description: 'List mailbox messages for the current agent or a named inbox.',
    schema: mailInboxSchema,
    execute: async (params, context) => {
      const agent = params.agent || resolveActor(context);
      if (!agent) {
        throw new Error('Unable to resolve inbox identity for mail_inbox');
      }

      const store = new MailboxStore(getProjectRoot(context));
      const messages = await store.list(agent, {
        includeAcknowledged: params.includeAcknowledged,
        limit: params.limit,
      });

      return JSON.stringify({
        type: 'mail_inbox',
        agent,
        count: messages.length,
        messages,
      });
    },
  });
}

if (!registry.has('mail_ack')) {
  registry.register({
    name: 'mail_ack',
    description: 'Acknowledge a mailbox message in the current agent inbox or a named inbox.',
    schema: mailAckSchema,
    execute: async (params, context) => {
      const agent = params.agent || resolveActor(context);
      if (!agent) {
        throw new Error('Unable to resolve inbox identity for mail_ack');
      }

      const store = new MailboxStore(getProjectRoot(context));
      const message = await store.acknowledge(agent, params.messageId, resolveActor(context));

      return JSON.stringify({
        type: 'mail_ack',
        agent,
        message,
      });
    },
  });
}
