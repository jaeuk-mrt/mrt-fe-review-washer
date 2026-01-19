import { z } from "zod";

export const FindingSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  category: z.string().optional(),
  file: z.string().optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  title_ko: z.string().min(1),
  detail_ko: z.string().min(1),
  suggestion_patch_diff: z.string().optional()
});

export const ReviewSaveInputSchema = z.object({
  target: z.object({
    base: z.string().min(1),
    head: z.string().min(1)
  }),
  summary_ko: z.string().min(1),
  risk: z.enum(["low", "medium", "high"]).optional(),
  findings: z.array(FindingSchema).default([])
});

export const ReviewIdSchema = z.object({
  id: z.string().min(1)
});
