import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readRules } from "../services/rules.js";
import { getTask, listTasks, taskToMarkdown } from "../services/taskStorage.js";

type EnvGetters = {
  getCustomRulesPath: () => string | undefined;
  getDataDir: () => string;
};

/**
 * 프롬프트는 '템플릿' 역할.
 * 실제 diff는 tool(review.collect_diff)로 가져오거나, 아래 prompt에 diff를 인자로 넘겨도 됩니다.
 */
export function registerPrompts(server: McpServer, env: EnvGetters) {
  server.prompt(
    "review-ko",
    {
      base: z.string().optional().default("main"),
      head: z.string().optional().default("HEAD"),
      diff: z.string().optional().default(""),
      extra_focus: z.string().optional().default("")
    },
    async ({ base, head, diff, extra_focus }) => {
      // 기본 규칙(내장) + 커스텀 규칙(선택적) 병합
      const rules = await readRules(env.getCustomRulesPath());

      const text = [
        "너는 웹 프론트엔드 시니어 리뷰어다. 아래 규칙과 diff를 근거로 한국어 코드 리뷰를 작성해라.",
        "",
        "## 코드 리뷰 기준 (5가지 항목을 반드시 검토)",
        "",
        "### 1. 가독성(Readability)",
        "- 맥락 줄이기, 이름 붙이기, 위에서 아래로 읽히는지 검토",
        "",
        "### 2. 예측 가능성(Predictability)",
        "- 동일 이름의 일관된 동작, 반환 타입 통일, 명시적 동작 검토",
        "",
        "### 3. 응집도(Cohesion)",
        "- 함께 수정되는 코드가 같은 위치에 있는지, 도메인별 분리 검토",
        "",
        "### 4. 결합도(Coupling)",
        "- 단일 책임, 상태 분산, Props Drilling 여부 검토",
        "",
        "### 5. 미시적 관점(Micro Perspective)",
        "- 조건부 렌더링 패턴, 전역 상태 사용, 타입 정의, 암묵적 타입 변환 검토",
        "",
        "## 출력 형식",
        "각 기준별로 잘된 점(✅)과 개선 필요한 점(⚠️)을 구분하여 평가하고,",
        "리스크 상위 항목과 파일별 코멘트를 제공해라.",
        "",
        "추가 포커스(있으면 반영):",
        extra_focus?.trim() ? `- ${extra_focus.trim()}` : "- (없음)",
        "",
        "## 리뷰 규칙:",
        rules?.trim() ? rules.trim() : "(rules file is empty)",
        "",
        `## 변경사항 diff (${base}...${head}):`,
        diff?.trim() ? diff.trim() : "(diff is empty - 필요하면 review.collect_diff를 호출해 채워라)"
      ].join("\n");

      return {
        messages: [{
          role: "user",
          content: { type: "text", text }
        }]
      };
    }
  );

  // task-execute 프롬프트: 특정 Task 실행 가이드
  server.prompt(
    "task-execute",
    {
      task_id: z.string().optional().default(""),
    },
    async ({ task_id }) => {
      let taskContent = "";
      
      if (task_id?.trim()) {
        try {
          const task = await getTask(env.getDataDir(), task_id);
          taskContent = taskToMarkdown(task);
        } catch {
          taskContent = `(Task ID '${task_id}'를 찾을 수 없습니다)`;
        }
      } else {
        // task_id가 없으면 pending 중 첫 번째 task
        const pendingTasks = await listTasks(env.getDataDir(), { status: "pending", limit: 1 });
        if (pendingTasks.length > 0) {
          taskContent = taskToMarkdown(pendingTasks[0]);
        } else {
          // in_progress 중 첫 번째
          const inProgressTasks = await listTasks(env.getDataDir(), { status: "in_progress", limit: 1 });
          if (inProgressTasks.length > 0) {
            taskContent = taskToMarkdown(inProgressTasks[0]);
          } else {
            taskContent = "(실행할 Task가 없습니다. task.list로 확인하거나 task.from_review로 생성하세요)";
          }
        }
      }

      const text = [
        "너는 시니어 개발자다. 아래 Task를 수행하고 코드를 수정해라.",
        "",
        "## 실행해야 할 Task",
        "",
        taskContent,
        "",
        "## 수행 가이드",
        "",
        "1. Task 내용을 이해하고 대상 파일을 확인해라.",
        "2. 제안 패치가 있다면 참고하되, 맹목적으로 적용하지 마라.",
        "3. 수정 후에는 task.verify를 호출하여 검증을 요청해라.",
        "4. 검증이 완료되면 task.complete를 호출해라.",
      ].join("\n");

      return {
        messages: [{
          role: "user",
          content: { type: "text", text }
        }]
      };
    }
  );

  // task-plan 프롬프트: Task 계획 수립
  server.prompt(
    "task-plan",
    {
      goal: z.string().optional().default(""),
    },
    async ({ goal }) => {
      const pendingTasks = await listTasks(env.getDataDir(), { status: "pending", limit: 20 });
      const inProgressTasks = await listTasks(env.getDataDir(), { status: "in_progress", limit: 5 });

      const lines: string[] = [];
      lines.push("# 현재 Task 상태");
      lines.push("");
      
      if (inProgressTasks.length > 0) {
        lines.push("## 🔄 진행 중");
        for (const t of inProgressTasks) {
          lines.push(`- [${t.severity}] ${t.id}: ${t.title}`);
        }
        lines.push("");
      }

      if (pendingTasks.length > 0) {
        lines.push("## ⏳ 대기 중");
        for (const t of pendingTasks) {
          lines.push(`- [${t.severity}] ${t.id}: ${t.title}`);
        }
        lines.push("");
      }

      if (pendingTasks.length === 0 && inProgressTasks.length === 0) {
        lines.push("(Task가 없습니다)");
        lines.push("");
      }

      const text = [
        "너는 프로젝트 매니저다. 아래 Task 현황을 보고 작업 계획을 수립해라.",
        "",
        lines.join("\n"),
        goal?.trim() ? `## 목표\n\n${goal.trim()}` : "",
        "",
        "## 요청 사항",
        "",
        "1. 어떤 Task부터 시작해야 하는지 우선순위를 정해라.",
        "2. 의존성이 있다면 순서를 고려해라.",
        "3. 예상 소요 시간을 대략 추정해라.",
      ].filter(Boolean).join("\n");

      return {
        messages: [{
          role: "user",
          content: { type: "text", text }
        }]
      };
    }
  );
}
