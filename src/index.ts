#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { readEnv } from "./services/env.js";
import { registerTools } from "./tools/registerTools.js";
import { registerTaskTools } from "./tools/registerTaskTools.js";
import { registerResources } from "./resources/registerResources.js";
import { registerPrompts } from "./prompts/registerPrompts.js";

async function main() {
  // 환경 설정 읽기
  // - PROJECT_ROOT 환경변수가 있으면 사용
  // - 없으면 process.cwd() 사용 (repoPath 파라미터로 오버라이드 가능)
  const env = readEnv(process.cwd());

  const server = new McpServer({
    name: "mrt-fe-review-washer",
    version: "0.1.0",
  });

  // 도구, 리소스, 프롬프트 등록
  registerResources(server, { 
    getDataDir: () => env.dataDir, 
    getCustomRulesPath: () => env.customRulesPath 
  });
  registerPrompts(server, { 
    getCustomRulesPath: () => env.customRulesPath, 
    getDataDir: () => env.dataDir 
  });
  registerTools(server, {
    getProjectRoot: () => env.projectRoot,
    getDataDir: () => env.dataDir,
    getCustomRulesPath: () => env.customRulesPath,
  });
  registerTaskTools(server, { getDataDir: () => env.dataDir });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
