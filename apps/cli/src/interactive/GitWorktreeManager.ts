import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export class GitWorktreeManager {
  constructor(private readonly projectRoot: string) {}

  async ensureTaskWorktree(taskId: number, existingPath?: string): Promise<string | null> {
    const repoRoot = await this.getRepoRoot();
    if (!repoRoot) {
      return null;
    }

    if (existingPath && await this.isValidWorktree(existingPath)) {
      return existingPath;
    }

    const worktreePath = await this.allocateWorktreePath(repoRoot, taskId);
    const branchName = this.getBranchName(taskId);
    const branchExists = await this.branchExists(repoRoot, branchName);

    await fs.mkdir(path.dirname(worktreePath), { recursive: true });

    const args = branchExists
      ? ["-C", repoRoot, "worktree", "add", "--checkout", worktreePath, branchName]
      : ["-C", repoRoot, "worktree", "add", "--checkout", "-b", branchName, worktreePath, "HEAD"];

    try {
      await execFile("git", args, { cwd: repoRoot });
      return worktreePath;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create git worktree for task #${taskId}: ${message}`);
    }
  }

  async cleanupWorktree(worktreePath: string): Promise<boolean> {
    if (!worktreePath || worktreePath === this.projectRoot) {
      return false;
    }

    if (!(await pathExists(worktreePath))) {
      return false;
    }

    const repoRoot = await this.getRepoRoot();
    if (!repoRoot) {
      await fs.rm(worktreePath, { recursive: true, force: true });
      return true;
    }

    try {
      await execFile("git", ["-C", repoRoot, "worktree", "remove", "--force", worktreePath], {
        cwd: repoRoot,
      });
      return true;
    } catch {
      await fs.rm(worktreePath, { recursive: true, force: true });
      return true;
    }
  }

  async isValidWorktree(worktreePath: string): Promise<boolean> {
    if (!worktreePath || !(await pathExists(worktreePath))) {
      return false;
    }

    try {
      const { stdout } = await execFile("git", ["-C", worktreePath, "rev-parse", "--show-toplevel"]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async getRepoRoot(): Promise<string | null> {
    try {
      const { stdout } = await execFile(
        "git",
        ["-C", this.projectRoot, "rev-parse", "--show-toplevel"],
        { cwd: this.projectRoot },
      );
      const root = stdout.trim();
      return root.length > 0 ? root : null;
    } catch {
      return null;
    }
  }

  private getBranchName(taskId: number): string {
    return `kigo/task-${taskId}`;
  }

  private async branchExists(repoRoot: string, branchName: string): Promise<boolean> {
    try {
      await execFile("git", ["-C", repoRoot, "show-ref", "--verify", `refs/heads/${branchName}`], {
        cwd: repoRoot,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async allocateWorktreePath(repoRoot: string, taskId: number): Promise<string> {
    const repoKey = sanitizeSegment(path.basename(repoRoot));
    const baseDir = path.join(os.tmpdir(), "kigo-worktrees", repoKey);
    const preferred = path.join(baseDir, `task-${taskId}`);

    if (!(await pathExists(preferred))) {
      return preferred;
    }

    if (await this.isValidWorktree(preferred)) {
      return preferred;
    }

    return path.join(baseDir, `task-${taskId}-${Date.now()}`);
  }
}
