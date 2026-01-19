#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createEnvGetters } from "./services/env.js";
import { registerTools } from "./tools/registerTools.js";
import { registerTaskTools } from "./tools/registerTaskTools.js";
import { registerResources } from "./resources/registerResources.js";
import { registerPrompts } from "./prompts/registerPrompts.js";

async function main() {
  const server = new McpServer({
    name: "mrt-fe-review-washer",
    version: "0.1.0",
  });

  // 환경 설정 getter 생성
  // Fallback 순서:
  // 1. MCP roots (클라이언트가 전달한 워크스페이스 루트)
  // 2. PROJECT_ROOT 환경변수
  // 3. process.cwd()
  const envGetters = createEnvGetters(server, process.cwd());

  // 도구, 리소스, 프롬프트 등록
  registerResources(server, { 
    getDataDir: envGetters.getDataDir, 
    getCustomRulesPath: envGetters.getCustomRulesPath 
  });
  registerPrompts(server, { 
    getCustomRulesPath: envGetters.getCustomRulesPath, 
    getDataDir: envGetters.getDataDir 
  });
  registerTools(server, {
    getProjectRoot: envGetters.getProjectRoot,
    getDataDir: envGetters.getDataDir,
    getCustomRulesPath: envGetters.getCustomRulesPath,
  });
  registerTaskTools(server, { getDataDir: envGetters.getDataDir });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
