import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MailboxStore } from "@kigo/tools";
import { MailCommand } from "./MailCommand.js";

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

describe("MailCommand", () => {
  it("sends, lists, and acknowledges mailbox messages", async () => {
    const projectRoot = await createTempDir("kigo-mail-command-");
    const command = new MailCommand();
    const mailboxStore = new MailboxStore(projectRoot);
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => {
      logs.push(String(value ?? ""));
    });

    const context = {
      mailboxStore,
      session: {
        getId: () => "session_mail",
      },
    } as any;

    await command.execute(["send", "build", "Need", "review", "--", "Please", "check", "task", "12"], context);
    expect(logs.some((line) => line.includes("Sent mail_"))).toBe(true);

    logs.length = 0;
    await command.execute(["list", "build"], context);
    expect(logs.some((line) => line.includes("Mailbox: build"))).toBe(true);
    expect(logs.some((line) => line.includes("Need review"))).toBe(true);

    const [message] = await mailboxStore.list("build");
    logs.length = 0;
    await command.execute(["ack", "build", message.id], context);
    expect(logs.some((line) => line.includes(`Acknowledged ${message.id}`))).toBe(true);
  });
});
