import chalk from "chalk";
import { SlashCommand, CommandContext } from "../types.js";

function formatTimestamp(value?: number): string {
  return value ? new Date(value).toLocaleTimeString() : "-";
}

function previewBody(value: string, maxChars: number = 140): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}...`;
}

function formatMessage(message: {
  id: string;
  from: string;
  type: string;
  subject: string;
  body: string;
  createdAt: number;
  acknowledgedAt?: number;
}): string[] {
  const ack = message.acknowledgedAt ? ` ack:${formatTimestamp(message.acknowledgedAt)}` : "";
  return [
    `  - ${message.id} [${message.type}] from:${message.from} at:${formatTimestamp(message.createdAt)}${ack} ${message.subject}`,
    `    ${previewBody(message.body)}`,
  ];
}

export class MailCommand implements SlashCommand {
  name = "mail";
  description = "Inspect and manage agent mailbox messages";

  async execute(args: string[], context: CommandContext): Promise<void> {
    const mailboxStore = context.mailboxStore;
    if (!mailboxStore) {
      console.log("Mailbox store not available.");
      return;
    }

    const action = (args[0] || "list").toLowerCase();

    if (action === "list") {
      const includeAcknowledged = args.includes("--all");
      const filteredArgs = args.slice(1).filter((arg) => arg !== "--all");
      const inbox = filteredArgs[0]?.trim() || "human";
      const messages = await mailboxStore.list(inbox, {
        includeAcknowledged,
        limit: 20,
      });

      if (messages.length === 0) {
        console.log(`No mail in ${inbox}.`);
        return;
      }

      console.log(`\n${chalk.bold(`Mailbox: ${inbox}`)}`);
      for (const message of messages) {
        for (const line of formatMessage(message)) {
          console.log(line);
        }
      }
      console.log("");
      return;
    }

    if (action === "send") {
      const separatorIndex = args.indexOf("--");
      const head = args.slice(1, separatorIndex === -1 ? args.length : separatorIndex);
      const body = separatorIndex === -1 ? "" : args.slice(separatorIndex + 1).join(" ").trim();
      const to = head[0]?.trim();
      const subject = head.slice(1).join(" ").trim();
      if (!to || !subject || !body) {
        console.log("Usage: /mail send <to> <subject> -- <body>");
        return;
      }

      const message = await mailboxStore.send({
        from: `human:${context.session.getId()}`,
        to,
        subject,
        body,
        type: "note",
      });
      console.log(`Sent ${message.id} to ${message.to}`);
      return;
    }

    if (action === "ack") {
      const filteredArgs = args.slice(1).filter(Boolean);
      const inbox = filteredArgs.length > 1 ? filteredArgs[0] : "human";
      const messageId = filteredArgs.length > 1 ? filteredArgs[1] : filteredArgs[0];

      if (!messageId) {
        console.log("Usage: /mail ack [inbox] <messageId>");
        return;
      }

      const message = await mailboxStore.acknowledge(
        inbox,
        messageId,
        `human:${context.session.getId()}`,
      );
      console.log(`Acknowledged ${message.id} in ${inbox}`);
      return;
    }

    console.log("Usage: /mail [list [inbox] [--all]|send <to> <subject> -- <body>|ack [inbox] <messageId>]");
  }
}
