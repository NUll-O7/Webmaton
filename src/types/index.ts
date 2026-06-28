import type { Browser, BrowserContext, Locator, Page } from 'playwright';

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Carries the intermediate reasoning produced by the Chain of Thought think-phase
 * alongside the final structured answer produced in the answer-phase.
 */
export interface LlmThoughtTrace {
  /** The free-text reasoning the model produced before generating its structured output. */
  thought: string;
  /** The raw structured answer (JSON string) produced after the think phase. */
  rawAnswer: string;
}

export interface AgentRunResult {
  success: boolean;
  screenshotPath?: string;
  nameFilled: boolean;
  descriptionFilled: boolean;
  stepsCompleted: string[];
  errors: string[];
  durationMs: number;
  /** Chain-of-Thought traces collected during the run (populated when COT_ENABLED=true). */
  thoughtTraces: LlmThoughtTrace[];
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
  /** Present when COT_ENABLED=true — the reasoning that led to this plan. */
  thoughtTrace?: LlmThoughtTrace;
}

export interface LlmSelectorSuggestion {
  selector: string;
  selectorType: 'css' | 'xpath' | 'playwright';
  confidence: string;
  reasoning: string;
  /** Present when COT_ENABLED=true — the reasoning that led to this selector. */
  thoughtTrace?: LlmThoughtTrace;
}
