import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BaseProvider } from '../models/BaseProvider.js';
import type { Message } from '../types.js';

export interface AgentCompactionOptions {
  enabled: boolean;
  microKeepRecentToolMessages: number;
  autoThresholdTokens: number;
  summaryMaxChars: number;
  transcriptDir: string;
}

export interface CompactionArtifact {
  mode: 'auto' | 'manual';
  transcriptPath: string;
  summary: string;
  messagesBefore: number;
  messagesAfter: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
}

export const DEFAULT_AGENT_COMPACTION_OPTIONS: AgentCompactionOptions = {
  enabled: true,
  microKeepRecentToolMessages: 6,
  autoThresholdTokens: 50000,
  summaryMaxChars: 120000,
  transcriptDir: '.kigo/state/transcripts',
};

function resolveOptions(
  options?: Partial<AgentCompactionOptions>
): AgentCompactionOptions {
  return {
    ...DEFAULT_AGENT_COMPACTION_OPTIONS,
    ...options,
  };
}

function buildToolNameMap(messages: Message[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.toolCalls) {
      continue;
    }
    for (const toolCall of message.toolCalls) {
      if (toolCall.id && toolCall.name) {
        map.set(toolCall.id, toolCall.name);
      }
    }
  }
  return map;
}

export function estimateMessageTokens(messages: Message[]): number {
  const text = messages
    .map((message) => {
      const toolCalls = message.toolCalls ? JSON.stringify(message.toolCalls) : '';
      return `${message.role}\n${message.content}\n${toolCalls}`;
    })
    .join('\n');

  return Math.ceil(text.length / 4);
}

export function microCompactMessages(
  messages: Message[],
  keepRecentToolMessages: number
): Message[] {
  if (keepRecentToolMessages < 0) {
    return [...messages];
  }

  const toolNameMap = buildToolNameMap(messages);
  let recentToolMessagesSeen = 0;
  const compacted = messages.map((message) => ({ ...message }));

  for (let index = compacted.length - 1; index >= 0; index -= 1) {
    const message = compacted[index];
    if (message.role !== 'tool') {
      continue;
    }

    recentToolMessagesSeen += 1;
    if (recentToolMessagesSeen <= keepRecentToolMessages) {
      continue;
    }

    const toolName = message.toolCallId
      ? toolNameMap.get(message.toolCallId) || 'tool'
      : 'tool';
    message.content = `[Compacted tool result: used ${toolName} earlier]`;
  }

  return compacted;
}

function splitTrailingUserMessage(messages: Message[]): {
  history: Message[];
  trailingUser: Message | null;
} {
  if (messages.length === 0) {
    return { history: [], trailingUser: null };
  }

  const last = messages[messages.length - 1];
  if (last.role !== 'user') {
    return { history: [...messages], trailingUser: null };
  }

  return {
    history: messages.slice(0, -1),
    trailingUser: { ...last },
  };
}

function serializeMessagesForSummary(messages: Message[], maxChars: number): string {
  const serialized = JSON.stringify(messages, null, 2);
  if (serialized.length <= maxChars) {
    return serialized;
  }
  return `${serialized.slice(0, maxChars)}\n...`;
}

function buildFallbackSummary(messages: Message[]): string {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
  const toolCount = messages.filter((message) => message.role === 'tool').length;

  const lines = [
    '- Conversation was compacted with fallback summarization.',
    `- Total messages before compaction: ${messages.length}.`,
    `- Tool messages seen: ${toolCount}.`,
  ];

  if (lastUser?.content) {
    lines.push(`- Latest user request: ${lastUser.content.slice(0, 240)}.`);
  }

  if (lastAssistant?.content) {
    lines.push(`- Latest assistant response: ${lastAssistant.content.slice(0, 240)}.`);
  }

  return lines.join('\n');
}

async function summarizeConversation(
  provider: BaseProvider,
  messages: Message[],
  maxChars: number
): Promise<string> {
  if (messages.length === 0) {
    return '- No prior conversation to summarize.';
  }

  const summaryPrompt = [
    'Summarize this coding session for continuity.',
    'Keep the answer concise Markdown bullets.',
    'Preserve:',
    '- current user goal',
    '- files or subsystems touched',
    '- decisions already made',
    '- pending tasks and blockers',
    '- notable tool results that still matter',
    '',
    'Conversation:',
    serializeMessagesForSummary(messages, maxChars),
  ].join('\n');

  try {
    const response = await provider.chatNonStream({
      messages: [{ role: 'user', content: summaryPrompt }],
      maxTokens: 800,
      temperature: 0.2,
    });

    if (response.content?.trim()) {
      return response.content.trim();
    }
  } catch {
    // Fall back to a local summary when the model-based summary fails.
  }

  return buildFallbackSummary(messages);
}

export function resolveTranscriptDir(
  transcriptDir: string,
  projectRoot: string
): string {
  if (path.isAbsolute(transcriptDir)) {
    return transcriptDir;
  }
  return path.join(projectRoot, transcriptDir);
}

async function writeTranscript(
  messages: Message[],
  transcriptDir: string,
  mode: 'auto' | 'manual'
): Promise<string> {
  await fs.mkdir(transcriptDir, { recursive: true });
  const filePath = path.join(
    transcriptDir,
    `transcript_${mode}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jsonl`
  );
  const content = messages
    .map((message) => JSON.stringify(message))
    .join('\n');
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

export async function compactConversation(options: {
  messages: Message[];
  provider: BaseProvider;
  projectRoot?: string;
  mode?: 'auto' | 'manual';
  reason?: string;
  config?: Partial<AgentCompactionOptions>;
}): Promise<{ messages: Message[]; artifact: CompactionArtifact }> {
  const resolved = resolveOptions(options.config);
  const mode = options.mode || 'manual';
  const projectRoot = options.projectRoot || process.env.KIGO_PROJECT_ROOT || process.cwd();

  const originalMessages = options.messages.map((message) => ({ ...message }));
  const microCompacted = microCompactMessages(
    originalMessages,
    resolved.microKeepRecentToolMessages
  );
  const estimatedTokensBefore = estimateMessageTokens(microCompacted);
  const { history, trailingUser } = splitTrailingUserMessage(microCompacted);

  const transcriptPath = await writeTranscript(
    originalMessages,
    resolveTranscriptDir(resolved.transcriptDir, projectRoot),
    mode
  );
  const summary = await summarizeConversation(
    options.provider,
    history.length > 0 ? history : microCompacted,
    resolved.summaryMaxChars
  );

  const compactedMessages: Message[] = [
    {
      role: 'user',
      content: [
        '[Compacted conversation]',
        `Reason: ${options.reason || (mode === 'auto' ? 'auto_threshold' : 'manual_request')}`,
        `Transcript: ${transcriptPath}`,
        '',
        'Summary:',
        summary,
      ].join('\n'),
    },
    {
      role: 'assistant',
      content: 'Understood. Continuing from compacted context.',
    },
  ];

  if (trailingUser) {
    compactedMessages.push(trailingUser);
  }

  const artifact: CompactionArtifact = {
    mode,
    transcriptPath,
    summary,
    messagesBefore: originalMessages.length,
    messagesAfter: compactedMessages.length,
    estimatedTokensBefore,
    estimatedTokensAfter: estimateMessageTokens(compactedMessages),
  };

  return {
    messages: compactedMessages,
    artifact,
  };
}
