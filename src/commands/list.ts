import { Command } from 'commander';
import pc from 'picocolors';
import { createFeedsStore } from '../state/feeds-store.js';
import { getFeedsPath } from '../state/paths.js';

/**
 * Register the "list" subcommand for displaying subscribed podcast feeds.
 * Shows feeds sorted alphabetically by name, or a hint when empty.
 */
export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List subscribed podcast feeds')
    .action(() => {
      const store = createFeedsStore(getFeedsPath());
      const feeds = store.getAll();

      if (feeds.length === 0) {
        console.log(
          pc.yellow(
            'No feeds subscribed. Use "podcast-dl add <url>" to get started.',
          ),
        );
        return;
      }

      // Sort alphabetically by name
      feeds.sort((a, b) => a.name.localeCompare(b.name));

      const lines: string[] = [];
      for (const feed of feeds) {
        lines.push(`${pc.cyan(feed.name)}`);
        lines.push(`${pc.dim(feed.url)}`);
        lines.push('');
      }

      // Remove trailing blank line
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }

      console.log(lines.join('\n'));
    });
}
