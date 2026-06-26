/**
 * One-off script to generate README demo screenshots.
 * Run: npx tsx scripts/capture-readme-assets.ts
 */
import fs from 'fs';
import path from 'path';
import { config } from '../src/config';
import {
  findDescriptionField,
  findNameField,
  scrollToForm,
} from '../src/detection/elementDetector';
import {
  closeBrowser,
  navigateToUrl,
  openBrowser,
  scroll,
  takeScreenshot,
} from '../src/tools/browserTools';
import { sendKeys } from '../src/tools/interactionTools';

const ASSETS_DIR = path.join(process.cwd(), 'docs', 'images');

async function capture(): Promise<void> {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  const session = await openBrowser();

  try {
    await navigateToUrl(session.page, config.targetUrl);
    await scroll(session.page, 'down', 400);
    await scrollToForm(session.page);

    await takeScreenshot(
      session.page,
      path.join(ASSETS_DIR, '01-page-loaded.png'),
    );

    const nameField = await findNameField(session.page);
    await sendKeys(session.page, nameField.locator, config.formNameValue);

    const descField = await findDescriptionField(session.page);
    await sendKeys(session.page, descField.locator, config.formDescriptionValue);

    await takeScreenshot(
      session.page,
      path.join(ASSETS_DIR, '02-form-filled.png'),
    );

    const form = session.page.locator('form').first();
    await form.screenshot({
      path: path.join(ASSETS_DIR, '03-form-detail.jpg'),
      type: 'jpeg',
      quality: 85,
    });

    console.log(`Screenshots saved to ${ASSETS_DIR}`);
  } finally {
    await closeBrowser(session);
  }
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
