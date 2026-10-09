// Preload with `node --import`: every write to history.json fails as it
// lands, the way it would on a full or read-only disk. Other files still work.
import fs from 'node:fs';

const renameSync = fs.renameSync;
fs.renameSync = (from, to) => {
  if (String(to).endsWith('history.json')) {
    const error = new Error(`EROFS: read-only file system, rename '${from}' -> '${to}'`);
    error.code = 'EROFS';
    throw error;
  }
  return renameSync(from, to);
};
