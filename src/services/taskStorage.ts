import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

export type Task = {
  id: string;
  created_at: string;
  updated_at: string;
  status: TaskStatus;

  // 원본 리뷰 연결 (선택)
  source_review_id?: string;
  source_finding_index?: number;

  // Task 내용
  title: string;
  description: string;
  file?: string;
  startLine?: number;
  endLine?: number;
  severity: "low" | "medium" | "high";
  category?: string;

  // 수정 제안
  suggestion_patch_diff?: string;

  // 완료 정보
  completed_at?: string;
  verification_note?: string;
};

function nowIso() {
  return new Date().toISOString();
}

export async function ensureTaskDirs(dataDir: string) {
  await fs.mkdir(path.join(dataDir, "tasks"), { recursive: true });
}

export function newTaskId() {
  return `task_${nowIso().replace(/[:.]/g, "-")}_${crypto.randomBytes(3).toString("hex")}`;
}

/**
 * Task 저장 (신규 생성)
 */
export async function saveTask(
  dataDir: string,
  task: Omit<Task, "id" | "created_at" | "updated_at">
): Promise<Task> {
  await ensureTaskDirs(dataDir);
  const id = newTaskId();
  const now = nowIso();
  const full: Task = { id, created_at: now, updated_at: now, ...task };

  const file = path.join(dataDir, "tasks", `${id}.json`);
  await fs.writeFile(file, JSON.stringify(full, null, 2), "utf-8");
  return full;
}

/**
 * Task 업데이트
 */
export async function updateTask(
  dataDir: string,
  id: string,
  updates: Partial<Omit<Task, "id" | "created_at">>
): Promise<Task> {
  const existing = await getTask(dataDir, id);
  const updated: Task = {
    ...existing,
    ...updates,
    updated_at: nowIso(),
  };

  const file = path.join(dataDir, "tasks", `${id}.json`);
  await fs.writeFile(file, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

/**
 * Task 상태 변경
 */
export async function updateTaskStatus(
  dataDir: string,
  id: string,
  status: TaskStatus,
  extra?: { completed_at?: string; verification_note?: string }
): Promise<Task> {
  return updateTask(dataDir, id, { status, ...extra });
}

/**
 * Task 목록 조회 (상태 필터링 가능)
 */
export async function listTasks(
  dataDir: string,
  options?: { status?: TaskStatus; limit?: number }
): Promise<Task[]> {
  await ensureTaskDirs(dataDir);
  const dir = path.join(dataDir, "tasks");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));

  // 최신이 위로
  files.sort((a, b) => b.localeCompare(a));

  const out: Task[] = [];
  for (const f of files) {
    const txt = await fs.readFile(path.join(dir, f), "utf-8");
    const task: Task = JSON.parse(txt);
    
    // 상태 필터링
    if (options?.status && task.status !== options.status) {
      continue;
    }
    
    out.push(task);
    
    // limit 체크
    if (options?.limit && out.length >= options.limit) {
      break;
    }
  }
  return out;
}

/**
 * 특정 Task 조회
 */
export async function getTask(dataDir: string, id: string): Promise<Task> {
  await ensureTaskDirs(dataDir);
  const file = path.join(dataDir, "tasks", `${id}.json`);
  const txt = await fs.readFile(file, "utf-8");
  return JSON.parse(txt);
}

/**
 * Task 삭제
 */
export async function deleteTask(dataDir: string, id: string): Promise<void> {
  const file = path.join(dataDir, "tasks", `${id}.json`);
  await fs.unlink(file);
}

/**
 * 리뷰의 findings를 Task로 변환
 */
export async function createTasksFromReview(
  dataDir: string,
  reviewId: string,
  review: {
    findings: Array<{
      severity: "low" | "medium" | "high";
      category?: string;
      file?: string;
      startLine?: number;
      endLine?: number;
      title_ko: string;
      detail_ko: string;
      suggestion_patch_diff?: string;
    }>;
  }
): Promise<Task[]> {
  const tasks: Task[] = [];

  for (let i = 0; i < review.findings.length; i++) {
    const finding = review.findings[i];
    const task = await saveTask(dataDir, {
      status: "pending",
      source_review_id: reviewId,
      source_finding_index: i,
      title: finding.title_ko,
      description: finding.detail_ko,
      file: finding.file,
      startLine: finding.startLine,
      endLine: finding.endLine,
      severity: finding.severity,
      category: finding.category,
      suggestion_patch_diff: finding.suggestion_patch_diff,
    });
    tasks.push(task);
  }

  return tasks;
}

/**
 * Task 통계
 */
export async function getTaskStats(dataDir: string): Promise<{
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  cancelled: number;
}> {
  const all = await listTasks(dataDir);
  return {
    total: all.length,
    pending: all.filter((t) => t.status === "pending").length,
    in_progress: all.filter((t) => t.status === "in_progress").length,
    completed: all.filter((t) => t.status === "completed").length,
    cancelled: all.filter((t) => t.status === "cancelled").length,
  };
}

/**
 * Task를 마크다운으로 변환
 */
export function taskToMarkdown(task: Task): string {
  const lines: string[] = [];
  lines.push(`# Task: ${task.title}`);
  lines.push("");
  lines.push(`- **ID**: ${task.id}`);
  lines.push(`- **상태**: ${task.status}`);
  lines.push(`- **심각도**: ${task.severity}`);
  if (task.category) lines.push(`- **분류**: ${task.category}`);
  if (task.file) {
    const loc = task.startLine 
      ? `${task.file}:${task.startLine}${task.endLine ? `-${task.endLine}` : ""}`
      : task.file;
    lines.push(`- **위치**: \`${loc}\``);
  }
  lines.push(`- **생성**: ${task.created_at}`);
  lines.push(`- **수정**: ${task.updated_at}`);
  if (task.source_review_id) {
    lines.push(`- **원본 리뷰**: ${task.source_review_id} (finding #${(task.source_finding_index ?? 0) + 1})`);
  }
  lines.push("");
  lines.push("## 설명");
  lines.push("");
  lines.push(task.description);
  lines.push("");

  if (task.suggestion_patch_diff) {
    lines.push("## 제안 패치");
    lines.push("");
    lines.push("```diff");
    lines.push(task.suggestion_patch_diff.replace(/^```diff\n?|```$/g, "").trim());
    lines.push("```");
    lines.push("");
  }

  if (task.completed_at) {
    lines.push("## 완료 정보");
    lines.push("");
    lines.push(`- **완료 시각**: ${task.completed_at}`);
    if (task.verification_note) {
      lines.push(`- **검증 노트**: ${task.verification_note}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
