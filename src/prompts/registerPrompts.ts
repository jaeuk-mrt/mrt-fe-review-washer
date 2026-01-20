import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readRules } from "../services/rules.js";
import { getTask, listTasks, taskToMarkdown } from "../services/taskStorage.js";
import {
  loadPromptFromTemplate,
  generatePrompt,
  loadPrompt,
} from "../services/promptTemplate.js";

type EnvGetters = {
  getCustomRulesPath: () => string | undefined;
  getDataDir: () => string;
};

interface ReviewPromptParams {
  base: string;
  head: string;
  diff: string;
  extraFocus: string;
  rules: string;
}

interface TaskExecutePromptParams {
  taskContent: string;
}

interface TaskPlanPromptParams {
  taskStatus: string;
  goal: string;
}

export async function getReviewPrompt(
  params: ReviewPromptParams
): Promise<string> {
  const indexTemplate = await loadPromptFromTemplate("review/index.md");

  const prompt = generatePrompt(indexTemplate, {
    base: params.base,
    head: params.head,
    diff: params.diff?.trim()
      ? params.diff.trim()
      : "(diff is empty - 필요하면 review.collect_diff를 호출해 채워라)",
    extraFocus: params.extraFocus?.trim()
      ? `- ${params.extraFocus.trim()}`
      : "- (없음)",
    rules: params.rules?.trim() ? params.rules.trim() : "(rules file is empty)",
  });

  return loadPrompt(prompt, "REVIEW");
}

/**
 * Task 실행 가이드 프롬프트 생성
 */
export async function getTaskExecutePrompt(
  params: TaskExecutePromptParams
): Promise<string> {
  const indexTemplate = await loadPromptFromTemplate("task-execute/index.md");

  const prompt = generatePrompt(indexTemplate, {
    taskContent: params.taskContent,
  });

  return loadPrompt(prompt, "TASK_EXECUTE");
}

/**
 * Task 계획 수립 프롬프트 생성
 */
export async function getTaskPlanPrompt(
  params: TaskPlanPromptParams
): Promise<string> {
  const indexTemplate = await loadPromptFromTemplate("task-plan/index.md");

  const goalSection = params.goal?.trim()
    ? `## 목표\n\n${params.goal.trim()}`
    : "";

  const prompt = generatePrompt(indexTemplate, {
    taskStatus: params.taskStatus,
    goalSection: goalSection,
  });

  return loadPrompt(prompt, "TASK_PLAN");
}

/**
 * Task 상태 문자열 생성
 */
function buildTaskStatusString(
  inProgressTasks: Awaited<ReturnType<typeof listTasks>>,
  pendingTasks: Awaited<ReturnType<typeof listTasks>>
): string {
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

  return lines.join("\n");
}

/**
 * Task 컨텐츠 조회 (ID로 조회하거나 pending/in_progress 중 첫 번째)
 */
async function resolveTaskContent(
  dataDir: string,
  taskId?: string
): Promise<string> {
  if (taskId?.trim()) {
    try {
      const task = await getTask(dataDir, taskId);
      return taskToMarkdown(task);
    } catch {
      return `(Task ID '${taskId}'를 찾을 수 없습니다)`;
    }
  }

  // task_id가 없으면 pending 중 첫 번째 task
  const pendingTasks = await listTasks(dataDir, { status: "pending", limit: 1 });
  if (pendingTasks.length > 0) {
    return taskToMarkdown(pendingTasks[0]);
  }

  // in_progress 중 첫 번째
  const inProgressTasks = await listTasks(dataDir, {
    status: "in_progress",
    limit: 1,
  });
  if (inProgressTasks.length > 0) {
    return taskToMarkdown(inProgressTasks[0]);
  }

  return "(실행할 Task가 없습니다. task.list로 확인하거나 task.from_review로 생성하세요)";
}

/**
 * 프롬프트는 '템플릿' 역할.
 * 실제 diff는 tool(review.collect_diff)로 가져오거나, 아래 prompt에 diff를 인자로 넘겨도 됩니다.
 */
export function registerPrompts(server: McpServer, env: EnvGetters) {
  server.prompt(
    "review",
    {
      base: z.string().optional().default("main"),
      head: z.string().optional().default("HEAD"),
      diff: z.string().optional().default(""),
      extra_focus: z.string().optional().default(""),
    },
    async ({ base, head, diff, extra_focus }) => {
      const rules = await readRules(env.getCustomRulesPath());

      const text = await getReviewPrompt({
        base,
        head,
        diff,
        extraFocus: extra_focus,
        rules,
      });

      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text },
          },
        ],
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
      const taskContent = await resolveTaskContent(env.getDataDir(), task_id);

      const text = await getTaskExecutePrompt({
        taskContent,
      });

      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text },
          },
        ],
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
      const pendingTasks = await listTasks(env.getDataDir(), {
        status: "pending",
        limit: 20,
      });
      const inProgressTasks = await listTasks(env.getDataDir(), {
        status: "in_progress",
        limit: 5,
      });

      const taskStatus = buildTaskStatusString(inProgressTasks, pendingTasks);

      const text = await getTaskPlanPrompt({
        taskStatus,
        goal,
      });

      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text },
          },
        ],
      };
    }
  );
}
