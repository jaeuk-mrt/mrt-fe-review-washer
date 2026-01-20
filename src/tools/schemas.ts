import { z } from "zod";

// 6가지 코드 리뷰 기준 카테고리
export const CategoryEnum = z.enum([
  "readability",      // 가독성
  "predictability",   // 예측 가능성
  "cohesion",         // 응집도
  "coupling",         // 결합도
  "micro_perspective", // 미시적 관점
  "intent_clarity"    // 코드 작성 의도 간결성
]);

// 평가 라벨 (점수 기반)
// 100~80점: suggestion (단순제안)
// 79~60점: recommendation (적극제안)
// 59~40점: improvement (개선)
// 39~0점: required (필수)
// 별도: needs_confirmation (확인요청) - 리뷰어가 확신이 없는 경우
export const SeverityEnum = z.enum([
  "suggestion",          // 단순제안 (100~80점)
  "recommendation",      // 적극제안 (79~60점)
  "improvement",         // 개선 (59~40점)
  "required",            // 필수 (39~0점)
  "needs_confirmation"   // 확인요청 (확신이 없는 경우)
]);

export const FindingSchema = z.object({
  severity: SeverityEnum,
  category: CategoryEnum.optional(), // 6가지 기준 중 하나
  file: z.string().optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  title_ko: z.string().min(1),
  detail_ko: z.string().min(1),
  suggestion_patch_diff: z.string().optional()
});

// 기준별 피드백 스키마
export const CriteriaFeedbackItemSchema = z.object({
  label: SeverityEnum.optional(),               // 해당 기준의 평가 라벨
  improve: z.array(z.string()).default([])      // 개선 필요한 점
});

export const CriteriaFeedbackSchema = z.object({
  readability: CriteriaFeedbackItemSchema.optional(),
  predictability: CriteriaFeedbackItemSchema.optional(),
  cohesion: CriteriaFeedbackItemSchema.optional(),
  coupling: CriteriaFeedbackItemSchema.optional(),
  micro_perspective: CriteriaFeedbackItemSchema.optional(),
  intent_clarity: CriteriaFeedbackItemSchema.optional()
}).optional();

export const ReviewSaveInputSchema = z.object({
  target: z.object({
    base: z.string().min(1),
    head: z.string().min(1)
  }),
  summary_ko: z.string().min(1),
  risk: z.enum(["low", "medium", "high"]).optional(),
  criteria_feedback: CriteriaFeedbackSchema,  // 5가지 기준별 피드백
  findings: z.array(FindingSchema).default([])
});

export const ReviewIdSchema = z.object({
  id: z.string().min(1)
});
