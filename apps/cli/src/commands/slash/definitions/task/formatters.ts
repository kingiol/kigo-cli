function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export function formatOptionalTime(ts?: number): string {
  return ts ? formatTime(ts) : "-";
}

export function formatTaskEvent(event: {
  type: string;
  timestamp: number;
  taskRunId: string;
  taskNodeId?: number;
  status: string;
  error?: string;
}): string {
  const node = event.taskNodeId ? ` task:#${event.taskNodeId}` : "";
  const detail = event.error ? ` error:${event.error}` : "";
  return `  - ${formatTime(event.timestamp)} ${event.type}${node} run:${event.taskRunId} status:${event.status}${detail}`;
}

export function formatExecutionSummary(execution: {
  runId: string;
  status: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}): string {
  const started = execution.startedAt ? formatTime(execution.startedAt) : "-";
  const completed = execution.completedAt ? formatTime(execution.completedAt) : "-";
  const detail = execution.error ? ` error:${execution.error}` : "";
  return `  - ${execution.runId} [${execution.status}] started:${started} completed:${completed}${detail}`;
}

export function formatTaskNode(task: {
  id: number;
  status: string;
  owner: string;
  blockedBy: number[];
  subject: string;
  lastRunStatus?: string;
}): string {
  const owner = task.owner || "-";
  const blocked = task.blockedBy.length > 0 ? ` blocked:${task.blockedBy.join(",")}` : "";
  const lastRun = task.lastRunStatus ? ` lastRun:${task.lastRunStatus}` : "";
  return `  - #${task.id} [${task.status}] owner:${owner}${blocked}${lastRun} ${task.subject}`;
}

export function formatDispatchTarget(target: {
  task: { id: number; subject: string; owner: string; status: string };
  mode: "execute" | "resume";
  pendingInboxCount: number;
  waitingType?: string;
}): string {
  const owner = target.task.owner || "-";
  const pending = target.pendingInboxCount > 0 ? ` inbox:${target.pendingInboxCount}` : "";
  const waiting = target.waitingType ? ` waiting:${target.waitingType}` : "";
  return `  - #${target.task.id} [${target.mode}] taskStatus:${target.task.status} owner:${owner}${waiting}${pending} ${target.task.subject}`;
}

export function formatThreadMessage(message: {
  mailbox: "human" | "task";
  id: string;
  type: string;
  from: string;
  subject: string;
  body: string;
  createdAt: number;
  acknowledgedAt?: number;
}): string[] {
  const ack = message.acknowledgedAt ? ` ack:${formatTime(message.acknowledgedAt)}` : "";
  const preview = message.body.length > 160 ? `${message.body.slice(0, 160)}...` : message.body;
  return [
    `  - [${message.mailbox}] ${message.id} ${formatTime(message.createdAt)}${ack} ${message.type} from:${message.from}`,
    `    ${message.subject}`,
    `    ${preview}`,
  ];
}

export function formatProtocolMessage(message?: {
  type: string;
  from: string;
  subject: string;
  body: string;
}): string {
  if (!message) {
    return "-";
  }

  const preview = message.body.length > 120 ? `${message.body.slice(0, 120)}...` : message.body;
  return `[${message.type}] from:${message.from} subject:${message.subject} body:${preview}`;
}
