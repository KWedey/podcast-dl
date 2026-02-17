import { Command } from 'commander';
import pc from 'picocolors';
import { createFeedsStore } from '../state/feeds-store.js';
import { getFeedsPath } from '../state/paths.js';

/**
 * Register the "remove" subcommand for unsubscribing from a podcast feed.
 * Matches by exact URL or case-insensitive podcast name.
 */
export function registerRemoveCommand(program: Command): void {
  program
    .command('remove')
    .description('Unsubscribe from a podcast feed')
    .argument('<url-or-name>', 'Feed URL or podcast name')
    .action((identifier: string) => {
      const store = createFeedsStore(getFeedsPath());
      const feeds = store.getAll();

      // Try exact URL match first, then case-insensitive name match
      const match =
        feeds.find((f) => f.url === identifier) ??
        feeds.find(
          (f) => f.name.toLowerCase() === identifier.toLowerCase(),
        );

      if (!match) {
        console.error(pc.red(`No feed found matching '${identifier}'`));
        process.exit(1);
      }

      store.remove(match.url);
      console.log(pc.green(`Unsubscribed from "${match.name}"`));
    });
}
