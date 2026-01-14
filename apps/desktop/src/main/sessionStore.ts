import { Session, type Message, type SessionMetadata } from '@kigo/core';

export async function listSessions(limit = 50): Promise<SessionMetadata[]> {
  const session = new Session();
  const sessions = await session.listSessions(limit);
  session.close();
  return sessions.map((item: any) => ({
    id: item.id ?? item.session_id,
    title: item.title ?? null,
    createdAt: item.createdAt ?? item.created_at ?? Date.now(),
    updatedAt: item.updatedAt ?? item.updated_at ?? Date.now(),
    messageCount: item.messageCount ?? item.message_count ?? 0
  }));
}

export async function loadSessionMessages(sessionId: string): Promise<Message[]> {
  const session = new Session(sessionId);
  const messages = await session.getMessages();
  session.close();
  return messages;
}

export async function updateSessionTitle(sessionId: string, title: string | null): Promise<void> {
  const session = new Session(sessionId);
  await session.setTitle(title);
  session.close();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const session = new Session();
  await session.deleteSession(sessionId);
  session.close();
}
