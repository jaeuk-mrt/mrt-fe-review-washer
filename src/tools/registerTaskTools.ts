import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  saveTask,
  listTasks,
  getTask,
  deleteTask,
  updateTaskStatus,
  createTasksFromReview,
  getTaskStats,
  taskToMarkdown,
  type Task,
} from "../services/taskStorage.js";
import { getReview } from "../services/storage.js";
import {
  TaskIdSchema,
  TaskCreateInputSchema,
  TaskListInputSchema,
  TaskFromReviewInputSchema,
  TaskCompleteInputSchema,
  TaskUpdateStatusInputSchema,
} from "./taskSchemas.js";

type EnvGetters = {
  getDataDir: () => string;
};

export function registerTaskTools(server: McpServer, env: EnvGetters) {
  // 1) task.from_review - 리뷰의 findings를 Task로 변환
  server.tool(
    "task.from_review",
    "리뷰 결과의 findings를 Task로 자동 변환합니다.",
    TaskFromReviewInputSchema.shape,
    async ({ review_id }) => {
      const review = await getReview(env.getDataDir(), review_id);
      
      if (!review.findings || review.findings.length === 0) {
        return {
          content: [{
            type: "text",
            text: `ℹ️ 리뷰 ${review_id}에 findings가 없습니다.`
          }]
        };
      }

      const tasks = await createTasksFromReview(env.getDataDir(), review_id, review);
      
      const lines: string[] = [];
      lines.push(`✅ ${tasks.length}개의 Task를 생성했습니다.`);
      lines.push("");
      for (const t of tasks) {
        const loc = t.file ? ` @ ${t.file}` : "";
        lines.push(`- [${t.severity}] ${t.id}: ${t.title}${loc}`);
      }
      
      return {
        content: [{
          type: "text",
          text: lines.join("\n")
        }]
      };
    }
  );

  // 2) task.create - 수동으로 Task 생성
  server.tool(
    "task.create",
    "새 Task를 수동으로 생성합니다.",
    TaskCreateInputSchema.shape,
    async (input) => {
      const task = await saveTask(env.getDataDir(), {
        status: "pending",
        title: input.title,
        description: input.description,
        severity: input.severity ?? "medium",
        category: input.category,
        file: input.file,
        startLine: input.startLine,
        endLine: input.endLine,
        suggestion_patch_diff: input.suggestion_patch_diff,
      });

      return {
        content: [{
          type: "text",
          text: `✅ Task 생성 완료: ${task.id}\n- 제목: ${task.title}\n- 심각도: ${task.severity}`
        }]
      };
    }
  );

  // 3) task.list - Task 목록 조회
  server.tool(
    "task.list",
    "Task 목록을 조회합니다. 상태별 필터링 가능.",
    TaskListInputSchema.shape,
    async ({ status, limit }) => {
      const tasks = await listTasks(env.getDataDir(), { status, limit: limit ?? 20 });
      const stats = await getTaskStats(env.getDataDir());

      if (tasks.length === 0) {
        return {
          content: [{
            type: "text",
            text: status 
              ? `ℹ️ 상태가 '${status}'인 Task가 없습니다.`
              : "ℹ️ 저장된 Task가 없습니다."
          }]
        };
      }

      const lines: string[] = [];
      lines.push(`# Task 목록 ${status ? `(${status})` : "(전체)"}`);
      lines.push("");
      lines.push(`📊 통계: 전체=${stats.total} | ⏳pending=${stats.pending} | 🔄in_progress=${stats.in_progress} | ✅completed=${stats.completed} | ❌cancelled=${stats.cancelled}`);
      lines.push("");
      
      for (const t of tasks) {
        const statusIcon = {
          pending: "⏳",
          in_progress: "🔄",
          completed: "✅",
          cancelled: "❌"
        }[t.status];
        const loc = t.file ? ` @ ${t.file}${t.startLine ? `:${t.startLine}` : ""}` : "";
        lines.push(`${statusIcon} [${t.severity}] **${t.id}**`);
        lines.push(`   ${t.title}${loc}`);
      }

      return {
        content: [{
          type: "text",
          text: lines.join("\n")
        }]
      };
    }
  );

  // 4) task.get - Task 상세 조회
  server.tool(
    "task.get",
    "특정 Task의 상세 정보를 조회합니다.",
    TaskIdSchema.shape,
    async ({ id }) => {
      const task = await getTask(env.getDataDir(), id);
      return {
        content: [{
          type: "text",
          text: taskToMarkdown(task)
        }]
      };
    }
  );

  // 5) task.execute - Task 실행 시작 (상태를 in_progress로 변경 + 가이드 제공)
  server.tool(
    "task.execute",
    "Task 실행을 시작합니다. 상태를 in_progress로 변경하고 실행 가이드를 제공합니다.",
    TaskIdSchema.shape,
    async ({ id }) => {
      const task = await getTask(env.getDataDir(), id);
      
      if (task.status === "completed") {
        return {
          content: [{
            type: "text",
            text: `ℹ️ 이 Task는 이미 완료되었습니다.\n\nID: ${task.id}\n완료일: ${task.completed_at}`
          }]
        };
      }
      
      if (task.status === "cancelled") {
        return {
          content: [{
            type: "text",
            text: `⚠️ 이 Task는 취소된 상태입니다. 실행하려면 먼저 상태를 변경하세요.`
          }]
        };
      }

      // 상태를 in_progress로 변경
      const updated = await updateTaskStatus(env.getDataDir(), id, "in_progress");

      const lines: string[] = [];
      lines.push(`🔄 Task 실행 시작: ${updated.id}`);
      lines.push("");
      lines.push("---");
      lines.push("");
      lines.push(`## ${updated.title}`);
      lines.push("");
      lines.push(`**심각도**: ${updated.severity}`);
      if (updated.category) lines.push(`**분류**: ${updated.category}`);
      if (updated.file) {
        const loc = updated.startLine 
          ? `${updated.file}:${updated.startLine}${updated.endLine ? `-${updated.endLine}` : ""}`
          : updated.file;
        lines.push(`**위치**: \`${loc}\``);
      }
      lines.push("");
      lines.push("### 해야 할 일");
      lines.push("");
      lines.push(updated.description);
      lines.push("");

      if (updated.suggestion_patch_diff) {
        lines.push("### 제안 패치");
        lines.push("");
        lines.push("아래 diff를 참고하여 수정하세요:");
        lines.push("");
        // diff 내용에서 코드 블록 마커 제거 및 정리
        const cleanDiff = updated.suggestion_patch_diff
          .replace(/^```diff\s*/i, "")  // 시작 부분의 ```diff 제거
          .replace(/```\s*$/g, "")      // 끝 부분의 ``` 제거
          .trim();
        lines.push("```diff");
        lines.push(cleanDiff);
        lines.push("```");
        lines.push("");
      }

      lines.push("---");
      lines.push("");
      lines.push("### 다음 단계");
      lines.push("");
      lines.push("1. 위 내용을 참고하여 코드를 수정하세요.");
      lines.push("2. 수정이 완료되면 `task.verify`를 호출하여 검증을 요청하세요.");
      lines.push("3. 검증이 완료되면 `task.complete`를 호출하여 Task를 완료하세요.");

      return {
        content: [{
          type: "text",
          text: lines.join("\n")
        }]
      };
    }
  );

  // 6) task.verify - Task 검증 요청 (LLM에게 검증하도록 프롬프트 제공)
  server.tool(
    "task.verify",
    "Task 완료를 검증합니다. 변경사항을 확인할 수 있도록 정보를 제공합니다.",
    TaskIdSchema.shape,
    async ({ id }) => {
      const task = await getTask(env.getDataDir(), id);

      if (task.status !== "in_progress") {
        return {
          content: [{
            type: "text",
            text: `⚠️ 검증은 'in_progress' 상태의 Task만 가능합니다.\n현재 상태: ${task.status}`
          }]
        };
      }

      const lines: string[] = [];
      lines.push(`🔍 Task 검증 요청: ${task.id}`);
      lines.push("");
      lines.push(`## ${task.title}`);
      lines.push("");
      lines.push("### 원래 요구사항");
      lines.push("");
      lines.push(task.description);
      lines.push("");

      if (task.file) {
        lines.push("### 대상 파일");
        lines.push("");
        const loc = task.startLine 
          ? `${task.file}:${task.startLine}${task.endLine ? `-${task.endLine}` : ""}`
          : task.file;
        lines.push(`\`${loc}\``);
        lines.push("");
      }

      if (task.suggestion_patch_diff) {
        lines.push("### 제안되었던 패치");
        lines.push("");
        // diff 내용에서 코드 블록 마커 제거 및 정리
        const cleanDiff = task.suggestion_patch_diff
          .replace(/^```diff\s*/i, "")  // 시작 부분의 ```diff 제거
          .replace(/```\s*$/g, "")      // 끝 부분의 ``` 제거
          .trim();
        lines.push("```diff");
        lines.push(cleanDiff);
        lines.push("```");
        lines.push("");
      }

      lines.push("---");
      lines.push("");
      lines.push("### 검증 체크리스트");
      lines.push("");
      lines.push("다음을 확인해주세요:");
      lines.push("");
      lines.push("1. [ ] 요구사항이 제대로 반영되었는가?");
      lines.push("2. [ ] 새로운 버그가 발생하지 않았는가?");
      lines.push("3. [ ] 코드 스타일/컨벤션을 따르는가?");
      lines.push("4. [ ] 테스트가 필요하다면 추가되었는가?");
      lines.push("");
      lines.push("검증이 완료되면 `task.complete`를 호출하세요.");
      lines.push("문제가 있다면 계속 수정하고 다시 `task.verify`를 호출하세요.");

      return {
        content: [{
          type: "text",
          text: lines.join("\n")
        }]
      };
    }
  );

  // 7) task.complete - Task 완료 처리
  server.tool(
    "task.complete",
    "Task를 완료 상태로 변경합니다.",
    TaskCompleteInputSchema.shape,
    async ({ id, verification_note }) => {
      const task = await getTask(env.getDataDir(), id);

      if (task.status === "completed") {
        return {
          content: [{
            type: "text",
            text: `ℹ️ 이 Task는 이미 완료되었습니다.\n\nID: ${task.id}\n완료일: ${task.completed_at}`
          }]
        };
      }

      const updated = await updateTaskStatus(env.getDataDir(), id, "completed", {
        completed_at: new Date().toISOString(),
        verification_note,
      });

      const stats = await getTaskStats(env.getDataDir());

      return {
        content: [{
          type: "text",
          text: [
            `✅ Task 완료: ${updated.id}`,
            "",
            `- 제목: ${updated.title}`,
            `- 완료 시각: ${updated.completed_at}`,
            verification_note ? `- 검증 노트: ${verification_note}` : "",
            "",
            `📊 남은 Task: pending=${stats.pending}, in_progress=${stats.in_progress}`
          ].filter(Boolean).join("\n")
        }]
      };
    }
  );

  // 8) task.delete - Task 삭제
  server.tool(
    "task.delete",
    "Task를 삭제합니다.",
    TaskIdSchema.shape,
    async ({ id }) => {
      const task = await getTask(env.getDataDir(), id);
      await deleteTask(env.getDataDir(), id);

      return {
        content: [{
          type: "text",
          text: `🗑️ Task 삭제 완료: ${task.id}\n- 제목: ${task.title}`
        }]
      };
    }
  );

  // 9) task.update_status - Task 상태 변경 (유틸리티)
  server.tool(
    "task.update_status",
    "Task 상태를 변경합니다.",
    TaskUpdateStatusInputSchema.shape,
    async ({ id, status }) => {
      const updated = await updateTaskStatus(env.getDataDir(), id, status);

      const statusIcon = {
        pending: "⏳",
        in_progress: "🔄",
        completed: "✅",
        cancelled: "❌"
      }[status];

      return {
        content: [{
          type: "text",
          text: `${statusIcon} Task 상태 변경: ${updated.id}\n- 새 상태: ${status}`
        }]
      };
    }
  );

  // 10) task.stats - Task 통계
  server.tool(
    "task.stats",
    "Task 전체 통계를 조회합니다.",
    {},
    async () => {
      const stats = await getTaskStats(env.getDataDir());

      return {
        content: [{
          type: "text",
          text: [
            "📊 Task 통계",
            "",
            `- 전체: ${stats.total}`,
            `- ⏳ pending: ${stats.pending}`,
            `- 🔄 in_progress: ${stats.in_progress}`,
            `- ✅ completed: ${stats.completed}`,
            `- ❌ cancelled: ${stats.cancelled}`,
          ].join("\n")
        }]
      };
    }
  );
}
