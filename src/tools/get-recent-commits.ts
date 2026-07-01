import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
  filesChanged: string[];
}

/** Validate that repoPath is an absolute path to an existing directory. No shell interpolation. */
function validateRepoPath(raw: string): string {
  const resolved = path.resolve(raw);
  if (!existsSync(resolved)) throw new Error("Repository path does not exist");
  return resolved;
}

function runGit(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 5000,
    // No shell: true — args are passed as an array, never interpolated
  });
  if (result.status !== 0) throw new Error(result.stderr || "git command failed");
  return result.stdout.trim();
}

export async function getRecentCommitsHandler(
  args: { repoPath?: string; count?: number },
  session: { accessToken?: string },
): Promise<{ isError: boolean; content: Array<{ type: "text"; text: string }> }> {
  if (!session.accessToken) {
    return {
      isError: true,
      content: [{ type: "text", text: "Not authenticated. Visit /oauth/authorize to connect LinkedIn." }],
    };
  }

  let repoPath: string;
  try {
    repoPath = args.repoPath ? validateRepoPath(args.repoPath) : process.cwd();
  } catch {
    return {
      isError: true,
      content: [{ type: "text", text: "Invalid repository path." }],
    };
  }

  const count = Math.min(args.count ?? 5, 20);

  try {
    const log = runGit(repoPath, [
      "log", `-${count}`,
      "--pretty=format:%H|%s|%an|%ad",
      "--date=short",
    ]);

    if (!log) {
      return {
        isError: false,
        content: [{ type: "text", text: "No commits found in this repository." }],
      };
    }

    const commits: CommitInfo[] = log.split("\n").map((line) => {
      const [hash = "", message = "", author = "", date = ""] = line.split("|");

      let filesChanged: string[] = [];
      try {
        const files = runGit(repoPath, [
          "diff-tree", "--no-commit-id", "-r", "--name-only", hash,
        ]);
        filesChanged = files ? files.split("\n").filter(Boolean) : [];
      } catch {
        // non-fatal — files list is optional
      }

      return { hash, message, author, date, filesChanged };
    });

    const summary = commits
      .map((c, i) => {
        const files = c.filesChanged.length > 0
          ? `  Files: ${c.filesChanged.slice(0, 5).join(", ")}${c.filesChanged.length > 5 ? ` (+${c.filesChanged.length - 5} more)` : ""}`
          : "";
        return `${i + 1}. [${c.date}] ${c.message}\n   Author: ${c.author}\n   Hash: ${c.hash.slice(0, 8)}${files ? "\n" + files : ""}`;
      })
      .join("\n\n");

    const text =
      `Recent commits (${commits.length}):\n\n${summary}\n\n---\n` +
      `Use these commits to compose a LinkedIn post about what you've been building. ` +
      `Keep it professional and high-level — no internal paths, proprietary details, or client names. ` +
      `Then call postUpdate with the composed text.`;

    return { isError: false, content: [{ type: "text", text }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return {
      isError: true,
      content: [{ type: "text", text: `Could not read git commits: ${msg}` }],
    };
  }
}
