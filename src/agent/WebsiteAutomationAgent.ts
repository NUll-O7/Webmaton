import path from 'path';
import { config, getScreenshotPath } from '../config';
import {
  extractFormDomSnippet,
  findDescriptionField,
  findNameField,
  scrollToForm,
} from '../detection/elementDetector';
import { isLlmAvailable, planSteps } from '../llm/llmClient';
import {
  closeBrowser,
  navigateToUrl,
  openBrowser,
  scroll,
  takeScreenshot,
} from '../tools/browserTools';
import { sendKeys } from '../tools/interactionTools';
import { logger } from '../utils/logger';
import type { AgentRunResult, BrowserSession } from '../types';

export class WebsiteAutomationAgent {
  private session: BrowserSession | null = null;

  async run(): Promise<AgentRunResult> {
    const startTime = Date.now();
    const stepsCompleted: string[] = [];
    const errors: string[] = [];
    let nameFilled = false;
    let descriptionFilled = false;
    let screenshotPath: string | undefined;

    logger.info('=== Website Automation Agent started ===');
    logger.info({ config: { ...config, targetUrl: config.targetUrl } }, 'Configuration loaded');

    try {
      if (config.llmEnabled) {
        const llmUp = await isLlmAvailable();
        if (llmUp) {
          logger.info('Ollama is available — LLM assistance enabled');
          try {
            const plan = await planSteps(
              `Navigate to ${config.targetUrl}, find Name and Description form fields, fill them, and take a screenshot.`,
            );
            logger.info({ plan }, 'High-level plan from LLM');
            stepsCompleted.push('llm_plan_generated');
          } catch (planError) {
            logger.warn({ error: planError }, 'LLM planning failed — continuing without plan');
            errors.push(`LLM planning: ${(planError as Error).message}`);
          }
        } else {
          logger.warn('Ollama not reachable — LLM fallback for detection will be skipped');
        }
      }

      this.session = await openBrowser();
      stepsCompleted.push('browser_opened');

      await navigateToUrl(this.session.page, config.targetUrl);
      stepsCompleted.push('navigated_to_url');

      await scroll(this.session.page, 'down', 400);
      stepsCompleted.push('initial_scroll');

      await scrollToForm(this.session.page);
      stepsCompleted.push('scrolled_to_form');

      const domSnippet = await extractFormDomSnippet(this.session.page);
      logger.debug({ domSnippetLength: domSnippet.length }, 'Form DOM captured for reference');

      const nameResult = await findNameField(this.session.page);
      logger.info(
        { field: 'Name', strategy: nameResult.strategy, selector: nameResult.selector },
        'Name field detected',
      );
      stepsCompleted.push(`name_field_detected:${nameResult.strategy}`);

      await sendKeys(this.session.page, nameResult.locator, config.formNameValue);
      nameFilled = true;
      stepsCompleted.push('name_field_filled');

      const descriptionResult = await findDescriptionField(this.session.page);
      logger.info(
        {
          field: 'Description',
          strategy: descriptionResult.strategy,
          selector: descriptionResult.selector,
        },
        'Description field detected',
      );
      stepsCompleted.push(`description_field_detected:${descriptionResult.strategy}`);

      await sendKeys(this.session.page, descriptionResult.locator, config.formDescriptionValue);
      descriptionFilled = true;
      stepsCompleted.push('description_field_filled');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      screenshotPath = getScreenshotPath(`form-filled-${timestamp}.png`);
      await takeScreenshot(this.session.page, screenshotPath);
      stepsCompleted.push('screenshot_taken');

      logger.info('=== Agent run completed successfully ===');
    } catch (error) {
      const message = (error as Error).message;
      logger.error({ error: message }, 'Agent run failed');
      errors.push(message);

      if (this.session?.page) {
        try {
          const errorScreenshot = getScreenshotPath(`error-${Date.now()}.png`);
          await takeScreenshot(this.session.page, errorScreenshot);
          screenshotPath = errorScreenshot;
          logger.info({ errorScreenshot }, 'Error screenshot captured');
        } catch {
          logger.warn('Could not capture error screenshot');
        }
      }
    } finally {
      if (this.session) {
        await closeBrowser(this.session);
        this.session = null;
        stepsCompleted.push('browser_closed');
      }
    }

    const durationMs = Date.now() - startTime;
    const success = nameFilled && descriptionFilled && errors.length === 0;

    const result: AgentRunResult = {
      success,
      screenshotPath: screenshotPath ? path.relative(process.cwd(), screenshotPath) : undefined,
      nameFilled,
      descriptionFilled,
      stepsCompleted,
      errors,
      durationMs,
    };

    logger.info({ result }, 'Run summary');
    return result;
  }
}
