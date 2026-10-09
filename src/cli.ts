#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { registerAddCommand } from './commands/add.js';
import { registerRemoveCommand } from './commands/remove.js';
import { registerListCommand } from './commands/list.js';
import { registerDownloadCommand } from './commands/download.js';

const program = new Command();

program
  .name('podcast-dl')
  .description('Download podcast episodes from RSS feeds')
  .version('0.1.0');

registerAddCommand(program);
registerRemoveCommand(program);
registerListCommand(program);
registerDownloadCommand(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(pc.red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
