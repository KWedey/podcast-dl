import { rmSync } from 'node:fs';
import { expect, it } from 'vitest';
import { expectSuccess, runCli } from '../helpers/cli.js';
import { startFixtureServer } from '../helpers/fixture-server.js';
import { dailyEpisode, publishPodcast } from '../helpers/rss.js';
import { createWorkspace, expectStateIntact, listFiles } from '../helpers/workspace.js';

it('runs the README example workflow: add, list, download, listen and delete, download again', async () => {
  const ws = await createWorkspace();
  const server = await startFixtureServer();
  const morning = publishPodcast(server, 'Morning Show', [dailyEpisode(1), dailyEpisode(2)], '/morning.xml');
  const evening = publishPodcast(server, 'Evening Show', [dailyEpisode(3)], '/evening.xml');

  expectSuccess(await runCli(['add', morning], ws.dir));
  expectSuccess(await runCli(['add', evening], ws.dir));

  const list = await runCli(['list'], ws.dir);
  expectSuccess(list);
  expect(list.stdout).toMatch(/Evening Show[\s\S]*Morning Show/);

  expectSuccess(await runCli(['download'], ws.dir));
  expect(await listFiles(ws.downloadsDir)).toEqual([
    'evening-show/2024-01-03_Episode 3.mp3',
    'morning-show/2024-01-01_Episode 1.mp3',
    'morning-show/2024-01-02_Episode 2.mp3',
  ]);

  // The listener copies everything to their player, then deletes what they heard.
  rmSync(ws.downloadsDir, { recursive: true });
  publishPodcast(server, 'Morning Show', [dailyEpisode(1), dailyEpisode(2), dailyEpisode(4)], '/morning.xml');

  expectSuccess(await runCli(['download'], ws.dir));
  expect(await listFiles(ws.downloadsDir)).toEqual(['morning-show/2024-01-04_Episode 4.mp3']);
  await expectStateIntact(ws);
});
