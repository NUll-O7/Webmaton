import { WebsiteAutomationAgent } from './agent/WebsiteAutomationAgent';
import { config } from './config';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  logger.info('Starting Website Automation Agent CLI');

  const agent = new WebsiteAutomationAgent();
  const result = await agent.run();

  console.log('\n--- Run Summary ---');
  console.log(`Success:       ${result.success ? 'YES' : 'NO'}`);
  console.log(`Name filled:   ${result.nameFilled ? 'YES' : 'NO'}`);
  console.log(`Description:   ${result.descriptionFilled ? 'YES' : 'NO'}`);
  console.log(`Duration:      ${result.durationMs}ms`);
  console.log(`Target URL:    ${config.targetUrl}`);

  if (result.screenshotPath) {
    console.log(`Screenshot:    ${result.screenshotPath}`);
  }

  console.log(`Steps:         ${result.stepsCompleted.join(' → ')}`);

  if (result.errors.length > 0) {
    console.log(`Errors:\n  - ${result.errors.join('\n  - ')}`);
  }

  process.exit(result.success ? 0 : 1);
}

main().catch((error) => {
  logger.fatal({ error }, 'Unhandled fatal error');
  console.error('Fatal error:', error);
  process.exit(1);
});
