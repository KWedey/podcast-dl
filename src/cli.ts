#!/usr/bin/env node
import { Command } from 'commander';
import { registerAddCommand } from './commands/add.js';
import { registerRemoveCommand } from './commands/remove.js';
import { registerListCommand } from './commands/list.js';

const program = new Command();

program
  .name('podcast-dl')
  .description('Download podcast episodes from RSS feeds')
  .version('0.1.0');

registerAddCommand(program);
registerRemoveCommand(program);
registerListCommand(program);

program.parseAsync(process.argv);
