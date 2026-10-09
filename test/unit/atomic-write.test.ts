import fs from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { atomicWriteSync } from '../../src/state/atomic-write.js';
import { runTypeScript } from '../helpers/cli.js';
import { createWorkspace, listFiles } from '../helpers/workspace.js';

const CRASH_BEFORE_RENAME = new URL('../fixtures/crash-before-rename.ts', import.meta.url);

const OLD = JSON.stringify({ feed: [{ guid: 'a', status: 'downloaded' }] });
const NEW = JSON.stringify({ feed: [{ guid: 'a', status: 'downloaded' }, { guid: 'b', status: 'downloaded' }] });

describe('atomicWriteSync', () => {
  it('creates missing parent directories', async () => {
    const ws = await createWorkspace();
    const target = join(ws.dir, 'nested', 'deeper', 'state.json');

    atomicWriteSync(target, '{"ok":true}');

    expect(fs.readFileSync(target, 'utf8')).toBe('{"ok":true}');
  });

  it('keeps the previous content and leaves no temp file when a write dies part-way', async () => {
    const ws = await createWorkspace();
    const target = join(ws.dataDir, 'history.json');
    atomicWriteSync(target, OLD);

    // The disk fills mid-write: half the bytes land, then the write fails.
    // write-file-atomic looks up fs.writeSync at call time, so the spy reaches it.
    const realWriteSync = fs.writeSync;
    const writeSync = vi.spyOn(fs, 'writeSync').mockImplementation((fd, data) => {
      realWriteSync(fd, String(data).slice(0, String(data).length / 2));
      throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    });

    expect(() => atomicWriteSync(target, NEW)).toThrow('ENOSPC');
    expect(writeSync).toHaveBeenCalled();

    expect(fs.readFileSync(target, 'utf8')).toBe(OLD);
    expect(await listFiles(ws.dataDir)).toEqual(['history.json']);
  });

  it('keeps the previous content when the process is killed just before the swap', async () => {
    const ws = await createWorkspace();
    const target = join(ws.dataDir, 'history.json');
    atomicWriteSync(target, OLD);

    const crashed = await runTypeScript(CRASH_BEFORE_RENAME, [target, NEW], ws.dir);

    expect(crashed.signal).toBe('SIGKILL');
    expect(fs.readFileSync(target, 'utf8')).toBe(OLD);
    // The new content was written in full, just never swapped in.
    const [tempFile, ...rest] = (await listFiles(ws.dataDir)).filter((f) => f !== 'history.json');
    expect(rest).toEqual([]);
    expect(fs.readFileSync(join(ws.dataDir, tempFile), 'utf8')).toBe(NEW);
  });
});
