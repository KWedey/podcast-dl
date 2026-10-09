import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli, startCli, type CliResult } from '../helpers/cli.js';
import {
  audio,
  dropMidStream,
  sequence,
  stallMidStream,
  startFixtureServer,
  status,
} from '../helpers/fixture-server.js';
import { dailyEpisode, publishPodcast } from '../helpers/rss.js';
import {
  createWorkspace,
  expectStateIntact,
  listFiles,
  readHistory,
  subscribe,
  type Workspace,
} from '../helpers/workspace.js';

const SHOW = 'The Test Show';

/** Where the CLI saves dailyEpisode(n) of SHOW, relative to downloads/. */
const fileOf = (n: number) => `the-test-show/2024-01-${String(n).padStart(2, '0')}_Episode ${n}.mp3`;

/** Run `download`, then check state was left consistent, as it must be after every run. */
async function download(ws: Workspace): Promise<CliResult> {
  const result = await runCli(['download'], ws.dir);
  await expectStateIntact(ws);
  return result;
}

function summaryOf(stdout: string) {
  const count = (label: string) => Number(stdout.match(new RegExp(`^\\s+${label}:\\s+(\\d+)$`, 'm'))?.[1]);
  return { downloaded: count('Downloaded'), skipped: count('Skipped'), failed: count('Failed') };
}

describe('podcast-dl download', () => {
  it('explains how to get started when there are no subscriptions', async () => {
    const ws = await createWorkspace();

    const result = await download(ws);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('No feeds subscribed. Use "podcast-dl add <url>" to get started.');
  });

  it('saves each episode to downloads/<podcast>/<date>_<title>.mp3 with the bytes the host served', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const episodes = [dailyEpisode(1), dailyEpisode(2)];
    subscribe(ws, publishPodcast(server, SHOW, episodes), SHOW);

    const result = await download(ws);

    expect(result.code, result.stderr).toBe(0);
    expect(await listFiles(ws.downloadsDir)).toEqual([
      'the-test-show/2024-01-01_Episode 1.mp3',
      'the-test-show/2024-01-02_Episode 2.mp3',
    ]);
    expect(readFileSync(join(ws.downloadsDir, fileOf(1)))).toEqual(episodes[0].body);
    expect(readFileSync(join(ws.downloadsDir, fileOf(2)))).toEqual(episodes[1].body);
  });

  it('names folders and files FAT32-safely when the feed uses hostile titles', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const podcast = 'Late Night: Q&A / Talk?';
    const episode = { ...dailyEpisode(1), title: 'Ep 1: "Why?" <Live> | 50/50 *' };
    subscribe(ws, publishPodcast(server, podcast, [episode]), podcast);

    const result = await download(ws);

    expect(result.code, result.stderr).toBe(0);
    const files = await listFiles(ws.downloadsDir);
    expect(files).toEqual(['late-night-qa-talk/2024-01-01_Ep 1- -Why- -Live- - 50-50 -.mp3']);
    for (const segment of files[0].split('/')) {
      expect(segment).not.toMatch(/[<>:"/\\|?*\u0000-\u001f]/);
    }
  });

  it('takes only the 5 newest episodes, ranked by pubDate rather than feed order', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const episodes = [4, 1, 7, 2, 6, 3, 5].map(dailyEpisode);
    subscribe(ws, publishPodcast(server, SHOW, episodes), SHOW);

    const result = await download(ws);

    expect(result.code, result.stderr).toBe(0);
    expect(await listFiles(ws.downloadsDir)).toEqual([3, 4, 5, 6, 7].map(fileOf));
    expect(server.hits(dailyEpisode(1).audioPath)).toBe(0);
    expect(server.hits(dailyEpisode(2).audioPath)).toBe(0);
  });

  it('downloads oldest-first, so files arrive in listening order', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    subscribe(ws, publishPodcast(server, SHOW, [2, 3, 1].map(dailyEpisode)), SHOW);

    await download(ws);

    expect(server.requests.filter((path) => path.startsWith('/audio/'))).toEqual(
      [1, 2, 3].map((n) => dailyEpisode(n).audioPath),
    );
  });

  it('never re-downloads an episode, even after the listener deletes the file', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const episodes = [1, 2, 3].map(dailyEpisode);
    subscribe(ws, publishPodcast(server, SHOW, episodes), SHOW);
    expect((await download(ws)).code).toBe(0);
    rmSync(ws.downloadsDir, { recursive: true });

    const result = await download(ws);

    expect(result.code, result.stderr).toBe(0);
    expect(summaryOf(result.stdout)).toEqual({ downloaded: 0, skipped: 3, failed: 0 });
    expect(await listFiles(ws.downloadsDir)).toEqual([]);
    for (const ep of episodes) expect(server.hits(ep.audioPath)).toBe(1);
  });

  it('fetches only the newly published episode on the next run', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const feedUrl = publishPodcast(server, SHOW, [1, 2, 3].map(dailyEpisode));
    subscribe(ws, feedUrl, SHOW);
    await download(ws);
    publishPodcast(server, SHOW, [1, 2, 3, 4].map(dailyEpisode));

    const result = await download(ws);

    expect(result.code, result.stderr).toBe(0);
    expect(summaryOf(result.stdout)).toEqual({ downloaded: 1, skipped: 3, failed: 0 });
    expect(await listFiles(ws.downloadsDir)).toEqual([1, 2, 3, 4].map(fileOf));
    for (const n of [1, 2, 3, 4]) expect(server.hits(dailyEpisode(n).audioPath)).toBe(1);
  });

  it('works through a back catalogue at most 5 per run, then has nothing left to fetch', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    subscribe(ws, publishPodcast(server, SHOW, [1, 2, 3, 4, 5, 6, 7].map(dailyEpisode)), SHOW);

    expect(summaryOf((await download(ws)).stdout).downloaded).toBe(5);
    expect(await listFiles(ws.downloadsDir)).toEqual([3, 4, 5, 6, 7].map(fileOf));

    expect(summaryOf((await download(ws)).stdout).downloaded).toBe(2);
    expect(await listFiles(ws.downloadsDir)).toEqual([1, 2, 3, 4, 5, 6, 7].map(fileOf));

    const third = await download(ws);
    expect(third.code, third.stderr).toBe(0);
    expect(summaryOf(third.stdout)).toEqual({ downloaded: 0, skipped: 7, failed: 0 });
    expect(server.requests.filter((path) => path.startsWith('/audio/'))).toHaveLength(7);
  });

  it('ranks undated episodes behind dated ones and names them unknown-date_<title>.mp3', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const bonus = { ...dailyEpisode(9), title: 'Bonus', pubDate: undefined };
    subscribe(ws, publishPodcast(server, SHOW, [bonus, ...[1, 2, 3, 4, 5].map(dailyEpisode)]), SHOW);

    await download(ws);
    expect(await listFiles(ws.downloadsDir)).toEqual([1, 2, 3, 4, 5].map(fileOf));

    await download(ws);
    expect(await listFiles(ws.downloadsDir)).toContain('the-test-show/unknown-date_Bonus.mp3');
  });

  it('retries a failed download once within the same run', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const episode = dailyEpisode(1);
    subscribe(ws, publishPodcast(server, SHOW, [episode]), SHOW);
    server.route(episode.audioPath, sequence(status(500), audio(episode.body)));

    const result = await download(ws);

    expect(result.code, result.stderr).toBe(0);
    expect(server.hits(episode.audioPath)).toBe(2);
    expect(readFileSync(join(ws.downloadsDir, fileOf(1)))).toEqual(episode.body);
  });

  it('leaves no partial .mp3 when a connection drops mid-download, and retries it next run', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const episodes = [1, 2, 3].map(dailyEpisode);
    const feedUrl = publishPodcast(server, SHOW, episodes);
    subscribe(ws, feedUrl, SHOW);
    const flaky = episodes[1];
    const truncated = dropMidStream(flaky.body, flaky.body.length / 2);
    server.route(flaky.audioPath, sequence(truncated, truncated, audio(flaky.body)));

    const failedRun = await download(ws);

    expect(failedRun.code).toBe(1);
    expect(failedRun.stdout).toContain(`- ${SHOW}: Episode 2`);
    expect(await listFiles(ws.downloadsDir)).toEqual([fileOf(1), fileOf(3)]);
    expect((await readHistory(ws))[feedUrl]).toContainEqual({ guid: flaky.guid, status: 'failed' });

    const retryRun = await download(ws);

    expect(retryRun.code, retryRun.stderr).toBe(0);
    expect(summaryOf(retryRun.stdout)).toEqual({ downloaded: 1, skipped: 2, failed: 0 });
    expect(readFileSync(join(ws.downloadsDir, fileOf(2)))).toEqual(flaky.body);
    expect((await readHistory(ws))[feedUrl]).toContainEqual({ guid: flaky.guid, status: 'downloaded' });
  });

  it('reports a feed it cannot fetch and still downloads the other feeds', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    server.route('/broken.xml', status(500));
    subscribe(ws, server.url('/broken.xml'), 'Alpha Broken');
    subscribe(ws, publishPodcast(server, 'Beta Works', [dailyEpisode(1)], '/beta.xml'), 'Beta Works');

    const result = await download(ws);

    expect(result.stdout).toContain('Error fetching feed: HTTP 500 fetching feed');
    expect(await listFiles(ws.downloadsDir)).toEqual(['beta-works/2024-01-01_Episode 1.mp3']);
  });

  it('fails an episode it cannot save without aborting the rest of the run', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    subscribe(ws, publishPodcast(server, 'Alpha Blocked', [dailyEpisode(1)], '/alpha.xml'), 'Alpha Blocked');
    subscribe(ws, publishPodcast(server, 'Beta Works', [dailyEpisode(2)], '/beta.xml'), 'Beta Works');
    mkdirSync(ws.downloadsDir);
    writeFileSync(join(ws.downloadsDir, 'alpha-blocked'), 'a file where the podcast folder should be');

    const result = await download(ws);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('- Alpha Blocked: Episode 1');
    expect(await listFiles(ws.downloadsDir)).toEqual(['alpha-blocked', 'beta-works/2024-01-02_Episode 2.mp3']);
  });

  it('survives being killed mid-download: state stays consistent and the next run finishes the job', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const episodes = [1, 2, 3].map(dailyEpisode);
    const feedUrl = publishPodcast(server, SHOW, episodes);
    subscribe(ws, feedUrl, SHOW);
    const third = episodes[2];
    const stalled = stallMidStream(third.body, 100);
    server.route(third.audioPath, sequence(stalled.handler, audio(third.body)));

    const cli = startCli(['download'], ws.dir);
    await stalled.sent;
    cli.child.kill('SIGKILL');
    expect((await cli.done).signal).toBe('SIGKILL');

    await expectStateIntact(ws);
    const mp3s = (await listFiles(ws.downloadsDir)).filter((f) => f.endsWith('.mp3'));
    expect(mp3s).toEqual([fileOf(1), fileOf(2)]);
    expect(await readHistory(ws)).toEqual({
      [feedUrl]: [
        { guid: episodes[0].guid, status: 'downloaded' },
        { guid: episodes[1].guid, status: 'downloaded' },
      ],
    });

    const rerun = await download(ws);

    expect(rerun.code, rerun.stderr).toBe(0);
    expect(await listFiles(ws.downloadsDir)).toEqual([fileOf(1), fileOf(2), fileOf(3)]);
    expect(readFileSync(join(ws.downloadsDir, fileOf(3)))).toEqual(third.body);
    expect(server.hits(episodes[0].audioPath)).toBe(1);
  });
});
