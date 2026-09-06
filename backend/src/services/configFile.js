import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { ConfigError, scaffold } from './palConfig.js';

/**
 * Serialises writes. Two concurrent "Save & Restart" clicks would otherwise
 * read the same base text and the second write would clobber the first.
 */
let writeChain = Promise.resolve();

export async function readRaw() {
  try {
    return await fs.readFile(config.configPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ConfigError(
        `Không tìm thấy file cấu hình tại ${config.configPath}. ` +
        'Hãy khởi động server Palworld ít nhất một lần để game tự sinh file.',
        404,
      );
    }
    if (err.code === 'EACCES') {
      throw new ConfigError(
        `Không có quyền đọc ${config.configPath}. Kiểm tra user chạy Node và quyền của thư mục.`,
        403,
      );
    }
    throw err;
  }
}

/** Read, or create the file from a template when it does not exist yet. */
export async function readOrScaffold() {
  try {
    return await readRaw();
  } catch (err) {
    if (err instanceof ConfigError && err.status === 404) {
      const text = scaffold();
      await fs.mkdir(path.dirname(config.configPath), { recursive: true });
      await fs.writeFile(config.configPath, text, 'utf8');
      return text;
    }
    throw err;
  }
}

async function backup(text) {
  if (config.backupRetention <= 0) return null;

  const dir = path.join(path.dirname(config.configPath), 'panel-backups');
  await fs.mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `PalWorldSettings.${stamp}.ini`);
  await fs.writeFile(file, text, 'utf8');

  // Prune oldest backups; names sort lexicographically by timestamp.
  const kept = (await fs.readdir(dir))
    .filter((n) => n.startsWith('PalWorldSettings.') && n.endsWith('.ini'))
    .sort()
    .reverse()
    .slice(config.backupRetention);
  await Promise.all(kept.map((n) => fs.rm(path.join(dir, n), { force: true })));

  return file;
}

/**
 * Atomic-ish write: back up the current file, write to a temp file in the same
 * directory, then rename over the target so a crash never leaves a half-written
 * ini that the game server would refuse to boot with.
 */
export function writeRaw(text) {
  const task = writeChain.then(async () => {
    const dir = path.dirname(config.configPath);
    await fs.mkdir(dir, { recursive: true });

    let backupPath = null;
    try {
      backupPath = await backup(await fs.readFile(config.configPath, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err; // first write, nothing to back up
    }

    const tmp = path.join(dir, `.PalWorldSettings.${process.pid}.${Date.now()}.tmp`);
    try {
      await fs.writeFile(tmp, text, 'utf8');
      await fs.rename(tmp, config.configPath);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        throw new ConfigError(
          `Không có quyền ghi ${config.configPath}. Kiểm tra quyền sở hữu thư mục Config.`,
          403,
        );
      }
      throw err;
    }

    return { backupPath };
  });

  // Keep the chain alive even if this write rejects.
  writeChain = task.catch(() => {});
  return task;
}
