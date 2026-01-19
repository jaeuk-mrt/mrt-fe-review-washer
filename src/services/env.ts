import path from "node:path";

export type Env = {
  /** 프로젝트 루트 경로 (git 저장소) */
  projectRoot: string;
  /** 리뷰 데이터 저장 경로 */
  dataDir: string;
  /** 커스텀 규칙 파일 경로 (선택적, 기본 규칙에 추가/오버라이드) */
  customRulesPath?: string;
};

/**
 * 환경변수에서 설정 읽기
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
  // PROJECT_ROOT 환경변수가 있으면 우선 사용
  const resolvedProjectRoot = process.env.PROJECT_ROOT 
    ? path.resolve(process.env.PROJECT_ROOT) 
    : projectRoot;
  
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
