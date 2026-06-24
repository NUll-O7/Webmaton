import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { BrowserSession, ScrollDirection } from '../types';

export async function openBrowser(): Promise<BrowserSession> {
  logger.info({ headless: config.headless }, 'Opening browser');

  const browser = await chromium.launch({
    headless: config.headless,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(config.browserTimeoutMs);

  logger.info('Browser opened successfully');
  return { browser, context, page };
}

export async function navigateToUrl(page: BrowserSession['page'], url: string): Promise<void> {
  logger.info({ url }, 'Navigating to URL');

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.browserTimeoutMs });
    await page.waitForLoadState('networkidle', { timeout: config.browserTimeoutMs }).catch(() => {
      logger.warn('Network idle timeout — continuing with domcontentloaded state');
    });
    logger.info({ url, title: await page.title() }, 'Navigation complete');
  } catch (error) {
    logger.error({ url, error }, 'Navigation failed');
    throw new Error(`Failed to navigate to ${url}: ${(error as Error).message}`);
  }
}

export async function scroll(
  page: BrowserSession['page'],
  direction: ScrollDirection,
  amount = 500,
): Promise<void> {
  const delta = {
    up: { x: 0, y: -amount },
    down: { x: 0, y: amount },
    left: { x: -amount, y: 0 },
    right: { x: amount, y: 0 },
  }[direction];

  logger.info({ direction, amount }, 'Scrolling page');
  await page.mouse.wheel(delta.x, delta.y);
  await page.waitForTimeout(300);
}

export async function takeScreenshot(
  page: BrowserSession['page'],
  filePath: string,
): Promise<string> {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  logger.info({ filePath }, 'Taking screenshot');
  await page.screenshot({ path: filePath, fullPage: false });
  logger.info({ filePath }, 'Screenshot saved');
  return filePath;
}

export async function closeBrowser(session: BrowserSession): Promise<void> {
  logger.info('Closing browser');
  await session.context.close();
  await session.browser.close();
  logger.info('Browser closed');
}
