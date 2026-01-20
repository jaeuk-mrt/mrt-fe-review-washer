import { z } from "zod";

export const TaskStatusSchema = z.enum(["pending", "in_progress", "completed", "cancelled"]);

// 평가 라벨 (점수 기반)
// 100~80점: suggestion (단순제안)
// 79~60점: recommendation (적극제안)
// 59~40점: improvement (개선)
// 39~0점: required (필수)
export const TaskSeveritySchema = z.enum([
  "suggestion",     // 단순제안
  "recommendation", // 적극제안
  "improvement",    // 개선
  "required"        // 필수
]);

export const TaskIdSchema = z.object({
  id: z.string().min(1).describe("Task ID"),
});

export const TaskCreateInputSchema = z.object({
  title: z.string().min(1).describe("Task 제목"),
  description: z.string().min(1).describe("Task 설명"),
  severity: TaskSeveritySchema.default("improvement").describe("평가 라벨 (suggestion/recommendation/improvement/required)"),
  category: z.string().optional().describe("분류 (예: bug, security, perf, style)"),
  file: z.string().optional().describe("대상 파일 경로"),
  startLine: z.number().int().positive().optional().describe("시작 라인"),
  endLine: z.number().int().positive().optional().describe("끝 라인"),
  suggestion_patch_diff: z.string().optional().describe("제안 패치 (diff 형식)"),
});

export const TaskListInputSchema = z.object({
  status: TaskStatusSchema.optional().describe("필터링할 상태"),
  limit: z.number().int().min(1).max(100).optional().default(20).describe("최대 개수"),
});

export const TaskFromReviewInputSchema = z.object({
  review_id: z.string().min(1).describe("리뷰 ID"),
});

export const TaskCompleteInputSchema = z.object({
  id: z.string().min(1).describe("Task ID"),
  verification_note: z.string().optional().describe("검증 노트 (어떻게 수정했는지)"),
});

export const TaskUpdateStatusInputSchema = z.object({
  id: z.string().min(1).describe("Task ID"),
  status: TaskStatusSchema.describe("변경할 상태"),
});
