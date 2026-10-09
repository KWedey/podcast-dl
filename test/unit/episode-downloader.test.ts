import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { downloadEpisode } from '../../src/services/episode-downloader.js';
import {
  audio,
  dropMidStream,
  manualResponse,
  redirect,
  stallMidStream,
  startFixtureServer,
  status,
} from '../helpers/fixture-server.js';
import { fakeMp3 } from '../helpers/rss.js';
import { until } from '../helpers/until.js';
import { createWorkspace, listFiles } from '../helpers/workspace.js';

const sizeOf = (path: string) => (existsSync(path) ? statSync(path).size : 0);

/** Fake only setTimeout/clearTimeout: the stall timer runs on fake time, sockets keep real time. */
function useFakeClock(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  onTestFinished(() => void vi.useRealTimers());
}

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
    await vi.waitFor(() => expect(readFileSync(`${dest}.tmp`)).toEqual(firstChunk), { timeout: 2_000 });
    expect(existsSync(dest)).toBe(false);

    stalled.finish();
    await expect(result).resolves.toEqual({ success: true });
    expect(readFileSync(dest)).toEqual(body);
    expect(await listFiles(ws.downloadsDir)).toEqual(['show/ep.mp3']);
  });

  it('follows tracking redirects to the audio file', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const body = fakeMp3('redirected');
    server.route('/track/ep.mp3', redirect(server.url('/cdn/ep.mp3'), 302));
    server.route('/cdn/ep.mp3', redirect(server.url('/storage/ep.mp3'), 301));
    server.route('/storage/ep.mp3', audio(body));
    const dest = join(ws.downloadsDir, 'show', 'ep.mp3');

    await expect(downloadEpisode(server.url('/track/ep.mp3'), dest)).resolves.toEqual({ success: true });
    expect(readFileSync(dest)).toEqual(body);
  });

  it('leaves no .mp3 and no temp file when the connection drops mid-body', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const body = fakeMp3('truncated');
    server.route('/ep.mp3', dropMidStream(body, body.length / 2));

    const result = await downloadEpisode(server.url('/ep.mp3'), join(ws.downloadsDir, 'show', 'ep.mp3'));

    expect(result).toEqual({ success: false, error: 'terminated' });
    expect(server.hits('/ep.mp3')).toBe(1);
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

  it('clears a partial file left by a killed run, even when this attempt fails', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    server.route('/ep.mp3', status(404));
    const dest = join(ws.downloadsDir, 'show', 'ep.mp3');
    mkdirSync(join(ws.downloadsDir, 'show'), { recursive: true });
    writeFileSync(`${dest}.tmp`, 'half an episode from a run that was killed');

    const result = await downloadEpisode(server.url('/ep.mp3'), dest);

    expect(result).toEqual({ success: false, error: 'HTTP 404' });
    expect(await listFiles(ws.downloadsDir)).toEqual([]);
  });

  it('reports, rather than throws, when the destination folder cannot be created', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    server.route('/ep.mp3', audio(fakeMp3('blocked')));
    mkdirSync(ws.downloadsDir);
    writeFileSync(join(ws.downloadsDir, 'show'), 'a file where the podcast folder should be');

    const result = await downloadEpisode(server.url('/ep.mp3'), join(ws.downloadsDir, 'show', 'ep.mp3'));

    expect(result).toEqual({ success: false, error: expect.stringMatching(/EEXIST|ENOTDIR/) });
    expect(server.hits('/ep.mp3')).toBe(0);
  });
});

describe('downloadEpisode stall timeout', () => {
  it('keeps a slow download going for as long as bytes keep arriving', async () => {
    useFakeClock();
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const body = fakeMp3('slow line');
    const response = manualResponse();
    server.route('/ep.mp3', response.handler);
    const dest = join(ws.downloadsDir, 'show', 'ep.mp3');

    const result = downloadEpisode(server.url('/ep.mp3'), dest);
    await response.requested;
    response.head(body.length);
    // 12 pieces, each followed by 50 s of silence: 10 minutes in all, never 60 s without data.
    const pieceSize = Math.ceil(body.length / 12);
    for (let sent = 0; sent < body.length; sent += pieceSize) {
      const piece = body.subarray(sent, sent + pieceSize);
      await response.write(piece);
      await until(() => sizeOf(`${dest}.tmp`) === sent + piece.length);
      vi.advanceTimersByTime(50_000);
    }
    response.end();

    await expect(result).resolves.toEqual({ success: true });
    expect(readFileSync(dest)).toEqual(body);
  });

  it('gives up when no bytes arrive for 60 s mid-download, leaving no files', async () => {
    useFakeClock();
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const body = fakeMp3('stalls');
    const response = manualResponse();
    server.route('/ep.mp3', response.handler);
    const dest = join(ws.downloadsDir, 'show', 'ep.mp3');

    const result = downloadEpisode(server.url('/ep.mp3'), dest);
    await response.requested;
    response.head(body.length);
    await response.write(body.subarray(0, 100));
    await until(() => sizeOf(`${dest}.tmp`) === 100);
    vi.advanceTimersByTime(60_000);

    await expect(result).resolves.toEqual({ success: false, error: 'Download stalled: no data for 60 s' });
    expect(await listFiles(ws.downloadsDir)).toEqual([]);
  });

  it('gives up when the server accepts the request but never answers', async () => {
    useFakeClock();
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const response = manualResponse();
    server.route('/ep.mp3', response.handler);

    const result = downloadEpisode(server.url('/ep.mp3'), join(ws.downloadsDir, 'show', 'ep.mp3'));
    await response.requested;
    vi.advanceTimersByTime(60_000);

    await expect(result).resolves.toEqual({ success: false, error: 'Download stalled: no data for 60 s' });
  });
});
