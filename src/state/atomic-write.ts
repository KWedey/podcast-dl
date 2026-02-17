import writeFileAtomic from 'write-file-atomic';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Write data to a file atomically using write-file-atomic.
 * Ensures parent directories exist before writing.
 *
 * Guarantees:
 * - Target file is always either old content or new content, never partial
 * - Parent directories are created if they don't exist
 */
export function atomicWriteSync(filePath: string, data: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  writeFileAtomic.sync(filePath, data, { encoding: 'utf8' });
}
