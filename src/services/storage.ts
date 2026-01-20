import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// 6가지 코드 리뷰 기준 카테고리
export type CategoryType = 
  | "readability"      // 가독성
  | "predictability"   // 예측 가능성
  | "cohesion"         // 응집도
  | "coupling"         // 결합도
  | "micro_perspective" // 미시적 관점
  | "intent_clarity";   // 코드 작성 의도 간결성

// 평가 라벨 (점수 기반)
export type SeverityType = 
  | "suggestion"          // 단순제안 (100~80점)
  | "recommendation"      // 적극제안 (79~60점)
  | "improvement"         // 개선 (59~40점)
  | "required"            // 필수 (39~0점)
  | "needs_confirmation"; // 확인요청 (확신이 없는 경우)

export type Finding = {
  severity: SeverityType;
  category?: CategoryType;
  file?: string;
  startLine?: number;
  endLine?: number;
  title_ko: string;
  detail_ko: string;
  suggestion_patch_diff?: string;
};

// 기준별 피드백
export type CriteriaFeedbackItem = {
  label?: SeverityType; // 해당 기준의 평가 라벨
  improve: string[];    // 개선 필요한 점
};

export type CriteriaFeedback = {
  readability?: CriteriaFeedbackItem;
  predictability?: CriteriaFeedbackItem;
  cohesion?: CriteriaFeedbackItem;
  coupling?: CriteriaFeedbackItem;
  micro_perspective?: CriteriaFeedbackItem;
  intent_clarity?: CriteriaFeedbackItem;
};

export type ReviewRecord = {
  id: string;
  created_at: string;
  target: { base: string; head: string };
  summary_ko: string;
  risk?: "low" | "medium" | "high";
  criteria_feedback?: CriteriaFeedback;  // 5가지 기준별 피드백
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

// 카테고리 한글 매핑
const CATEGORY_LABELS: Record<CategoryType, string> = {
  readability: "가독성",
  predictability: "예측 가능성",
  cohesion: "응집도",
  coupling: "결합도",
  micro_perspective: "미시적 관점",
  intent_clarity: "의도 간결성"
};

// 평가 라벨 한글 매핑
const SEVERITY_LABELS: Record<SeverityType, string> = {
  suggestion: "단순제안",
  recommendation: "적극제안",
  improvement: "개선",
  required: "필수",
  needs_confirmation: "확인요청"
};

// 평가 라벨 아이콘 매핑
const SEVERITY_ICONS: Record<SeverityType, string> = {
  suggestion: "💡",
  recommendation: "📝",
  improvement: "⚠️",
  required: "🔴",
  needs_confirmation: "❓"
};

export async function saveMarkdownFile(dataDir: string, reviewId: string, content: string): Promise<string> {
  await ensureDirs(dataDir);
  const filePath = path.join(dataDir, "reviews", `${reviewId}.md`);
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
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

  // 6가지 기준별 피드백 출력
  if (review.criteria_feedback) {
    lines.push("## 📊 코드 품질 기준별 피드백");
    lines.push("");
    
    const criteriaOrder: CategoryType[] = [
      "readability", "predictability", "cohesion", "coupling", "micro_perspective", "intent_clarity"
    ];
    
    for (const key of criteriaOrder) {
      const feedback = review.criteria_feedback[key];
      if (feedback) {
        const labelStr = feedback.label 
          ? ` [${SEVERITY_ICONS[feedback.label]} ${SEVERITY_LABELS[feedback.label]}]`
          : "";
        lines.push(`### ${CATEGORY_LABELS[key]}${labelStr}`);
        lines.push("");
        
        if (feedback.improve?.length) {
          for (const item of feedback.improve) {
            lines.push(`- ⚠️ ${item}`);
          }
        } else {
          lines.push("- (평가 없음)");
        }
        lines.push("");
      }
    }
  }

  if (!review.findings?.length) {
    lines.push("## 발견사항");
    lines.push("");
    lines.push("- (없음)");
    return lines.join("\n");
  }

  // 발견사항 통계
  const requiredCount = review.findings.filter(f => f.severity === "required").length;
  const improvementCount = review.findings.filter(f => f.severity === "improvement").length;
  const recommendationCount = review.findings.filter(f => f.severity === "recommendation").length;
  const suggestionCount = review.findings.filter(f => f.severity === "suggestion").length;
  const needsConfirmationCount = review.findings.filter(f => f.severity === "needs_confirmation").length;
  const withSuggestion = review.findings.filter(f => f.suggestion_patch_diff).length;

  lines.push("## 🔍 주요 발견사항");
  lines.push("");
  lines.push(`> 총 **${review.findings.length}건** (🔴 필수: ${requiredCount} | ⚠️ 개선: ${improvementCount} | 📝 적극제안: ${recommendationCount} | 💡 단순제안: ${suggestionCount} | ❓ 확인요청: ${needsConfirmationCount}) | 제안 패치: ${withSuggestion}건`);
  lines.push("");
  
  // 요약 테이블
  lines.push("| 평가 라벨 | 파일 | 이슈 |");
  lines.push("|----------|------|------|");
  review.findings.forEach((f) => {
    const severityIcon = SEVERITY_ICONS[f.severity];
    const severityLabel = SEVERITY_LABELS[f.severity];
    const fileName = f.file ? f.file.split("/").pop() : "-";
    lines.push(`| ${severityIcon} **${severityLabel}** | \`${fileName}\` | ${f.title_ko} |`);
  });
  lines.push("");

  // 상세 내용
  lines.push("---");
  lines.push("");
  lines.push("## 📋 상세 내용");
  lines.push("");

  review.findings.forEach((f, idx) => {
    const severityIcon = SEVERITY_ICONS[f.severity];
    const severityLabel = SEVERITY_LABELS[f.severity];
    const where =
      f.file
        ? `${f.file}${(f.startLine || f.endLine) ? `:${f.startLine ?? ""}-${f.endLine ?? ""}` : ""}`
        : "(파일 미지정)";
    
    lines.push(`### ${idx + 1}. ${severityIcon} [${severityLabel}] ${f.title_ko}`);
    lines.push("");
    lines.push(`- **위치**: \`${where}\``);
    // 카테고리를 한글로 표시
    if (f.category) {
      const categoryLabel = CATEGORY_LABELS[f.category] || f.category;
      lines.push(`- **분류**: ${categoryLabel}`);
    }
    lines.push("");
    lines.push("**설명:**");
    lines.push("");
    lines.push(f.detail_ko.trim());
    lines.push("");
    
    if (f.suggestion_patch_diff) {
      lines.push("**✅ 제안 패치:**");
      lines.push("");
      // diff 내용에서 코드 블록 마커 제거 및 정리
      const cleanDiff = f.suggestion_patch_diff
        .replace(/^```diff\s*/i, "")  // 시작 부분의 ```diff 제거
        .replace(/```\s*$/g, "")      // 끝 부분의 ``` 제거
        .trim();
      lines.push("```diff");
      lines.push(cleanDiff);
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
