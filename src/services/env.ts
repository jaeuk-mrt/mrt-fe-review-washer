import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type Env = {
  /** 프로젝트 루트 경로 (git 저장소) */
  projectRoot: string;
  /** 리뷰 데이터 저장 경로 */
  dataDir: string;
  /** 커스텀 규칙 파일 경로 (선택적, 기본 규칙에 추가/오버라이드) */
  customRulesPath?: string;
};

export type EnvGetters = {
  getProjectRoot: () => string;
  getDataDir: () => string;
  getCustomRulesPath: () => string | undefined;
};

// 캐시된 roots (MCP 클라이언트로부터 가져온 값)
let cachedRootsPath: string | null = null;

/**
 * MCP 클라이언트로부터 roots 목록을 가져와서 첫 번째 루트를 반환
 * Cursor 등 IDE가 열린 워크스페이스의 루트 경로를 전달함
 */
async function fetchRootsFromClient(server: McpServer): Promise<string | null> {
  try {
    // 서버의 roots 목록 요청 (MCP 프로토콜)
    // server.server는 내부 Server 인스턴스로 listRoots 메서드를 가짐
    const rootsResult = await (server.server as { listRoots: () => Promise<{ roots: { uri: string; name?: string }[] }> }).listRoots();
    
    if (rootsResult.roots && rootsResult.roots.length > 0) {
      // file:// URI를 경로로 변환
      const firstRoot = rootsResult.roots[0].uri;
      if (firstRoot.startsWith("file://")) {
        return decodeURIComponent(firstRoot.replace("file://", ""));
      }
      return firstRoot;
    }
  } catch {
    // roots 지원하지 않는 클라이언트 또는 연결 전 - 무시
  }
  return null;
}

/**
 * 프로젝트 루트 경로 결정
 * 
 * Fallback 순서:
 * 1. MCP roots (클라이언트가 전달한 워크스페이스 루트) - 최우선
 * 2. PROJECT_ROOT 환경변수
 * 3. fallbackPath (process.cwd())
 */
function resolveProjectRoot(fallbackPath: string): string {
  // 1. 캐시된 MCP roots 사용
  if (cachedRootsPath) {
    return cachedRootsPath;
  }
  
  // 2. PROJECT_ROOT 환경변수
  if (process.env.PROJECT_ROOT) {
    return path.resolve(process.env.PROJECT_ROOT);
  }
  
  // 3. fallback (cwd)
  return fallbackPath;
}

/**
 * 환경변수에서 설정 읽기 (동기 버전 - 레거시 지원)
 * 
 * 기본 디렉토리 구조:
 * {PROJECT_ROOT}/
 * └── .review/
 *     ├── data/           # 리뷰/태스크 데이터 저장
 *     │   ├── reviews/
 *     │   └── tasks/
 *     └── rules.md        # 프로젝트 커스텀 규칙 (선택적)
 * 
 * 환경변수:
 * - PROJECT_ROOT: 프로젝트 루트 경로 (미설정시 repoPath 파라미터 또는 cwd 사용)
 * - DATA_DIR: 데이터 저장 경로 (미설정시 {PROJECT_ROOT}/.review/data)
 * - CUSTOM_RULES_PATH: 커스텀 규칙 파일 경로 (미설정시 {PROJECT_ROOT}/.review/rules.md)
 * 
 * @param projectRoot - 프로젝트 루트 또는 fallback 경로
 */
export function readEnv(projectRoot: string): Env {
  const resolvedProjectRoot = resolveProjectRoot(projectRoot);
  
  // .review 디렉토리 기준 경로
  const reviewDir = path.join(resolvedProjectRoot, ".review");
  
  // DATA_DIR: 환경변수 또는 {PROJECT_ROOT}/.review/data
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(reviewDir, "data");
  
  // CUSTOM_RULES_PATH: 환경변수 또는 {PROJECT_ROOT}/.review/rules.md
  // 파일이 없어도 됨 - rules.ts에서 파일 존재 여부 확인
  const customRulesPath = process.env.CUSTOM_RULES_PATH
    ? path.resolve(process.env.CUSTOM_RULES_PATH)
    : path.join(reviewDir, "rules.md");

  return { projectRoot: resolvedProjectRoot, dataDir, customRulesPath };
}

/**
 * 환경 설정 getter 생성 (MCP roots 지원)
 * 
 * 도구 호출 시점에 프로젝트 루트를 동적으로 결정:
 * 1. MCP roots (클라이언트가 전달한 워크스페이스 루트) - 최우선
 * 2. PROJECT_ROOT 환경변수
 * 3. fallbackPath (process.cwd())
 * 
 * @param server - MCP 서버 인스턴스
 * @param fallbackPath - 최종 fallback 경로
 */
export function createEnvGetters(server: McpServer, fallbackPath: string): EnvGetters {
  // 서버 연결 후 roots 캐싱 시도 (비동기)
  // 첫 번째 도구 호출 전에 roots를 가져오도록 함
  setTimeout(async () => {
    const rootsPath = await fetchRootsFromClient(server);
    if (rootsPath) {
      cachedRootsPath = rootsPath;
      // 디버그 로그 (stderr로 출력하여 MCP 통신에 영향 없음)
      console.error(`[mrt-fe-review-washer] Using workspace root from MCP client: ${rootsPath}`);
    }
  }, 100);

  return {
    getProjectRoot: () => resolveProjectRoot(fallbackPath),
    
    getDataDir: () => {
      const projectRoot = resolveProjectRoot(fallbackPath);
      if (process.env.DATA_DIR) {
        return path.resolve(process.env.DATA_DIR);
      }
      return path.join(projectRoot, ".review", "data");
    },
    
    getCustomRulesPath: () => {
      const projectRoot = resolveProjectRoot(fallbackPath);
      if (process.env.CUSTOM_RULES_PATH) {
        return path.resolve(process.env.CUSTOM_RULES_PATH);
      }
      return path.join(projectRoot, ".review", "rules.md");
    },
  };
}
