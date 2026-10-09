import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { atomicWriteSync } from '../../src/state/atomic-write.js';
import { runTypeScript } from '../helpers/cli.js';
import { createWorkspace, listFiles } from '../helpers/workspace.js';

const CRASH_BEFORE_RENAME = new URL('../fixtures/crash-before-rename.ts', import.meta.url);

it('keeps the previous state file when the process is killed just before the swap', async () => {
  const ws = await createWorkspace();
  const target = join(ws.dataDir, 'history.json');
  const before = JSON.stringify({ feed: [{ guid: 'a', status: 'downloaded' }] });
  const after = JSON.stringify({ feed: [{ guid: 'a', status: 'downloaded' }, { guid: 'b', status: 'downloaded' }] });
  atomicWriteSync(target, before);

  const crashed = await runTypeScript(CRASH_BEFORE_RENAME, [target, after], ws.dir);

  expect(crashed.signal).toBe('SIGKILL');
  expect(readFileSync(target, 'utf8')).toBe(before);
  // The new content was written in full, just never swapped in.
  const [tempFile, ...rest] = (await listFiles(ws.dataDir)).filter((f) => f !== 'history.json');
  expect(rest).toEqual([]);
  expect(readFileSync(join(ws.dataDir, tempFile), 'utf8')).toBe(after);
});
