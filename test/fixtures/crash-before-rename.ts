// Usage: crash-before-rename.ts <target> <content>
// Atomically writes <content> to <target>, but SIGKILLs this process at the
// instant the temp file is complete and about to replace <target>.
import fs from 'node:fs';
import { atomicWriteSync } from '../../src/state/atomic-write.js';

const [target, content] = process.argv.slice(2);
fs.renameSync = () => {
  process.kill(process.pid, 'SIGKILL');
};
atomicWriteSync(target, content);
