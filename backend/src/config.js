import 'dotenv/config';
import path from 'node:path';

const DEFAULT_CONFIG_PATH =
  '/home/USER/palworld-server/data/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini';

function required(value, name, fallback) {
  const v = (value ?? '').trim() || fallback;
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const configPath = required(process.env.PAL_CONFIG_PATH, 'PAL_CONFIG_PATH', DEFAULT_CONFIG_PATH);

if (!path.isAbsolute(configPath)) {
  throw new Error(`PAL_CONFIG_PATH must be an absolute path, got "${configPath}"`);
}

export const config = {
  port: Number(process.env.PORT || 8080),
  configPath,
  container: required(process.env.PAL_CONTAINER, 'PAL_CONTAINER', 'palworld-server'),
  apiKey: (process.env.API_KEY || '').trim(),
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  backupRetention: Number(process.env.BACKUP_RETENTION ?? 10),
  restartTimeoutMs: Number(process.env.RESTART_TIMEOUT_MS || 60_000),
};
