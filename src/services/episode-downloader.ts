import { createWriteStream } from 'node:fs';
import { rename, rm, mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { dirname } from 'node:path';
import type { ReadableStream } from 'node:stream/web';

/**
 * Give up once no bytes have arrived for this long. There is no cap on the
 * total time, so a large episode on a slow line can take as long as it needs.
 */
const IDLE_TIMEOUT_MS = 60_000;

/** Result of an episode download attempt */
export interface DownloadResult {
  success: boolean;
  error?: string;
}

/**
 * Download an audio file by streaming the HTTP response body to a temporary
 * file on disk, then atomically rename to the final path on success.
 *
 * If the download fails at any point, the temp file is cleaned up and no
 * .mp3 file is left behind.
 *
 * @param audioUrl - URL of the audio file to download
 * @param destPath - Final destination path for the downloaded file
 * @returns Download result indicating success or failure with error message
 */
export async function downloadEpisode(
  audioUrl: string,
  destPath: string,
): Promise<DownloadResult> {
  const tmpPath = destPath + '.tmp';
  const controller = new AbortController();
  let stalled = false;
  let idleTimer: NodeJS.Timeout | undefined;
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, IDLE_TIMEOUT_MS);
  };

  try {
    await mkdir(dirname(destPath), { recursive: true });

    resetIdleTimer();
    const response = await fetch(audioUrl, {
      headers: { 'User-Agent': 'podcast-dl/0.1.0' },
      signal: controller.signal,
    });
    resetIdleTimer();

    // Throw rather than return, so every failure goes through the temp-file cleanup below.
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    // Stream to temp file using Node.js stream pipeline
    // Type assertion required due to Web API vs Node.js ReadableStream type mismatch
    const nodeStream = Readable.fromWeb(
      response.body as ReadableStream<Uint8Array>,
    );
    const resetOnData = new Transform({
      transform(chunk, _encoding, callback) {
        resetIdleTimer();
        callback(null, chunk);
      },
    });
    await pipeline(nodeStream, resetOnData, createWriteStream(tmpPath));

    // Atomic rename: temp -> final
    await rename(tmpPath, destPath);

    return { success: true };
  } catch (error) {
    // Also removes a partial file left by an earlier run that was killed mid-download.
    // Best effort: the error worth reporting is the one that got us here.
    await rm(tmpPath, { force: true }).catch(() => {});

    const message = stalled
      ? `Download stalled: no data for ${IDLE_TIMEOUT_MS / 1000} s`
      : error instanceof Error
        ? error.message
        : 'Unknown error';
    return { success: false, error: message };
  } finally {
    clearTimeout(idleTimer);
    // An error response's body is never read; this closes its connection, which would otherwise keep the process alive.
    controller.abort();
  }
}
