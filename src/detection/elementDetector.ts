import type { Locator, Page } from 'playwright';
import { config } from '../config';
import { suggestSelector } from '../llm/llmClient';
import { logger } from '../utils/logger';
import type { DetectionResult, LlmSelectorSuggestion } from '../types';

const NAME_LABELS = ['name', 'full name', 'your name'];
const DESCRIPTION_LABELS = ['description', 'desc', 'details', 'about'];

async function isVisibleAndEditable(locator: Locator): Promise<boolean> {
  try {
    const count = await locator.count();
    if (count === 0) return false;
    const first = locator.first();
    return (await first.isVisible()) && (await first.isEditable());
  } catch {
    return false;
  }
}

async function tryStrategy(
  page: Page,
  strategy: string,
  buildLocator: () => Locator,
): Promise<DetectionResult | null> {
  try {
    const locator = buildLocator();
    if (await isVisibleAndEditable(locator)) {
      logger.info({ strategy }, 'Field detected via strategy');
      return { locator: locator.first(), strategy };
    }
  } catch (error) {
    logger.debug({ strategy, error }, 'Detection strategy failed');
  }
  return null;
}

async function detectByLabel(
  page: Page,
  labels: string[],
  fieldName: string,
): Promise<DetectionResult | null> {
  for (const label of labels) {
    const result = await tryStrategy(page, `label:${label}`, () =>
      page.getByLabel(label, { exact: false }),
    );
    if (result) return result;

    const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
    const resultCap = await tryStrategy(page, `label:${capitalized}`, () =>
      page.getByLabel(capitalized, { exact: false }),
    );
    if (resultCap) return resultCap;
  }

  const result = await tryStrategy(page, `label:${fieldName}`, () =>
    page.getByLabel(fieldName, { exact: false }),
  );
  return result;
}

async function detectByRole(
  page: Page,
  fieldName: string,
  role: 'textbox' | 'searchbox' = 'textbox',
): Promise<DetectionResult | null> {
  return tryStrategy(page, `role:${role}:${fieldName}`, () =>
    page.getByRole(role, { name: new RegExp(fieldName, 'i') }),
  );
}

async function detectByPlaceholder(
  page: Page,
  fieldName: string,
): Promise<DetectionResult | null> {
  return tryStrategy(page, `placeholder:${fieldName}`, () =>
    page.getByPlaceholder(new RegExp(fieldName, 'i')),
  );
}

async function detectByXPath(page: Page, fieldName: string): Promise<DetectionResult | null> {
  const xpath = `//label[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${fieldName.toLowerCase()}')]/following::input[1] | //label[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${fieldName.toLowerCase()}')]/following::textarea[1]`;
  return tryStrategy(page, `xpath:label-following`, () => page.locator(`xpath=${xpath}`));
}

async function detectDescriptionTextarea(page: Page): Promise<DetectionResult | null> {
  return tryStrategy(page, 'textarea:description', () =>
    page.locator('textarea').filter({ has: page.locator(`xpath=ancestor::*[.//label[contains(translate(., 'NAME', 'name'), 'description')]]`) }),
  );
}

export async function extractFormDomSnippet(page: Page): Promise<string> {
  logger.info('Extracting form DOM snippet');

  const snippet = await page.evaluate(() => {
    const form =
      document.querySelector('form') ??
      document.querySelector('[data-slot="form"]') ??
      document.querySelector('main');

    if (form) {
      return form.outerHTML.slice(0, 8000);
    }

    const inputs = Array.from(document.querySelectorAll('input, textarea, label'));
    const container = document.createElement('div');
    inputs.slice(0, 30).forEach((el: Element) => container.appendChild(el.cloneNode(true)));
    return container.innerHTML.slice(0, 8000);
  });

  logger.debug({ snippetLength: snippet.length }, 'DOM snippet extracted');
  return snippet;
}

function resolvePlaywrightSelector(page: Page, suggestion: LlmSelectorSuggestion): Locator {
  const sel = suggestion.selector.trim();

  const getByLabelMatch = sel.match(/getByLabel\s*\(\s*['"](.+?)['"]\s*(?:,\s*\{[^}]*\})?\s*\)/);
  if (getByLabelMatch) {
    return page.getByLabel(getByLabelMatch[1], { exact: false });
  }

  const getByRoleMatch = sel.match(
    /getByRole\s*\(\s*['"](\w+)['"]\s*,\s*\{\s*name\s*:\s*['"](.+?)['"]\s*\}\s*\)/,
  );
  if (getByRoleMatch) {
    return page.getByRole(getByRoleMatch[1] as 'textbox', {
      name: new RegExp(getByRoleMatch[2], 'i'),
    });
  }

  const getByPlaceholderMatch = sel.match(/getByPlaceholder\s*\(\s*['"](.+?)['"]\s*\)/);
  if (getByPlaceholderMatch) {
    return page.getByPlaceholder(getByPlaceholderMatch[1]);
  }

  if (suggestion.selectorType === 'xpath' || sel.startsWith('//') || sel.startsWith('xpath=')) {
    const xpath = sel.startsWith('xpath=') ? sel : `xpath=${sel}`;
    return page.locator(xpath);
  }

  return page.locator(sel);
}

export async function validateAndResolveSelector(
  page: Page,
  suggestion: LlmSelectorSuggestion,
): Promise<DetectionResult | null> {
  try {
    const locator = resolvePlaywrightSelector(page, suggestion);
    if (await isVisibleAndEditable(locator)) {
      logger.info(
        { selector: suggestion.selector, confidence: suggestion.confidence },
        'LLM selector validated',
      );
      return {
        locator: locator.first(),
        strategy: `llm:${suggestion.selectorType}`,
        selector: suggestion.selector,
      };
    }
    logger.warn({ selector: suggestion.selector }, 'LLM selector did not match editable element');
  } catch (error) {
    logger.warn({ selector: suggestion.selector, error }, 'LLM selector validation failed');
  }
  return null;
}

async function detectField(
  page: Page,
  fieldName: string,
  labelVariants: string[],
  extraDetectors: Array<(page: Page) => Promise<DetectionResult | null>>,
): Promise<DetectionResult> {
  logger.info({ fieldName }, 'Starting deterministic field detection');

  const strategies: Array<(page: Page) => Promise<DetectionResult | null>> = [
    (p) => detectByLabel(p, labelVariants, fieldName),
    (p) => detectByRole(p, fieldName),
    (p) => detectByPlaceholder(p, fieldName),
    (p) => detectByXPath(p, fieldName),
    ...extraDetectors,
  ];

  for (const detect of strategies) {
    const result = await detect(page);
    if (result) {
      logger.info({ fieldName, strategy: result.strategy }, 'Field found deterministically');
      return result;
    }
  }

  if (!config.llmEnabled) {
    throw new Error(
      `Could not find "${fieldName}" field deterministically and LLM is disabled`,
    );
  }

  logger.info({ fieldName }, 'Deterministic detection failed — consulting LLM');
  const domSnippet = await extractFormDomSnippet(page);
  const suggestion = await suggestSelector(domSnippet, fieldName);
  const llmResult = await validateAndResolveSelector(page, suggestion);

  if (llmResult) {
    return llmResult;
  }

  throw new Error(
    `Failed to detect "${fieldName}" field after deterministic and LLM-assisted attempts`,
  );
}

export async function findNameField(page: Page): Promise<DetectionResult> {
  return detectField(page, 'Name', NAME_LABELS, []);
}

export async function findDescriptionField(page: Page): Promise<DetectionResult> {
  return detectField(page, 'Description', DESCRIPTION_LABELS, [detectDescriptionTextarea]);
}

export async function scrollToForm(page: Page): Promise<void> {
  const formLocator = page.locator('form, [data-slot="form"], main').first();
  if ((await formLocator.count()) > 0) {
    await formLocator.scrollIntoViewIfNeeded();
    logger.info('Scrolled to form area');
  }
}
