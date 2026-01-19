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
  "summary_ko": "변경 사항에 대한 간략한 요약(한국어)",
  "risk": "low | medium | high",
  "criteria_feedback": {
    "readability": { "good": ["잘된 점"], "improve": ["개선 필요한 점"] },
    "predictability": { "good": ["잘된 점"], "improve": ["개선 필요한 점"] },
    "cohesion": { "good": ["잘된 점"], "improve": ["개선 필요한 점"] },
    "coupling": { "good": ["잘된 점"], "improve": ["개선 필요한 점"] },
    "micro_perspective": { "good": ["잘된 점"], "improve": ["개선 필요한 점"] }
  },
  "findings": [
    {
      "severity": "low | medium | high",
      "category": "readability | predictability | cohesion | coupling | micro_perspective",
      "file": "파일 경로",
      "startLine": 1,
      "endLine": 10,
      "title_ko": "짧은 제목",
      "detail_ko": "설명 + 근거 + 왜 중요한지",
      "suggestion_patch_diff": "diff 텍스트(선택)"
    }
  ],
  "test_scenarios": ["권장 테스트 시나리오 1", "권장 테스트 시나리오 2"]
}`;

      const prompt = [
        "너는 웹 프론트엔드 시니어 리뷰어다. 아래의 '리뷰 규칙'과 '변경사항(diff)'만을 근거로 코드 리뷰를 수행해라.",
        "",
        "## 코드 리뷰 기준 (5가지 항목을 반드시 검토)",
        "",
        "### 1. 가독성(Readability)",
        "- 같이 실행되지 않는 코드가 하나의 함수/컴포넌트에 섞여 있지 않은가?",
        "- 구현 상세가 적절히 추상화되어 있는가?",
        "- 복잡한 조건에 의미 있는 이름이 붙어 있는가?",
        "- 매직 넘버에 이름이 붙어 있는가?",
        "- 삼항 연산자가 단순하게 사용되고 있는가?",
        "",
        "### 2. 예측 가능성(Predictability)",
        "- 같은 이름을 가진 함수/변수가 동일한 동작을 하는가?",
        "- 같은 종류의 함수는 반환 타입이 통일되어 있는가?",
        "- 숨겨진 로직 없이 동작이 명시적으로 드러나는가?",
        "",
        "### 3. 응집도(Cohesion)",
        "- 함께 수정되는 파일이 같은 디렉토리에 있는가?",
        "- 도메인별로 코드가 적절히 분리되어 있는가?",
        "- 매직 넘버가 상수로 정의되어 한 곳에서 관리되는가?",
        "",
        "### 4. 결합도(Coupling)",
        "- 하나의 함수/Hook이 하나의 책임만 가지고 있는가?",
        "- 페이지 전체의 상태를 한 곳에서 관리하지 않는가?",
        "- Props Drilling이 발생하지 않는가?",
        "",
        "### 5. 미시적 관점(Micro Perspective)",
        "- 조건부 렌더링 패턴이 일관되게 사용되는가? (ts-pattern, Show, SwitchCase)",
        "- 전역 상태 사용 기준이 적절한가?",
        "- TypeScript 타입 정의가 컨벤션에 맞는가?",
        "- 암묵적 타입 변환 사용이 명확한가?",
        "",
        "## 출력 요구사항(중요)",
        "1) 반드시 한국어로 작성",
        "2) 위 5가지 기준 각각에 대해 잘된 점(✅)과 개선 필요한 점(⚠️)을 구분하여 평가",
        "3) 결과는 **아래 JSON 스키마 형태로만** 출력 (설명 텍스트 추가 금지)",
        "4) findings는 severity가 높은 것부터 정렬",
        "5) findings의 category는 반드시 5가지 기준 중 하나로 지정",
        "6) 가능하면 suggestion_patch_diff에 실제 적용 가능한 diff 제안",
        "7) 권장 테스트 시나리오를 test_scenarios에 포함",
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
