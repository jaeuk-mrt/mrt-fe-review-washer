import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 프로젝트 루트의 templates 폴더 경로
const TEMPLATES_DIR = join(__dirname, "../../templates/prompts");

/**
 * 템플릿 파일에서 프롬프트를 로드합니다.
 * @param templatePath - templates/prompts/ 기준 상대 경로 (예: "review/index.md")
 */
export async function loadPromptFromTemplate(
  templatePath: string
): Promise<string> {
  const fullPath = join(TEMPLATES_DIR, templatePath);
  try {
    const content = await readFile(fullPath, "utf-8");
    return content;
  } catch (error) {
    throw new Error(
      `Failed to load prompt template: ${templatePath} (${fullPath})`
    );
  }
}

/**
 * 템플릿에 변수를 대입하여 프롬프트를 생성합니다.
 * {{variable}} 형식의 플레이스홀더를 실제 값으로 대체합니다.
 * @param template - 템플릿 문자열
 * @param variables - 대입할 변수 객체
 */
export function generatePrompt(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    result = result.replace(placeholder, value ?? "");
  }

  return result;
}

/**
 * 커스텀 프롬프트 오버라이드를 적용합니다.
 * 환경변수 PROMPT_{key}가 설정되어 있으면 해당 값으로 대체합니다.
 * @param prompt - 기본 프롬프트
 * @param customKey - 커스텀 프롬프트 키 (예: "REVIEW_KO")
 */
export function loadPrompt(prompt: string, customKey?: string): string {
  if (!customKey) {
    return prompt;
  }

  const envKey = `PROMPT_${customKey}`;
  const customPrompt = process.env[envKey];

  if (customPrompt?.trim()) {
    return customPrompt;
  }

  return prompt;
}
