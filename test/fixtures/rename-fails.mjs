// Preload with `node --import`: every write onto a file whose path ends with
// $RENAME_FAILS_FOR fails as it lands, the way it would on a full or
// read-only disk. Other files still work.
import fs from 'node:fs';

const target = process.env.RENAME_FAILS_FOR;
if (!target) throw new Error('rename-fails.mjs needs RENAME_FAILS_FOR');

const renameSync = fs.renameSync;
fs.renameSync = (from, to) => {
  if (String(to).endsWith(target)) {
    const error = new Error(`EROFS: read-only file system, rename '${from}' -> '${to}'`);
    error.code = 'EROFS';
    throw error;
  }
  return renameSync(from, to);
};
