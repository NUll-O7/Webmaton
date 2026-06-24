import { config } from '../config';
import { logger } from '../utils/logger';
import type { LlmPlanStep, LlmSelectorSuggestion } from '../types';

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
}

async function chat(messages: OllamaChatMessage[]): Promise<string> {
  const url = `${config.ollamaBaseUrl}/api/chat`;

  logger.debug({ url, model: config.llmModel, messageCount: messages.length }, 'Sending LLM request');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.llmModel,
      messages,
      stream: false,
      format: 'json',
    }),
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

export async function planSteps(taskDescription: string): Promise<LlmPlanStep[]> {
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
  const steps = Array.isArray(parsed) ? parsed : parsed.steps;

  if (!Array.isArray(steps)) {
    throw new Error('LLM plan response did not contain a steps array');
  }

  logger.info({ stepCount: steps.length, steps }, 'LLM plan generated');
  return steps;
}

export async function suggestSelector(
  domSnippet: string,
  fieldName: string,
): Promise<LlmSelectorSuggestion> {
  const systemPrompt = `You are a DOM selector expert for Playwright browser automation.
Given an HTML snippet and a target field name, suggest the best selector.
Return ONLY valid JSON with: selector, selectorType ("css"|"xpath"|"playwright"), confidence ("high"|"medium"|"low"), reasoning.`;

  const userPrompt = `Target field: "${fieldName}"

HTML snippet:
${domSnippet.slice(0, 6000)}

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
