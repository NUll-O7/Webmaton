import { config } from '../config';
import { logger } from '../utils/logger';
import type { LlmPlanStep, LlmSelectorSuggestion, LlmThoughtTrace } from '../types';

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
}

// ---------------------------------------------------------------------------
// Core HTTP helper
// ---------------------------------------------------------------------------

async function chat(messages: OllamaChatMessage[], jsonMode = true): Promise<string> {
  const url = `${config.ollamaBaseUrl}/api/chat`;

  logger.debug({ url, model: config.llmModel, messageCount: messages.length }, 'Sending LLM request');

  const body: Record<string, unknown> = {
    model: config.llmModel,
    messages,
    stream: false,
  };

  // Only request JSON format for the answer phase, not the think phase
  if (jsonMode) {
    body.format = 'json';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama API error (${response.status}): ${body}`);
  }

  const data = (await response.json()) as OllamaChatResponse;
  const content = data.message.content;

  logger.info({ responseLength: content.length }, 'LLM response received');
  logger.debug({ content }, 'LLM response content');

  return content;
}

function parseJsonResponse<T>(raw: string): T {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`LLM response is not valid JSON: ${trimmed.slice(0, 200)}`);
  }
  return JSON.parse(jsonMatch[0]) as T;
}

// ---------------------------------------------------------------------------
// Chain-of-Thought helpers
// ---------------------------------------------------------------------------

/**
 * Phase 1 of Chain of Thought: ask the model to reason freely without
 * producing structured output yet. Returns the raw thought text.
 */
async function thinkAbout(systemPrompt: string, userPrompt: string): Promise<string> {
  const cotSystemPrompt = `${systemPrompt}

IMPORTANT: In this step, think step-by-step and reason through the problem carefully.
Do NOT produce JSON or any structured output yet — just reason out loud in plain text.
Explore edge cases, consider alternatives, and explain your thinking thoroughly.`;

  const thought = await chat(
    [
      { role: 'system', content: cotSystemPrompt },
      { role: 'user', content: userPrompt },
    ],
    false, // free-text, no JSON mode
  );

  logger.debug({ thought }, '[CoT] Think-phase reasoning');
  return thought;
}

/**
 * Full Chain-of-Thought two-phase call.
 * Phase 1: think freely → Phase 2: produce structured JSON using the thought as context.
 *
 * @param thinkSystem  System prompt for the think phase
 * @param thinkUser    User prompt for the think phase
 * @param answerSystem System prompt for the answer (JSON) phase
 * @param buildAnswerUser  Receives the thought text; returns the user prompt for the answer phase
 */
async function chatWithThought(
  thinkSystem: string,
  thinkUser: string,
  answerSystem: string,
  buildAnswerUser: (thought: string) => string,
): Promise<LlmThoughtTrace> {
  // Phase 1 — Think
  const thought = await thinkAbout(thinkSystem, thinkUser);

  // Phase 2 — Answer
  const answerUser = buildAnswerUser(thought);
  logger.debug({ answerUser }, '[CoT] Answer-phase prompt');

  const rawAnswer = await chat([
    { role: 'system', content: answerSystem },
    { role: 'user', content: answerUser },
  ]);

  return { thought, rawAnswer };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function planSteps(taskDescription: string): Promise<LlmPlanStep[]> {
  let steps: LlmPlanStep[];
  let traceAttachment: LlmThoughtTrace | undefined;

  if (config.cotEnabled) {
    logger.info('[CoT] Running planSteps with Chain-of-Thought (think → answer)');

    const thinkSystem = `You are a browser automation planner. Given a task, reason through what high-level
steps a Playwright automation agent should take to complete it.`;

    const thinkUser = `Task: ${taskDescription}

Think step-by-step about what actions are needed. Consider the page structure,
what elements need to be found, and what interactions must happen.`;

    const answerSystem = `You are a browser automation planner. Based on the provided reasoning, produce
the final structured plan. Return ONLY valid JSON — no markdown, no commentary.`;

    const buildAnswerUser = (thought: string) =>
      `Your reasoning:\n${thought}\n\nBased on this reasoning, return a JSON array of high-level steps.
Each step must have: step (number), action (short verb), description (what to do).

Return JSON like:
[{"step":1,"action":"navigate","description":"Open the target URL"}, ...]`;

    const trace = await chatWithThought(thinkSystem, thinkUser, answerSystem, buildAnswerUser);
    traceAttachment = trace;

    const parsed = parseJsonResponse<LlmPlanStep[] | { steps: LlmPlanStep[] }>(trace.rawAnswer);
    steps = Array.isArray(parsed) ? parsed : parsed.steps;
  } else {
    // Original single-shot prompt (backward-compatible)
    const systemPrompt = `You are a browser automation planner. Given a task, return a JSON array of high-level steps.
Each step must have: step (number), action (short verb), description (what to do).
Return ONLY valid JSON, no markdown.`;

    const userPrompt = `Task: ${taskDescription}

Return a JSON array like:
[{"step":1,"action":"navigate","description":"Open the target URL"}, ...]`;

    const raw = await chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const parsed = parseJsonResponse<LlmPlanStep[] | { steps: LlmPlanStep[] }>(raw);
    steps = Array.isArray(parsed) ? parsed : parsed.steps;
  }

  if (!Array.isArray(steps)) {
    throw new Error('LLM plan response did not contain a steps array');
  }

  // Attach the thought trace to every step for full observability
  if (traceAttachment) {
    steps = steps.map((s) => ({ ...s, thoughtTrace: traceAttachment }));
  }

  logger.info({ stepCount: steps.length, steps }, 'LLM plan generated');
  return steps;
}

export async function suggestSelector(
  domSnippet: string,
  fieldName: string,
): Promise<LlmSelectorSuggestion> {
  const domContext = domSnippet.slice(0, 6000);

  if (config.cotEnabled) {
    logger.info(`[CoT] Running suggestSelector for "${fieldName}" with Chain-of-Thought`);

    const thinkSystem = `You are a DOM selector expert for Playwright browser automation.
Given an HTML snippet and a target field name, reason carefully about which selector is most reliable.`;

    const thinkUser = `Target field: "${fieldName}"

HTML snippet:
${domContext}

Think step-by-step:
- What HTML elements could represent this field?
- Are there labels, roles, placeholders, or data attributes you can use?
- Which selector strategy (label, role, placeholder, css, xpath) is most reliable for Playwright?
- What are the trade-offs of each option?`;

    const answerSystem = `You are a DOM selector expert for Playwright browser automation.
Based on the provided reasoning, return ONLY valid JSON with the best selector suggestion.
Return ONLY valid JSON, no markdown.`;

    const buildAnswerUser = (thought: string) =>
      `Your reasoning:\n${thought}\n\nBased on this reasoning, suggest the best Playwright-compatible selector
for the "${fieldName}" field. Prefer label-based or role-based selectors.

Return JSON like:
{"selector":"getByLabel('Name')","selectorType":"playwright","confidence":"high","reasoning":"..."}`;

    const trace = await chatWithThought(thinkSystem, thinkUser, answerSystem, buildAnswerUser);

    const suggestion = parseJsonResponse<LlmSelectorSuggestion>(trace.rawAnswer);
    suggestion.thoughtTrace = trace;

    logger.info({ fieldName, suggestion }, 'LLM selector suggestion (CoT)');
    return suggestion;
  }

  // Original single-shot prompt (backward-compatible)
  const systemPrompt = `You are a DOM selector expert for Playwright browser automation.
Given an HTML snippet and a target field name, suggest the best selector.
Return ONLY valid JSON with: selector, selectorType ("css"|"xpath"|"playwright"), confidence ("high"|"medium"|"low"), reasoning.`;

  const userPrompt = `Target field: "${fieldName}"

HTML snippet:
${domContext}

Suggest a Playwright-compatible selector to locate the input/textarea for "${fieldName}".
Prefer label-based or role-based selectors when possible.
Return JSON like: {"selector":"getByLabel('Name')","selectorType":"playwright","confidence":"high","reasoning":"..."}`;

  const raw = await chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  const suggestion = parseJsonResponse<LlmSelectorSuggestion>(raw);
  logger.info({ fieldName, suggestion }, 'LLM selector suggestion');
  return suggestion;
}

export async function isLlmAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${config.ollamaBaseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
