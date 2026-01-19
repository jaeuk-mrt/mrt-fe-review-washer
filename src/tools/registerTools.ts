import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getGitDiff } from "../services/gitDiff.js";
import { readRules, getDefaultRulesPath } from "../services/rules.js";
import { saveReview, listReviews, getReview, toMarkdown } from "../services/storage.js";
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
    "git diff(base...head)를 수집해서 반환합니다.",
    {
      repoPath: z.string().optional().describe("로컬 git 저장소 경로 (미지정시 PROJECT_ROOT 사용)"),
      base: z.string().optional().default("main"),
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
    "규칙 + diff를 합쳐, 모델에게 그대로 넘길 '리뷰 프롬프트 패키지(한국어)'를 만들어줍니다.",
    {
      repoPath: z.string().optional().describe("로컬 git 저장소 경로 (미지정시 PROJECT_ROOT 사용)"),
      base: z.string().optional().default("main"),
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
  "summary_ko": "요약(한국어)",
  "risk": "low | medium | high (선택)",
  "findings": [
    {
      "severity": "low | medium | high",
      "category": "예: logic | bug | security | perf | style (선택)",
      "file": "경로(선택)",
      "startLine": 1,
      "endLine": 10,
      "title_ko": "짧은 제목",
      "detail_ko": "설명 + 근거 + 왜 중요한지",
      "suggestion_patch_diff": "diff 텍스트(선택)"
    }
  ]
}`;

      const prompt = [
        "너는 시니어 리뷰어다. 아래의 '리뷰 규칙'과 '변경사항(diff)'만을 근거로 코드 리뷰를 수행해라.",
        "",
        "## 출력 요구사항(중요)",
        "1) 반드시 한국어로 작성",
        "2) 결과는 **아래 JSON 스키마 형태로만** 출력 (설명 텍스트 추가 금지)",
        "3) findings는 중요한 것부터 정렬",
        "4) 가능하면 suggestion_patch_diff에 실제 적용 가능한 diff 제안",
        "",
        "## JSON 스키마",
        "```json",
        schemaHint,
        "```",
        "",
        "## 리뷰 규칙(프로젝트/팀 규칙)",
        rules?.trim() ? rules.trim() : "(rules file is empty)",
        "",
        "## 변경사항(diff)",
        "```diff",
        safeDiff.trimEnd(),
        "```"
      ].join("\n");

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
    "특정 review_id를 마크다운으로 변환합니다.",
    ReviewIdSchema.shape,
    async ({ id }) => {
      const r = await getReview(env.getDataDir(), id);
      return { content: [{ type: "text", text: toMarkdown(r) }] };
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
