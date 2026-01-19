import { z } from "zod";

// 5가지 코드 리뷰 기준 카테고리
export const CategoryEnum = z.enum([
  "readability",      // 가독성
  "predictability",   // 예측 가능성
  "cohesion",         // 응집도
  "coupling",         // 결합도
  "micro_perspective" // 미시적 관점
]);

export const FindingSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  category: CategoryEnum.optional(), // 5가지 기준 중 하나
  file: z.string().optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  title_ko: z.string().min(1),
  detail_ko: z.string().min(1),
  suggestion_patch_diff: z.string().optional()
});

// 기준별 피드백 스키마
export const CriteriaFeedbackItemSchema = z.object({
  good: z.array(z.string()).default([]),    // 잘된 점
  improve: z.array(z.string()).default([])  // 개선 필요한 점
});

export const CriteriaFeedbackSchema = z.object({
  readability: CriteriaFeedbackItemSchema.optional(),
  predictability: CriteriaFeedbackItemSchema.optional(),
  cohesion: CriteriaFeedbackItemSchema.optional(),
  coupling: CriteriaFeedbackItemSchema.optional(),
  micro_perspective: CriteriaFeedbackItemSchema.optional()
}).optional();

export const ReviewSaveInputSchema = z.object({
  target: z.object({
    base: z.string().min(1),
    head: z.string().min(1)
  }),
  summary_ko: z.string().min(1),
  risk: z.enum(["low", "medium", "high"]).optional(),
  criteria_feedback: CriteriaFeedbackSchema,  // 5가지 기준별 피드백
  findings: z.array(FindingSchema).default([]),
  test_scenarios: z.array(z.string()).default([])  // 권장 테스트 시나리오
});

export const ReviewIdSchema = z.object({
  id: z.string().min(1)
});
