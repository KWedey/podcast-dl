import fs from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { atomicWriteSync } from '../../src/state/atomic-write.js';
import { createWorkspace, listFiles } from '../helpers/workspace.js';

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
    const before = JSON.stringify({ feed: [{ guid: 'a', status: 'downloaded' }] });
    atomicWriteSync(target, before);

    // Simulate the disk filling up mid-write: half the bytes land, then the write fails.
    const realWriteSync = fs.writeSync;
    const writeSync = vi.spyOn(fs, 'writeSync').mockImplementation((fd, data) => {
      realWriteSync(fd, String(data).slice(0, String(data).length / 2));
      throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    });

    const after = JSON.stringify({ feed: [{ guid: 'a', status: 'downloaded' }, { guid: 'b', status: 'downloaded' }] });
    expect(() => atomicWriteSync(target, after)).toThrow('ENOSPC');
    expect(writeSync).toHaveBeenCalled();

    expect(fs.readFileSync(target, 'utf8')).toBe(before);
    expect(await listFiles(ws.dataDir)).toEqual(['history.json']);
  });
});
