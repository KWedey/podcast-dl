import { Command } from 'commander';
import pc from 'picocolors';
import { validateFeed } from '../services/feed-validator.js';
import { createFeedsStore } from '../state/feeds-store.js';
import { getFeedsPath } from '../state/paths.js';
import type { Feed } from '../types.js';

/**
 * Register the "add" subcommand for subscribing to a podcast RSS feed.
 * Validates the URL format, checks for duplicates, validates the feed
 * has MP3 episodes, then stores the subscription.
 */
export function registerAddCommand(program: Command): void {
  program
    .command('add')
    .description('Subscribe to a podcast RSS feed')
    .argument('<url>', 'RSS feed URL')
    .action(async (url: string) => {
      // 1. Validate URL format
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        console.error(pc.red(`Invalid URL: ${url}`));
        process.exit(1);
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        console.error(pc.red(`Invalid URL protocol: ${parsed.protocol} (only http and https are supported)`));
        process.exit(1);
      }

      // 2. Check for duplicates
      const store = createFeedsStore(getFeedsPath());
      if (store.has(url)) {
        console.error(pc.yellow(`Already subscribed: ${url}`));
        process.exit(1);
      }

      // 3. Validate the feed
      let result: { title: string };
      try {
        result = await validateFeed(url);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(pc.red(message));
        process.exit(1);
      }

      // 4. Store the subscription
      const feed: Feed = {
        url,
        name: result.title,
        addedAt: new Date().toISOString(),
      };
      store.add(feed);

      console.log(pc.green(`Subscribed to "${feed.name}"`));
    });
}
