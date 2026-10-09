#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { registerAddCommand } from './commands/add.js';
import { registerRemoveCommand } from './commands/remove.js';
import { registerListCommand } from './commands/list.js';
import { registerDownloadCommand } from './commands/download.js';
import { StateFileError } from './state/state-file.js';

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
  // Anything but a state file problem is a bug, and its stack is what traces it.
  const report =
    error instanceof StateFileError ? error.message : error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(pc.red(report));
  process.exit(1);
});
