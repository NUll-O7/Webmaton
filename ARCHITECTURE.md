# Architecture — Website Automation Agent

## Overview

The agent follows a **modular tool-composition** pattern. Playwright handles all browser interactions; the local Ollama LLM assists only with high-level planning and selector suggestions when deterministic detection fails.

```
┌─────────────┐     ┌──────────────────────────┐     ┌─────────────────┐
│   main.ts   │────▶│ WebsiteAutomationAgent   │────▶│  browserTools   │
└─────────────┘     │                          │     │ interactionTools│
                    │  orchestrates workflow   │────▶│ elementDetector │
                    └──────────┬───────────────┘     └─────────────────┘
                               │
                               ▼ (fallback only)
                    ┌──────────────────┐
                    │    llmClient     │◀── Ollama API (localhost:11434)
                    └──────────────────┘
```

## Modules

### `config.ts`

Loads environment variables via dotenv and exports a typed `config` object consumed by all modules. Centralizes defaults for headless mode, timeouts, target URL, form values, LLM settings, and screenshot paths.

### `utils/logger.ts`

Configures **pino** with pretty output in development. All modules log through this singleton for consistent, structured logging.

### `llm/llmClient.ts`

HTTP client for Ollama's `/api/chat` endpoint.

| Function | Purpose |
|----------|---------|
| `planSteps(task)` | Returns high-level JSON steps before execution (optional guidance) |
| `suggestSelector(dom, field)` | Returns a CSS/XPath/Playwright selector when DOM is ambiguous |
| `isLlmAvailable()` | Health check against Ollama `/api/tags` |

LLM requests and responses are logged at `info`/`debug` level for transparency.

### `tools/browserTools.ts`

Low-level browser lifecycle and navigation:

- `openBrowser()` — launches Chromium, creates context + page
- `navigateToUrl(page, url)` — navigates with timeout and network-idle wait
- `scroll(page, direction, amount)` — mouse wheel scroll
- `takeScreenshot(page, path)` — saves PNG to disk
- `closeBrowser(session)` — clean shutdown

### `tools/interactionTools.ts`

User interaction primitives:

- `clickOnScreen(page, x, y)` — coordinate click
- `doubleClick(page, x, y)` — coordinate double-click
- `doubleClickLocator(locator)` — locator-based double-click
- `sendKeys(page, selectorOrLocator, text)` — wait, scroll, click, fill

### `detection/elementDetector.ts`

**Deterministic detection** (tried first, in order):

1. `getByLabel` — match "Name" / "Description" labels
2. `getByRole('textbox')` — accessible name matching
3. `getByPlaceholder` — placeholder text
4. XPath — label-following axis for input/textarea

**LLM-assisted fallback:**

When all deterministic strategies fail and `LLM_ENABLED=true`:

1. Extract a DOM snippet from the form area
2. Call `suggestSelector(domSnippet, fieldName)`
3. Parse and validate the suggested selector against the live page
4. Return the locator if visible and editable

Public API: `findNameField(page)`, `findDescriptionField(page)`, `scrollToForm(page)`.

### `agent/WebsiteAutomationAgent.ts`

The orchestrator class. `run()` executes this workflow:

1. Check Ollama availability; optionally request an LLM plan
2. Open browser → navigate to target URL
3. Scroll to reveal the form
4. Detect Name field → fill with `config.formNameValue`
5. Detect Description field → fill with `config.formDescriptionValue`
6. Take screenshot
7. Close browser (always, via `finally`)
8. Return `AgentRunResult` with success flag, steps, errors, duration

On failure, captures an error screenshot before cleanup.

## LLM Integration Strategy

| Use Case | When | What LLM Does |
|----------|------|---------------|
| Planning | Start of run (optional) | Suggests high-level step list |
| Detection fallback | Deterministic strategies exhausted | Suggests selector from DOM snippet |

**What the LLM does NOT do:**

- Generate or execute arbitrary Playwright code
- Replace browser automation logic
- Call external cloud APIs

## Chain-of-Thought (CoT) Prompting

Controlled by `COT_ENABLED` (default `true`). When enabled, every LLM call becomes a two-phase interaction:

```
Phase 1 — Think
  System: "Reason step-by-step. Do NOT produce JSON yet."
  User:   <original task / DOM context>
  ──▶ free-text thought (logged at debug level)

Phase 2 — Answer
  System: "Based on your reasoning, return ONLY valid JSON."
  User:   "Your reasoning:\n<thought>\n\nNow return the JSON."
  ──▶ structured JSON (parsed as usual)
```

This applies to both `planSteps()` and `suggestSelector()`. The thought text is:
- Logged at `debug` level for inspection
- Attached to each `LlmPlanStep` and `LlmSelectorSuggestion` as an optional `thoughtTrace` field
- Aggregated in `AgentRunResult.thoughtTraces` for post-run analysis

When `COT_ENABLED=false`, the original single-shot prompts run unchanged (fully backward-compatible).

| Config Flag | Env Var | Default | Effect |
|-------------|---------|---------|--------|
| `llmEnabled` | `LLM_ENABLED` | `true` | Enables all LLM features |
| `cotEnabled` | `COT_ENABLED` | `true` | Enables two-phase CoT prompting |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Network / navigation timeout | Logged and thrown; error screenshot captured |
| Element not found | Tries all deterministic strategies, then LLM; throws if all fail |
| LLM unavailable | Warns and skips LLM; fails if deterministic detection also fails |
| LLM bad selector | Validates before use; throws if invalid |
| Unhandled exception | Fatal log + exit code 1 |

Browser is always closed in a `finally` block.

## Logging Strategy

- **info** — major agent actions (navigate, detect, fill, screenshot)
- **debug** — DOM snippets, LLM raw responses, failed strategy attempts
- **warn** — recoverable issues (LLM unavailable, network idle timeout)
- **error** — run failures

Every detection decision logs the strategy used (e.g., `label:name`, `llm:css`).

## Data Flow

```
.env → config.ts → WebsiteAutomationAgent.run()
                         │
                         ├─▶ llmClient.planSteps()          [optional]
                         ├─▶ browserTools.openBrowser()
                         ├─▶ browserTools.navigateToUrl()
                         ├─▶ elementDetector.findNameField()
                         │       └─▶ llmClient.suggestSelector()  [fallback]
                         ├─▶ interactionTools.sendKeys()
                         ├─▶ elementDetector.findDescriptionField()
                         ├─▶ interactionTools.sendKeys()
                         ├─▶ browserTools.takeScreenshot()
                         └─▶ browserTools.closeBrowser()
```

## Extending the Agent

- **New fields**: add a `findXxxField()` in `elementDetector.ts` and call it from the agent
- **New pages**: change `TARGET_URL` in `.env`
- **New tools**: add functions to `browserTools.ts` or `interactionTools.ts`
- **Different LLM**: change `LLM_MODEL` — client uses Ollama's OpenAI-compatible chat API
