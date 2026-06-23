import type { Browser, BrowserContext, Locator, Page } from 'playwright';

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

export interface AgentRunResult {
  success: boolean;
  screenshotPath?: string;
  nameFilled: boolean;
  descriptionFilled: boolean;
  stepsCompleted: string[];
  errors: string[];
  durationMs: number;
}

export interface DetectionResult {
  locator: Locator;
  strategy: string;
  selector?: string;
}

export interface LlmPlanStep {
  step: number;
  action: string;
  description: string;
}

export interface LlmSelectorSuggestion {
  selector: string;
  selectorType: 'css' | 'xpath' | 'playwright';
  confidence: string;
  reasoning: string;
}
