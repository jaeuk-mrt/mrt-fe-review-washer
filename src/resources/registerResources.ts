import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readRules, getDefaultRulesPath } from "../services/rules.js";
import { getLatestReview, listReviews } from "../services/storage.js";
import { listTasks, getTaskStats } from "../services/taskStorage.js";

type EnvGetters = {
  getDataDir: () => string;
  getCustomRulesPath: () => string | undefined;
};

export function registerResources(server: McpServer, env: EnvGetters) {
  // rules://active - 기본 규칙 + 커스텀 규칙 (병합된 최종 규칙)
  server.resource(
    "rules-active",
    "rules://active",
    async (uri) => {
      const rules = await readRules(env.getCustomRulesPath());
      return {
        contents: [{
          uri: uri.href,
          text: rules?.trim() ? rules : "(rules file is empty)"
        }]
      };
    }
  );

  // reviews://index
  server.resource(
    "reviews-index",
    "reviews://index",
    async (uri) => {
      const list = await listReviews(env.getDataDir(), 50);
      const lines: string[] = [];
      lines.push(`# 저장된 리뷰 인덱스 (최신순, 최대 50)`);
      lines.push("");
      for (const r of list) {
        lines.push(`- ${r.id} | ${r.created_at} | ${r.target.base}...${r.target.head} | findings=${r.findings.length}${r.risk ? ` | risk=${r.risk}` : ""}`);
      }
      return {
        contents: [{
          uri: uri.href,
          text: lines.join("\n")
        }]
      };
    }
  );

  // reviews://latest
  server.resource(
    "reviews-latest",
    "reviews://latest",
    async (uri) => {
      const r = await getLatestReview(env.getDataDir());
      return {
        contents: [{
          uri: uri.href,
          text: r ? JSON.stringify(r, null, 2) : "(no reviews yet)"
        }]
      };
    }
  );

  // tasks://index - Task 전체 목록
  server.resource(
    "tasks-index",
    "tasks://index",
    async (uri) => {
      const tasks = await listTasks(env.getDataDir(), { limit: 50 });
      const stats = await getTaskStats(env.getDataDir());
      
      const lines: string[] = [];
      lines.push(`# Task 인덱스 (최신순, 최대 50)`);
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
        const loc = t.file ? ` @ ${t.file}` : "";
        lines.push(`${statusIcon} [${t.severity}] ${t.id}: ${t.title}${loc}`);
      }
      
      return {
        contents: [{
          uri: uri.href,
          text: lines.join("\n")
        }]
      };
    }
  );

  // tasks://pending - Pending Task만
  server.resource(
    "tasks-pending",
    "tasks://pending",
    async (uri) => {
      const tasks = await listTasks(env.getDataDir(), { status: "pending", limit: 50 });
      
      const lines: string[] = [];
      lines.push(`# ⏳ Pending Tasks (${tasks.length}개)`);
      lines.push("");
      
      if (tasks.length === 0) {
        lines.push("(대기 중인 Task가 없습니다)");
      } else {
        for (const t of tasks) {
          const loc = t.file ? ` @ ${t.file}${t.startLine ? `:${t.startLine}` : ""}` : "";
          lines.push(`- [${t.severity}] **${t.id}**`);
          lines.push(`  ${t.title}${loc}`);
        }
      }
      
      return {
        contents: [{
          uri: uri.href,
          text: lines.join("\n")
        }]
      };
    }
  );

  // tasks://in_progress - 진행 중인 Task
  server.resource(
    "tasks-in-progress",
    "tasks://in_progress",
    async (uri) => {
      const tasks = await listTasks(env.getDataDir(), { status: "in_progress", limit: 50 });
      
      const lines: string[] = [];
      lines.push(`# 🔄 In-Progress Tasks (${tasks.length}개)`);
      lines.push("");
      
      if (tasks.length === 0) {
        lines.push("(진행 중인 Task가 없습니다)");
      } else {
        for (const t of tasks) {
          const loc = t.file ? ` @ ${t.file}${t.startLine ? `:${t.startLine}` : ""}` : "";
          lines.push(`- [${t.severity}] **${t.id}**`);
          lines.push(`  ${t.title}${loc}`);
        }
      }
      
      return {
        contents: [{
          uri: uri.href,
          text: lines.join("\n")
        }]
      };
    }
  );
}
