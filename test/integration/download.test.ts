import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { expectSuccess, runCli, startCli, type ProcessResult } from '../helpers/cli.js';
import {
  audio,
  deadHostUrl,
  xml,
  dropMidStream,
  sequence,
  stallMidStream,
  startFixtureServer,
  status,
} from '../helpers/fixture-server.js';
import { atomFeed, dailyEpisode, episode, publishPodcast } from '../helpers/rss.js';
import {
  createWorkspace,
  expectStateIntact,
  listFiles,
  readHistory,
  subscribe,
  type Workspace,
} from '../helpers/workspace.js';

const SHOW = 'The Test Show';
const SHOW_DIR = 'the-test-show';

/** Where the CLI saves dailyEpisode(n) of SHOW, relative to downloads/. */
const fileOf = (n: number) => `${SHOW_DIR}/2024-01-${String(n).padStart(2, '0')}_Episode ${n}.mp3`;

/** Feed, title, GUID and date orders all disagree, and the dates cross a year boundary. */
const CATALOGUE = [
  episode('2024-01-02', 'Alpha', 'guid-3'),
  episode('2023-12-30', 'Zulu', 'guid-6'),
  episode('2024-02-01', 'Charlie', 'guid-1'),
  episode('2024-01-01', 'Yankee', 'guid-7'),
  episode('2023-12-31', 'Echo', 'guid-2'),
  episode('2024-01-10', 'Mike', 'guid-5'),
  episode('2024-01-03', 'Bravo', 'guid-4'),
];

/** Run `download`, then check the state files, which must hold after every completed run. */
async function runDownloadAndCheckState(ws: Workspace, env?: NodeJS.ProcessEnv): Promise<ProcessResult> {
  const result = await runCli(['download'], ws.dir, env);
  await expectStateIntact(ws);
  return result;
}

/** The counts printed in the end-of-run summary. */
function summaryOf(stdout: string) {
  const start = stdout.lastIndexOf('\nSummary\n');
  if (start === -1) throw new Error(`No summary in output:\n${stdout}`);
  const summary = stdout.slice(start);
  const count = (label: string) => {
    const match = summary.match(new RegExp(`^\\s+${label}:\\s+(\\d+)$`, 'm'));
    if (!match) throw new Error(`No "${label}" count in summary:\n${summary}`);
    return Number(match[1]);
  };
  return { downloaded: count('Downloaded'), skipped: count('Skipped'), failed: count('Failed') };
}

/** Same day, different GUIDs, and identical once their titles are cut to 80 characters. */
const LONG_TITLE = 'An Interview So Long That Its Title Runs Right Past The Eighty Character Filename Cut';
const PARTS = [episode('2024-01-01', `${LONG_TITLE} (Part 1)`), episode('2024-01-01', `${LONG_TITLE} (Part 2)`)];
const PARTS_BASE = `${SHOW_DIR}/2024-01-01_An Interview So Long That Its Title Runs Right Past The Eighty Character Filenam`;

const audioRequests = (requests: readonly string[]) => requests.filter((path) => path.startsWith('/audio/'));

describe('podcast-dl download', () => {
  it('explains how to get started when there are no subscriptions', async () => {
    const ws = await createWorkspace();

    const result = await runDownloadAndCheckState(ws);

    expectSuccess(result);
    expect(result.stdout).toContain('No feeds subscribed. Use "podcast-dl add <url>" to get started.');
  });

  it('saves each episode to downloads/<podcast>/<date>_<title>.mp3 with the bytes the host served', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const episodes = [dailyEpisode(1), dailyEpisode(2)];
    subscribe(ws, publishPodcast(server, SHOW, episodes), SHOW);

    const result = await runDownloadAndCheckState(ws);

    expectSuccess(result);
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
    const hostile = { ...dailyEpisode(1), title: 'Ep 1: "Why?" <Live> | 50/50 *' };
    subscribe(ws, publishPodcast(server, podcast, [hostile]), podcast);

    const result = await runDownloadAndCheckState(ws);

    expectSuccess(result);
    expect(await listFiles(ws.downloadsDir)).toEqual(['late-night-qa-talk/2024-01-01_Ep 1- -Why- -Live- - 50-50 -.mp3']);
  });

  it('cuts long titles to 80 characters without splitting an emoji', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    // The microphone emoji is two UTF-16 code units at positions 79-80.
    const long = { ...dailyEpisode(1), title: `${'a'.repeat(79)}🎙 Interview with a guest` };
    subscribe(ws, publishPodcast(server, SHOW, [long]), SHOW);

    const result = await runDownloadAndCheckState(ws);

    expectSuccess(result);
    expect(await listFiles(ws.downloadsDir)).toEqual([`${SHOW_DIR}/2024-01-01_${'a'.repeat(79)}🎙.mp3`]);
  });

  it('keeps long multi-byte titles within the 255-byte filename limit of Linux filesystems', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    subscribe(ws, publishPodcast(server, SHOW, [{ ...dailyEpisode(1), title: '語'.repeat(90) }]), SHOW);

    const result = await runDownloadAndCheckState(ws);

    expectSuccess(result);
    const [file] = await listFiles(ws.downloadsDir);
    expect(file).toBe(`${SHOW_DIR}/2024-01-01_${'語'.repeat(66)}.mp3`);
    expect(Buffer.byteLength(`${file.split('/')[1]}.tmp`)).toBeLessThanOrEqual(255);
  });

  it('keeps both episodes when their names collide, each under a short hash of its GUID', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    subscribe(ws, publishPodcast(server, SHOW, PARTS), SHOW);

    const result = await runDownloadAndCheckState(ws);

    expectSuccess(result);
    expect(await listFiles(ws.downloadsDir)).toEqual([`${PARTS_BASE} (54687b).mp3`, `${PARTS_BASE} (8caf6a).mp3`]);
    expect(readFileSync(join(ws.downloadsDir, `${PARTS_BASE} (54687b).mp3`))).toEqual(PARTS[0].body);
    expect(readFileSync(join(ws.downloadsDir, `${PARTS_BASE} (8caf6a).mp3`))).toEqual(PARTS[1].body);
  });

  it('rewrites the same files instead of duplicating them when history is lost', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const episodes = [dailyEpisode(1), ...PARTS];
    subscribe(ws, publishPodcast(server, SHOW, episodes), SHOW);
    expectSuccess(await runDownloadAndCheckState(ws));
    const firstRunFiles = await listFiles(ws.downloadsDir);
    rmSync(ws.historyPath);

    const result = await runDownloadAndCheckState(ws);

    expectSuccess(result);
    expect(await listFiles(ws.downloadsDir)).toEqual(firstRunFiles);
    expect(episodes.map((ep) => server.hits(ep.audioPath))).toEqual([2, 2, 2]);
  });

  it('downloads, and later skips, an item the feed lists twice only once', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const repeated = dailyEpisode(1);
    subscribe(ws, publishPodcast(server, SHOW, [repeated, repeated]), SHOW);

    const first = await runDownloadAndCheckState(ws);
    expectSuccess(first);
    expect(summaryOf(first.stdout)).toEqual({ downloaded: 1, skipped: 0, failed: 0 });
    expect(await listFiles(ws.downloadsDir)).toEqual([fileOf(1)]);

    const second = await runDownloadAndCheckState(ws);
    expectSuccess(second);
    expect(summaryOf(second.stdout)).toEqual({ downloaded: 0, skipped: 1, failed: 0 });
    expect(server.hits(repeated.audioPath)).toBe(1);
  });

  it('dates files by the UTC day of the pubDate, whatever the machine time zone', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    // 23:30 on 1 Jan in New York is 04:30 on 2 Jan UTC, and still 1 Jan in UTC-12.
    const lateNight = { ...dailyEpisode(1), pubDate: 'Mon, 01 Jan 2024 23:30:00 -0500' };
    subscribe(ws, publishPodcast(server, SHOW, [lateNight]), SHOW);

    const result = await runDownloadAndCheckState(ws, { TZ: 'Etc/GMT+12' });

    expectSuccess(result);
    expect(await listFiles(ws.downloadsDir)).toEqual([`${SHOW_DIR}/2024-01-02_Episode 1.mp3`]);
  });

  it('takes only the 5 newest episodes, ranked by pubDate alone', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    subscribe(ws, publishPodcast(server, SHOW, CATALOGUE), SHOW);

    const result = await runDownloadAndCheckState(ws);

    expectSuccess(result);
    expect(await listFiles(ws.downloadsDir)).toEqual([
      `${SHOW_DIR}/2024-01-01_Yankee.mp3`,
      `${SHOW_DIR}/2024-01-02_Alpha.mp3`,
      `${SHOW_DIR}/2024-01-03_Bravo.mp3`,
      `${SHOW_DIR}/2024-01-10_Mike.mp3`,
      `${SHOW_DIR}/2024-02-01_Charlie.mp3`,
    ]);
  });

  it('downloads oldest-first, so files arrive in listening order', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    subscribe(ws, publishPodcast(server, SHOW, CATALOGUE), SHOW);

    expectSuccess(await runDownloadAndCheckState(ws));

    expect(audioRequests(server.requests)).toEqual([
      '/audio/yankee.mp3',
      '/audio/alpha.mp3',
      '/audio/bravo.mp3',
      '/audio/mike.mp3',
      '/audio/charlie.mp3',
    ]);
  });

  it('never re-downloads an episode, even after the listener deletes the file', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const episodes = [1, 2, 3].map(dailyEpisode);
    subscribe(ws, publishPodcast(server, SHOW, episodes), SHOW);
    expectSuccess(await runDownloadAndCheckState(ws));
    rmSync(ws.downloadsDir, { recursive: true });

    const result = await runDownloadAndCheckState(ws);

    expectSuccess(result);
    expect(summaryOf(result.stdout)).toEqual({ downloaded: 0, skipped: 3, failed: 0 });
    expect(await listFiles(ws.downloadsDir)).toEqual([]);
    expect(episodes.map((ep) => server.hits(ep.audioPath))).toEqual([1, 1, 1]);
  });

  it('fetches only the newly published episode on the next run', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    subscribe(ws, publishPodcast(server, SHOW, [1, 2, 3].map(dailyEpisode)), SHOW);
    expectSuccess(await runDownloadAndCheckState(ws));
    const episodes = [1, 2, 3, 4].map(dailyEpisode);
    publishPodcast(server, SHOW, episodes);

    const result = await runDownloadAndCheckState(ws);

    expectSuccess(result);
    expect(summaryOf(result.stdout)).toEqual({ downloaded: 1, skipped: 3, failed: 0 });
    expect(await listFiles(ws.downloadsDir)).toEqual([1, 2, 3, 4].map(fileOf));
    expect(episodes.map((ep) => server.hits(ep.audioPath))).toEqual([1, 1, 1, 1]);
  });

  it('works through a back catalogue at most 5 per run, then has nothing left to fetch', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    subscribe(ws, publishPodcast(server, SHOW, [1, 2, 3, 4, 5, 6, 7].map(dailyEpisode)), SHOW);

    const first = await runDownloadAndCheckState(ws);
    expectSuccess(first);
    expect(summaryOf(first.stdout).downloaded).toBe(5);
    expect(await listFiles(ws.downloadsDir)).toEqual([3, 4, 5, 6, 7].map(fileOf));

    const second = await runDownloadAndCheckState(ws);
    expectSuccess(second);
    expect(summaryOf(second.stdout).downloaded).toBe(2);
    expect(await listFiles(ws.downloadsDir)).toEqual([1, 2, 3, 4, 5, 6, 7].map(fileOf));

    const third = await runDownloadAndCheckState(ws);
    expectSuccess(third);
    expect(summaryOf(third.stdout)).toEqual({ downloaded: 0, skipped: 7, failed: 0 });
    expect(audioRequests(server.requests)).toHaveLength(7);
  });

  it('ranks undated episodes behind dated ones and names them unknown-date_<title>.mp3', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const bonus = { ...episode('2024-01-09', 'Bonus'), pubDate: undefined };
    subscribe(ws, publishPodcast(server, SHOW, [bonus, ...[1, 2, 3, 4, 5].map(dailyEpisode)]), SHOW);

    expectSuccess(await runDownloadAndCheckState(ws));
    expect(await listFiles(ws.downloadsDir)).toEqual([1, 2, 3, 4, 5].map(fileOf));

    expectSuccess(await runDownloadAndCheckState(ws));
    expect(await listFiles(ws.downloadsDir)).toEqual([...[1, 2, 3, 4, 5].map(fileOf), `${SHOW_DIR}/unknown-date_Bonus.mp3`]);
  });

  it('retries a failed download once within the same run', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const flaky = dailyEpisode(1);
    server.route(flaky.audioPath, sequence(status(500), audio(flaky.body)));
    subscribe(ws, publishPodcast(server, SHOW, [flaky]), SHOW);

    const result = await runDownloadAndCheckState(ws);

    expectSuccess(result);
    expect(server.hits(flaky.audioPath)).toBe(2);
    expect(readFileSync(join(ws.downloadsDir, fileOf(1)))).toEqual(flaky.body);
  });

  it('leaves no partial .mp3 when a connection drops mid-download, and retries it next run', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const episodes = [1, 2, 3].map(dailyEpisode);
    const flaky = episodes[1];
    const truncated = dropMidStream(flaky.body, flaky.body.length / 2);
    server.route(flaky.audioPath, sequence(truncated, truncated, audio(flaky.body)));
    const feedUrl = publishPodcast(server, SHOW, episodes);
    subscribe(ws, feedUrl, SHOW);

    const failedRun = await runDownloadAndCheckState(ws);

    expect(failedRun.code).toBe(1);
    expect(failedRun.stdout).toContain(`- ${SHOW}: Episode 2`);
    expect(summaryOf(failedRun.stdout)).toEqual({ downloaded: 2, skipped: 0, failed: 1 });
    expect(await listFiles(ws.downloadsDir)).toEqual([fileOf(1), fileOf(3)]);
    expect((await readHistory(ws))[feedUrl]).toContainEqual({ guid: flaky.guid, status: 'failed' });

    const retryRun = await runDownloadAndCheckState(ws);

    expectSuccess(retryRun);
    expect(summaryOf(retryRun.stdout)).toEqual({ downloaded: 1, skipped: 2, failed: 0 });
    expect(readFileSync(join(ws.downloadsDir, fileOf(2)))).toEqual(flaky.body);
    expect((await readHistory(ws))[feedUrl]).toContainEqual({ guid: flaky.guid, status: 'downloaded' });
  });

  it('reports a feed it cannot fetch, still downloads the others, and exits 1', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    server.route('/broken.xml', status(500));
    subscribe(ws, server.url('/broken.xml'), 'Alpha Broken');
    subscribe(ws, publishPodcast(server, 'Beta Works', [dailyEpisode(1)], '/beta.xml'), 'Beta Works');

    const result = await runDownloadAndCheckState(ws);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('Error fetching feed: HTTP 500 fetching feed');
    expect(result.stdout).toMatch(/^\s+Feeds failed:\s+1$/m);
    expect(await listFiles(ws.downloadsDir)).toEqual(['beta-works/2024-01-01_Episode 1.mp3']);
  });

  it('fails a subscribed feed that has switched to a format it cannot read', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    server.route('/feed.xml', xml(atomFeed(SHOW, server.url('/audio/episode-1.mp3'))));
    subscribe(ws, server.url('/feed.xml'), SHOW);

    const result = await runDownloadAndCheckState(ws);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('Error fetching feed: Only RSS feeds are supported (got atom)');
  });

  it('exits 1 with a connection hint when no feed can be reached', async () => {
    const ws = await createWorkspace();
    subscribe(ws, await deadHostUrl('/alpha.xml'), 'Alpha');
    subscribe(ws, await deadHostUrl('/beta.xml'), 'Beta');

    const result = await runDownloadAndCheckState(ws);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('No feeds could be reached -- check your connection');
  });

  it('fails an episode it cannot save without aborting the run, and retries it next run', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const blockedFeed = publishPodcast(server, 'Alpha Blocked', [dailyEpisode(1)], '/alpha.xml');
    subscribe(ws, blockedFeed, 'Alpha Blocked');
    subscribe(ws, publishPodcast(server, 'Beta Works', [dailyEpisode(2)], '/beta.xml'), 'Beta Works');
    mkdirSync(ws.downloadsDir);
    const blocker = join(ws.downloadsDir, 'alpha-blocked');
    writeFileSync(blocker, 'a file where the podcast folder should be');

    const blockedRun = await runDownloadAndCheckState(ws);

    expect(blockedRun.code).toBe(1);
    expect(blockedRun.stdout).toContain('- Alpha Blocked: Episode 1');
    expect(await listFiles(ws.downloadsDir)).toEqual(['alpha-blocked', 'beta-works/2024-01-02_Episode 2.mp3']);
    expect((await readHistory(ws))[blockedFeed]).toEqual([{ guid: dailyEpisode(1).guid, status: 'failed' }]);

    rmSync(blocker);
    const retryRun = await runDownloadAndCheckState(ws);

    expectSuccess(retryRun);
    expect(await listFiles(ws.downloadsDir)).toEqual([
      'alpha-blocked/2024-01-01_Episode 1.mp3',
      'beta-works/2024-01-02_Episode 2.mp3',
    ]);
    expect((await readHistory(ws))[blockedFeed]).toEqual([{ guid: dailyEpisode(1).guid, status: 'downloaded' }]);
  });

  it('survives being killed mid-download: state stays consistent and the next run finishes the job', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    const episodes = [1, 2, 3].map(dailyEpisode);
    const third = episodes[2];
    const stalled = stallMidStream(third.body, 100);
    server.route(third.audioPath, sequence(stalled.handler, audio(third.body)));
    const feedUrl = publishPodcast(server, SHOW, episodes);
    subscribe(ws, feedUrl, SHOW);
    const partialFile = join(ws.downloadsDir, `${fileOf(3)}.tmp`);

    const cli = startCli(['download'], ws.dir);
    await Promise.race([
      stalled.sent,
      cli.done.then((r) => {
        throw new Error(`CLI exited before requesting episode 3:\n${r.stdout}${r.stderr}`);
      }),
    ]);
    // Kill only once part of episode 3 is on disk, the moment a crash does most harm.
    await vi.waitFor(() => expect(statSync(partialFile).size).toBe(100), { timeout: 5_000 });
    cli.child.kill('SIGKILL');
    expect((await cli.done).signal).toBe('SIGKILL');

    await expectStateIntact(ws);
    expect(await listFiles(ws.downloadsDir)).toEqual([fileOf(1), fileOf(2), `${fileOf(3)}.tmp`]);
    expect(await readHistory(ws)).toEqual({
      [feedUrl]: [
        { guid: episodes[0].guid, status: 'downloaded' },
        { guid: episodes[1].guid, status: 'downloaded' },
      ],
    });

    const rerun = await runDownloadAndCheckState(ws);

    expectSuccess(rerun);
    expect(await listFiles(ws.downloadsDir)).toEqual([fileOf(1), fileOf(2), fileOf(3)]);
    expect(readFileSync(join(ws.downloadsDir, fileOf(3)))).toEqual(third.body);
    expect(episodes.map((ep) => server.hits(ep.audioPath))).toEqual([1, 1, 2]);
  });
});
