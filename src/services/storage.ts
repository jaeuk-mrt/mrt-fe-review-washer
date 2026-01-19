import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export type Finding = {
  severity: "low" | "medium" | "high";
  category?: string;
  file?: string;
  startLine?: number;
  endLine?: number;
  title_ko: string;
  detail_ko: string;
  suggestion_patch_diff?: string;
};

export type ReviewRecord = {
  id: string;
  created_at: string;
  target: { base: string; head: string };
  summary_ko: string;
  risk?: "low" | "medium" | "high";
  findings: Finding[];
};

function nowIso() {
  return new Date().toISOString();
}

export async function ensureDirs(dataDir: string) {
  await fs.mkdir(path.join(dataDir, "reviews"), { recursive: true });
}

export function newReviewId() {
  // 짧고 파일명 안전한 id
  return `rev_${nowIso().replace(/[:.]/g, "-")}_${crypto.randomBytes(3).toString("hex")}`;
}

export async function saveReview(dataDir: string, record: Omit<ReviewRecord, "id" | "created_at">): Promise<ReviewRecord> {
  await ensureDirs(dataDir);
  const id = newReviewId();
  const created_at = nowIso();
  const full: ReviewRecord = { id, created_at, ...record };

  const file = path.join(dataDir, "reviews", `${id}.json`);
  await fs.writeFile(file, JSON.stringify(full, null, 2), "utf-8");
  return full;
}

export async function listReviews(dataDir: string, limit = 20): Promise<ReviewRecord[]> {
  await ensureDirs(dataDir);
  const dir = path.join(dataDir, "reviews");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));

  // 최신이 위로
  files.sort((a, b) => b.localeCompare(a));

  const sliced = files.slice(0, Math.max(1, limit));
  const out: ReviewRecord[] = [];
  for (const f of sliced) {
    const txt = await fs.readFile(path.join(dir, f), "utf-8");
    out.push(JSON.parse(txt));
  }
  return out;
}

export async function getReview(dataDir: string, id: string): Promise<ReviewRecord> {
  await ensureDirs(dataDir);
  const file = path.join(dataDir, "reviews", `${id}.json`);
  const txt = await fs.readFile(file, "utf-8");
  return JSON.parse(txt);
}

export async function getLatestReview(dataDir: string): Promise<ReviewRecord | null> {
  const list = await listReviews(dataDir, 1);
  return list[0] ?? null;
}

export function toMarkdown(review: ReviewRecord): string {
  const lines: string[] = [];
  lines.push(`# 코드리뷰 결과 (${review.id})`);
  lines.push("");
  lines.push(`- 생성 시각: ${review.created_at}`);
  lines.push(`- 대상: \`${review.target.base}...${review.target.head}\``);
  if (review.risk) lines.push(`- 리스크: **${review.risk}**`);
  lines.push("");
  lines.push("## 요약");
  lines.push("");
  lines.push(review.summary_ko.trim());
  lines.push("");

  if (!review.findings?.length) {
    lines.push("## 발견사항");
    lines.push("");
    lines.push("- (없음)");
    return lines.join("\n");
  }

  // 발견사항 통계
  const highCount = review.findings.filter(f => f.severity === "high").length;
  const mediumCount = review.findings.filter(f => f.severity === "medium").length;
  const lowCount = review.findings.filter(f => f.severity === "low").length;
  const withSuggestion = review.findings.filter(f => f.suggestion_patch_diff).length;

  lines.push("## 🔍 주요 발견사항");
  lines.push("");
  lines.push(`> 총 **${review.findings.length}건** (🔴 high: ${highCount} | 🟡 medium: ${mediumCount} | 🟢 low: ${lowCount}) | 제안 패치: ${withSuggestion}건`);
  lines.push("");
  
  // 요약 테이블
  lines.push("| 심각도 | 파일 | 이슈 |");
  lines.push("|--------|------|------|");
  review.findings.forEach((f) => {
    const severityIcon = { high: "🔴", medium: "🟡", low: "🟢" }[f.severity];
    const fileName = f.file ? f.file.split("/").pop() : "-";
    lines.push(`| ${severityIcon} **${f.severity}** | \`${fileName}\` | ${f.title_ko} |`);
  });
  lines.push("");

  // 상세 내용
  lines.push("---");
  lines.push("");
  lines.push("## 📋 상세 내용");
  lines.push("");

  review.findings.forEach((f, idx) => {
    const severityIcon = { high: "🔴", medium: "🟡", low: "🟢" }[f.severity];
    const where =
      f.file
        ? `${f.file}${(f.startLine || f.endLine) ? `:${f.startLine ?? ""}-${f.endLine ?? ""}` : ""}`
        : "(파일 미지정)";
    
    lines.push(`### ${idx + 1}. ${severityIcon} [${f.severity}] ${f.title_ko}`);
    lines.push("");
    lines.push(`- **위치**: \`${where}\``);
    if (f.category) lines.push(`- **분류**: ${f.category}`);
    lines.push("");
    lines.push("**설명:**");
    lines.push("");
    lines.push(f.detail_ko.trim());
    lines.push("");
    
    if (f.suggestion_patch_diff) {
      lines.push("**✅ 제안 패치:**");
      lines.push("");
      lines.push("```diff");
      lines.push(f.suggestion_patch_diff.replace(/^```diff\n?|```$/g, "").trim());
      lines.push("```");
    } else {
      lines.push("**💡 제안 패치:** (없음 - 수동 검토 필요)");
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  });

  return lines.join("\n");
}
