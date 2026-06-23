import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseIntEnv(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export const config = {
  headless: parseBool(process.env.HEADLESS, true),
  browserTimeoutMs: parseIntEnv(process.env.BROWSER_TIMEOUT_MS, 30_000),

  targetUrl:
    process.env.TARGET_URL ??
    'https://ui.shadcn.com/docs/forms/react-hook-form',
  formNameValue: process.env.FORM_NAME_VALUE ?? 'John Doe',
  formDescriptionValue:
    process.env.FORM_DESCRIPTION_VALUE ??
    'Automated form fill via Website Automation Agent',

  screenshotDir: process.env.SCREENSHOT_DIR ?? 'screenshots',

  logLevel: process.env.LOG_LEVEL ?? 'info',

  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  llmModel: process.env.LLM_MODEL ?? 'llama3.2',
  llmEnabled: parseBool(process.env.LLM_ENABLED, true),
} as const;

export type AppConfig = typeof config;

export function getScreenshotPath(filename: string): string {
  return path.join(process.cwd(), config.screenshotDir, filename);
}
