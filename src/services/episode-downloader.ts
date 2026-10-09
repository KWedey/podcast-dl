import { createWriteStream } from 'node:fs';
import { rename, rm, mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { dirname } from 'node:path';
import type { ReadableStream } from 'node:stream/web';

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

  try {
    await mkdir(dirname(destPath), { recursive: true });

    const response = await fetch(audioUrl, {
      headers: { 'User-Agent': 'podcast-dl/0.1.0' },
      signal: AbortSignal.timeout(300_000), // 5 min timeout for large files
    });

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
    await pipeline(nodeStream, createWriteStream(tmpPath));

    // Atomic rename: temp -> final
    await rename(tmpPath, destPath);

    return { success: true };
  } catch (error) {
    // Also removes a partial file left by an earlier run that was killed mid-download.
    // Best effort: the error worth reporting is the one that got us here.
    await rm(tmpPath, { force: true }).catch(() => {});

    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
