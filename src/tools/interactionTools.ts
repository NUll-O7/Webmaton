import type { Locator, Page } from 'playwright';
import { logger } from '../utils/logger';

export async function clickOnScreen(page: Page, x: number, y: number): Promise<void> {
  logger.info({ x, y }, 'Clicking on screen');
  await page.mouse.click(x, y);
}

export async function doubleClick(page: Page, x: number, y: number): Promise<void> {
  logger.info({ x, y }, 'Double-clicking on screen');
  await page.mouse.dblclick(x, y);
}

export async function doubleClickLocator(locator: Locator): Promise<void> {
  logger.info('Double-clicking on locator');
  await locator.dblclick();
}

export async function sendKeys(
  page: Page,
  selectorOrLocator: string | Locator,
  text: string,
): Promise<void> {
  const locator =
    typeof selectorOrLocator === 'string'
      ? page.locator(selectorOrLocator)
      : selectorOrLocator;

  logger.info(
    {
      selector: typeof selectorOrLocator === 'string' ? selectorOrLocator : '<locator>',
      textLength: text.length,
    },
    'Sending keys to element',
  );

  await locator.waitFor({ state: 'visible', timeout: 10_000 });
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
  await locator.fill(text);

  logger.info('Keys sent successfully');
}

export async function sendKeysByCoordinates(
  page: Page,
  x: number,
  y: number,
  text: string,
): Promise<void> {
  logger.info({ x, y, textLength: text.length }, 'Sending keys at coordinates');
  await page.mouse.click(x, y);
  await page.keyboard.type(text, { delay: 30 });
}
