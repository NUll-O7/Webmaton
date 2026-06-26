# Website Automation Agent

**Assignment 04 — Website Automation Agent**

An autonomous browser agent built with TypeScript, Playwright, and a local Ollama LLM (`llama3.2`). The agent navigates to a target page, intelligently detects form fields (Name and Description), fills them, and captures a screenshot.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript on Node.js 18+ |
| Browser automation | Playwright (Chromium) |
| Local LLM | Ollama (`llama3.2`) |
| Configuration | dotenv + `src/config.ts` |
| Logging | pino (with pino-pretty in dev) |
| Package manager | npm / pnpm |

## Prerequisites

1. **Node.js 18+** — [https://nodejs.org](https://nodejs.org)
2. **Playwright browsers** — installed automatically via `postinstall`
3. **Ollama** — [https://ollama.com](https://ollama.com)

```bash
# Install Ollama, then pull the model
ollama pull llama3.2

# Verify Ollama is running
ollama list
```

## Setup

```bash
# Clone the repo and install dependencies
npm install
# or: pnpm install

# Copy environment config
cp .env.example .env

# Build TypeScript
npm run build
```

### Playwright (manual install if needed)

```bash
npx playwright install chromium
```

## Configuration

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `HEADLESS` | `true` | Run browser headless (`false` to watch) |
| `BROWSER_TIMEOUT_MS` | `30000` | Page/action timeout |
| `TARGET_URL` | shadcn react-hook-form docs | Page to automate |
| `FORM_NAME_VALUE` | `John Doe` | Value for Name field |
| `FORM_DESCRIPTION_VALUE` | (see `.env.example`) | Value for Description field |
| `SCREENSHOT_DIR` | `screenshots` | Output folder for screenshots |
| `LOG_LEVEL` | `info` | pino log level |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API base URL |
| `LLM_MODEL` | `llama3.2` | Ollama model name |
| `LLM_ENABLED` | `true` | Enable LLM planning + detection fallback |

## Running the Agent

```bash
# Production (compiled)
npm run build
npm start

# Development (no build step)
npm run dev
```

### Expected Output

The agent will:

1. Open a browser (headed or headless)
2. Navigate to `https://ui.shadcn.com/docs/forms/react-hook-form`
3. Detect Name and Description fields (deterministic selectors first, LLM fallback if needed)
4. Fill both fields with configured sample values
5. Save a screenshot to `screenshots/form-filled-<timestamp>.png`
6. Print a run summary to the console

### Logs & Screenshots

- **Logs** — structured JSON logs via pino (pretty-printed in dev)
- **Screenshots** — saved under `screenshots/` (gitignored)

## Project Structure

```
src/
├── main.ts                          # CLI entrypoint
├── config.ts                        # Environment configuration
├── types/index.ts                   # Shared TypeScript types
├── utils/logger.ts                  # pino logger setup
├── llm/llmClient.ts                 # Ollama HTTP client
├── tools/
│   ├── browserTools.ts              # openBrowser, navigate, scroll, screenshot
│   └── interactionTools.ts          # click, doubleClick, sendKeys
├── detection/elementDetector.ts     # Deterministic + LLM field detection
└── agent/WebsiteAutomationAgent.ts  # Orchestrator
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for module responsibilities and data flow.

## Available Tools

The agent exposes composable browser tools (used internally):

| Tool | Module | Description |
|------|--------|-------------|
| `openBrowser` | browserTools | Launch Chromium |
| `navigateToUrl` | browserTools | Go to a URL |
| `scroll` | browserTools | Scroll page by direction/amount |
| `takeScreenshot` | browserTools | Capture page to file |
| `clickOnScreen` | interactionTools | Click at (x, y) |
| `doubleClick` | interactionTools | Double-click at (x, y) |
| `sendKeys` | interactionTools | Fill text into a field |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Ollama connection refused | Start Ollama: `ollama serve` |
| Model not found | Run `ollama pull llama3.2` |
| Element not found | Set `HEADLESS=false` to inspect; check logs for detection strategy |
| Playwright browser missing | Run `npx playwright install chromium` |

## License

MIT
