import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { downloadEpisode } from '../../src/services/episode-downloader.js';
import { audio, dropMidStream, stallMidStream, startFixtureServer, status } from '../helpers/fixture-server.js';
import { fakeMp3 } from '../helpers/rss.js';
import { createWorkspace, listFiles } from '../helpers/workspace.js';

describe('downloadEpisode', () => {
  it('streams into a temp file and creates the .mp3 only once the body is complete', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const body = fakeMp3('streamed');
    const firstChunk = body.subarray(0, 100);
    const stalled = stallMidStream(body, firstChunk.length);
    server.route('/ep.mp3', stalled.handler);
    const dest = join(ws.downloadsDir, 'show', 'ep.mp3');

    const result = downloadEpisode(server.url('/ep.mp3'), dest);
    await stalled.sent;

    // Bytes reach disk before the response ends (streamed, not buffered), but only under the temp name.
    await vi.waitFor(() => expect(readFileSync(`${dest}.tmp`)).toEqual(firstChunk));
    expect(existsSync(dest)).toBe(false);

    stalled.finish();
    await expect(result).resolves.toEqual({ success: true });
    expect(readFileSync(dest)).toEqual(body);
    expect(await listFiles(ws.downloadsDir)).toEqual(['show/ep.mp3']);
  });

  it('leaves no .mp3 and no temp file when the connection drops mid-body', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const body = fakeMp3('truncated');
    server.route('/ep.mp3', dropMidStream(body, body.length / 2));

    const result = await downloadEpisode(server.url('/ep.mp3'), join(ws.downloadsDir, 'show', 'ep.mp3'));

    expect(result.success).toBe(false);
    expect(await listFiles(ws.downloadsDir)).toEqual([]);
  });

  it('fails with the HTTP status and writes nothing when the server refuses', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    server.route('/ep.mp3', status(503));

    const result = await downloadEpisode(server.url('/ep.mp3'), join(ws.downloadsDir, 'show', 'ep.mp3'));

    expect(result).toEqual({ success: false, error: 'HTTP 503' });
    expect(await listFiles(ws.downloadsDir)).toEqual([]);
  });

  it('reports, rather than throws, when the destination folder cannot be created', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    server.route('/ep.mp3', audio(fakeMp3('blocked')));
    mkdirSync(ws.downloadsDir);
    writeFileSync(join(ws.downloadsDir, 'show'), 'a file where the podcast folder should be');

    const result = await downloadEpisode(server.url('/ep.mp3'), join(ws.downloadsDir, 'show', 'ep.mp3'));

    expect(result.success).toBe(false);
    expect(server.hits('/ep.mp3')).toBe(0);
  });
});
