import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getGitDiff(params: {
  repoPath: string;
  base: string;
  head: string;
  contextLines?: number;
}): Promise<{ diff: string; base: string; head: string }> {
  const { repoPath, base, head, contextLines } = params;

  // main...HEAD 형태가 일반적으로 PR diff에 가까움(merge-base 기준)
  const range = `${base}...${head}`;

  const args = ["diff", range];
  if (typeof contextLines === "number") {
    args.push(`--unified=${Math.max(0, Math.floor(contextLines))}`);
  }

  try {
    const { stdout } = await execFileAsync("git", args, { cwd: repoPath, maxBuffer: 20 * 1024 * 1024 });
    return { diff: stdout ?? "", base, head };
  } catch (err: any) {
    const msg = err?.stderr || err?.message || String(err);
    throw new Error(`git diff 실패: ${msg}`);
  }
}
