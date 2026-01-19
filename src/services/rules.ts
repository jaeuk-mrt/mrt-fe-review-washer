import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MCP 서버 루트의 templates 디렉토리
const TEMPLATES_DIR = path.resolve(__dirname, "../../templates");
const DEFAULT_RULES_PATH = path.join(TEMPLATES_DIR, "rules.ko.md");

/**
 * 파일 읽기 헬퍼 (없으면 빈 문자열)
 */
async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * 기본 규칙 읽기 (MCP 서버 내장)
 * - templates/rules.ko.md
 * - 모든 FE 코드 리뷰에서 항상 적용
 */
export async function readDefaultRules(): Promise<string> {
  return readFileOrEmpty(DEFAULT_RULES_PATH);
}

/**
 * 커스텀 규칙 읽기 (프로젝트별 선택적)
 * - 프로젝트별 추가/오버라이드 규칙
 */
export async function readCustomRules(customRulesPath?: string): Promise<string> {
  if (!customRulesPath) return "";
  return readFileOrEmpty(customRulesPath);
}

/**
 * 최종 규칙 생성 (기본 + 커스텀 병합)
 * - 기본 규칙: 항상 적용 (MCP 서버 내장)
 * - 커스텀 규칙: 프로젝트별 추가/오버라이드 (선택적)
 */
export async function readRules(customRulesPath?: string): Promise<string> {
  const defaultRules = await readDefaultRules();
  const customRules = await readCustomRules(customRulesPath);

  if (!customRules.trim()) {
    return defaultRules;
  }

  // 기본 규칙 + 커스텀 규칙 병합
  return [
    defaultRules.trim(),
    "",
    "---",
    "",
    "## 프로젝트 커스텀 규칙 (추가/오버라이드)",
    "",
    customRules.trim(),
  ].join("\n");
}

/**
 * 기본 규칙 경로 반환 (디버깅용)
 */
export function getDefaultRulesPath(): string {
  return DEFAULT_RULES_PATH;
}
