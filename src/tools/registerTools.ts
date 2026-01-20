import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getGitDiff } from "../services/gitDiff.js";
import { readRules, getDefaultRulesPath } from "../services/rules.js";
import { saveReview, listReviews, getReview, toMarkdown, saveMarkdownFile } from "../services/storage.js";
import { loadPromptFromTemplate, generatePrompt } from "../services/promptTemplate.js";
import { ReviewIdSchema, ReviewSaveInputSchema } from "./schemas.js";

type EnvGetters = {
  getProjectRoot: () => string;
  getDataDir: () => string;
  getCustomRulesPath: () => string | undefined;
};

export function registerTools(server: McpServer, env: EnvGetters) {
  // 1) collect_diff
  server.tool(
    "review.collect_diff",
    "git diff(base...head)를 수집해서 반환합니다. base가 'main'이면 자동으로 'origin/main'으로 변환됩니다.",
    {
      repoPath: z.string().optional().describe("로컬 git 저장소 경로 (미지정시 PROJECT_ROOT 사용)"),
      base: z.string().optional().default("origin/main").describe("기준 브랜치 (기본값: origin/main, 'main' 입력 시 자동으로 origin/main으로 변환)"),
      head: z.string().optional().default("HEAD"),
      contextLines: z.number().int().min(0).max(20).optional()
    },
    async ({ repoPath: inputRepoPath, base, head, contextLines }) => {
      const targetRepoPath = inputRepoPath || env.getProjectRoot();
      const { diff } = await getGitDiff({ repoPath: targetRepoPath, base, head, contextLines });
      const trimmed = diff.trimEnd();
      const sizeInfo = `chars=${trimmed.length}`;
      return {
        content: [{
          type: "text",
          text: trimmed.length
            ? `# Diff (${base}...${head})\n(${sizeInfo})\n\n${trimmed}`
            : `# Diff (${base}...${head})\n(변경 없음)`
        }]
      };
    }
  );

  // 3) make_prompt
  server.tool(
    "review.make_prompt",
    "규칙 + diff를 합쳐, 모델에게 그대로 넘길 '리뷰 프롬프트 패키지(한국어)'를 만들어줍니다. base가 'main'이면 자동으로 'origin/main'으로 변환됩니다.",
    {
      repoPath: z.string().optional().describe("로컬 git 저장소 경로 (미지정시 PROJECT_ROOT 사용)"),
      base: z.string().optional().default("origin/main").describe("기준 브랜치 (기본값: origin/main, 'main' 입력 시 자동으로 origin/main으로 변환)"),
      head: z.string().optional().default("HEAD"),
      contextLines: z.number().int().min(0).max(20).optional(),
      maxDiffChars: z.number().int().min(1000).max(200000).optional().default(120000)
    },
    async ({ repoPath: inputRepoPath, base, head, contextLines, maxDiffChars }) => {
      const targetRepoPath = inputRepoPath || env.getProjectRoot();
      // 기본 규칙(내장) + 커스텀 규칙(선택적) 병합
      const rules = await readRules(env.getCustomRulesPath());
      const { diff } = await getGitDiff({ repoPath: targetRepoPath, base, head, contextLines });

      const safeDiff = diff.length > maxDiffChars ? diff.slice(0, maxDiffChars) + "\n\n...(diff truncated)" : diff;

      const schemaHint = `{
  "target": { "base": "${base}", "head": "${head}" },
  "summary_ko": "변경 사항에 대한 간략한 요약(한국어)",
  "risk": "low | medium | high",
  "criteria_feedback": {
    "readability": { "label": "suggestion | recommendation | improvement | required | needs_confirmation", "improve": ["개선 필요한 점"] },
    "predictability": { "label": "suggestion | recommendation | improvement | required | needs_confirmation", "improve": ["개선 필요한 점"] },
    "cohesion": { "label": "suggestion | recommendation | improvement | required | needs_confirmation", "improve": ["개선 필요한 점"] },
    "coupling": { "label": "suggestion | recommendation | improvement | required | needs_confirmation", "improve": ["개선 필요한 점"] },
    "micro_perspective": { "label": "suggestion | recommendation | improvement | required | needs_confirmation", "improve": ["개선 필요한 점"] },
    "intent_clarity": { "label": "suggestion | recommendation | improvement | required | needs_confirmation", "improve": ["개선 필요한 점"] }
  },
  "findings": [
    {
      "severity": "suggestion | recommendation | improvement | required | needs_confirmation",
      "category": "readability | predictability | cohesion | coupling | micro_perspective | intent_clarity",
      "file": "파일 경로",
      "startLine": 1,
      "endLine": 10,
      "title_ko": "짧은 제목",
      "detail_ko": "설명 + 근거 + 왜 중요한지 (needs_confirmation인 경우: 왜 확인이 필요한지, 어떤 점이 의문인지)",
      "suggestion_patch_diff": "diff 텍스트(선택, needs_confirmation인 경우 제공하지 않음)"
    }
  ],
}`;

      // 템플릿 파일 로드 및 변수 치환
      const template = await loadPromptFromTemplate("review/index.md");
      const prompt = generatePrompt(template, {
        schemaHint,
        rules: rules?.trim() || "(rules file is empty)",
        diff: safeDiff.trimEnd()
      });

      return {
        content: [{
          type: "text",
          text: prompt
        }]
      };
    }
  );

  // 4) save
  server.tool(
    "review.save",
    "리뷰 결과(JSON)를 저장하고 review_id를 반환합니다.",
    ReviewSaveInputSchema.shape,
    async (input) => {
      const saved = await saveReview(env.getDataDir(), input);
      return {
        content: [{
          type: "text",
          text: `✅ 저장 완료: ${saved.id}\n- 대상: ${saved.target.base}...${saved.target.head}\n- findings: ${saved.findings.length}`
        }]
      };
    }
  );

  // 5) list
  server.tool(
    "review.list",
    "저장된 리뷰 목록을 조회합니다.",
    {
      limit: z.number().int().min(1).max(100).optional().default(20)
    },
    async ({ limit }) => {
      const list = await listReviews(env.getDataDir(), limit);
      if (!list.length) {
        return { content: [{ type: "text", text: "저장된 리뷰가 없습니다." }] };
      }
      const lines: string[] = [];
      lines.push(`총 ${list.length}개 (최신순)`);
      lines.push("");
      for (const r of list) {
        lines.push(`- ${r.id} | ${r.created_at} | ${r.target.base}...${r.target.head} | findings=${r.findings.length}${r.risk ? ` | risk=${r.risk}` : ""}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // 6) get
  server.tool(
    "review.get",
    "특정 review_id의 상세 JSON을 조회합니다.",
    ReviewIdSchema.shape,
    async ({ id }) => {
      const r = await getReview(env.getDataDir(), id);
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    }
  );

  // 7) export_markdown
  server.tool(
    "review.export_markdown",
    "특정 review_id를 마크다운으로 변환하고 파일로 저장합니다.",
    ReviewIdSchema.shape,
    async ({ id }) => {
      const r = await getReview(env.getDataDir(), id);
      const markdown = toMarkdown(r);
      const filePath = await saveMarkdownFile(env.getDataDir(), id, markdown);
      return { 
        content: [{ 
          type: "text", 
          text: `✅ 마크다운 파일 저장 완료: ${filePath}\n\n${markdown}` 
        }] 
      };
    }
  );

  // 8) debug.env (helper)
  server.tool(
    "review.debug.env",
    "서버가 인식한 경로/env를 보여줍니다.",
    {},
    async () => {
      const customRulesPath = env.getCustomRulesPath();
      return {
        content: [{
          type: "text",
          text: [
            `projectRoot:     ${env.getProjectRoot()}`,
            `dataDir:         ${env.getDataDir()}`,
            `defaultRulesPath: ${getDefaultRulesPath()}`,
            `customRulesPath: ${customRulesPath || "(없음 - 기본 규칙만 사용)"}`
          ].join("\n")
        }]
      };
    }
  );
}
