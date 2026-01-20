import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * 원격 브랜치(origin/*)를 사용하기 전에 fetch를 실행합니다.
 * git fetch는 원격 정보만 가져오고 로컬 브랜치를 변경하지 않습니다 (안전함).
 */
async function ensureRemoteFetched(repoPath: string, base: string): Promise<void> {
  // origin/로 시작하는 경우에만 fetch 실행
  if (base.startsWith("origin/")) {
    try {
      // git fetch origin: 원격 정보만 갱신, 로컬 브랜치 변경 없음 (안전)
      await execFileAsync("git", ["fetch", "origin"], { 
        cwd: repoPath,
        maxBuffer: 10 * 1024 * 1024 
      });
    } catch (err: any) {
      // fetch 실패해도 계속 진행 (원격이 없거나 네트워크 문제일 수 있음)
      // diff 실행 시 에러가 나면 그때 처리
      const msg = err?.stderr || err?.message || String(err);
      console.error(`[gitDiff] fetch origin 실패 (무시하고 계속 진행): ${msg}`);
    }
  }
}

export async function getGitDiff(params: {
  repoPath: string;
  base: string;
  head: string;
  contextLines?: number;
}): Promise<{ diff: string; base: string; head: string }> {
  let { repoPath, base, head, contextLines } = params;

  // "main"을 "origin/main"으로 자동 변환
  if (base === "main") {
    base = "origin/main";
  }

  // 원격 브랜치 사용 시 fetch 실행 (로컬 브랜치 변경 없음, 안전)
  await ensureRemoteFetched(repoPath, base);

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
