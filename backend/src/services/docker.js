import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { ConfigError } from './palConfig.js';

const execAsync = promisify(exec);

/**
 * Docker's own container-name rule. The container name comes from env, but it
 * is interpolated into a shell command, so it is validated on every call rather
 * than trusted — a name like `x; rm -rf /` must never reach the shell.
 */
const CONTAINER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

/** Restarting is heavy and kicks every player. Refuse to do it in a tight loop. */
const RESTART_COOLDOWN_MS = 15_000;
let lastRestartAt = 0;
let restartInFlight = null;

function assertContainerName(name) {
  if (!CONTAINER_NAME_RE.test(name)) {
    throw new ConfigError(
      `Tên container không hợp lệ: "${name}". Kiểm tra biến môi trường PAL_CONTAINER.`,
      500,
    );
  }
  return name;
}

function describeFailure(err) {
  const stderr = (err.stderr || '').trim();

  if (/command not found|not recognized/i.test(stderr) || err.code === 127) {
    return new ConfigError('Không tìm thấy lệnh `docker` trên máy chủ.', 500, [stderr]);
  }
  if (/permission denied/i.test(stderr)) {
    return new ConfigError(
      'Không có quyền truy cập Docker daemon. Thêm user chạy Node vào group `docker`.',
      500,
      [stderr],
    );
  }
  if (/no such container/i.test(stderr)) {
    return new ConfigError(
      `Không tìm thấy container "${config.container}".`,
      404,
      [stderr],
    );
  }
  if (err.killed || err.signal === 'SIGTERM') {
    return new ConfigError('Lệnh restart bị timeout.', 504, [stderr]);
  }
  return new ConfigError('Restart container thất bại.', 500, [stderr || err.message]);
}

/** `docker restart <container>` — the whole point of the endpoint. */
export async function restartContainer() {
  const name = assertContainerName(config.container);

  if (restartInFlight) return restartInFlight; // coalesce concurrent clicks

  const since = Date.now() - lastRestartAt;
  if (since < RESTART_COOLDOWN_MS) {
    throw new ConfigError(
      `Vừa restart cách đây ${Math.round(since / 1000)}s. Vui lòng đợi thêm ` +
      `${Math.ceil((RESTART_COOLDOWN_MS - since) / 1000)}s.`,
      429,
    );
  }

  const startedAt = Date.now();
  restartInFlight = execAsync(`docker restart ${name}`, { timeout: config.restartTimeoutMs })
    .then(({ stdout, stderr }) => {
      lastRestartAt = Date.now();
      return {
        container: name,
        durationMs: Date.now() - startedAt,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    })
    .catch((err) => { throw describeFailure(err); })
    .finally(() => { restartInFlight = null; });

  return restartInFlight;
}

/** Lightweight health probe for the dashboard header. */
export async function containerStatus() {
  const name = assertContainerName(config.container);
  const format = '{{.State.Status}}|{{.State.StartedAt}}';

  try {
    const { stdout } = await execAsync(
      `docker inspect --format "${format}" ${name}`,
      { timeout: 5_000 },
    );
    const [status, startedAt] = stdout.trim().split('|');
    return { container: name, running: status === 'running', status, startedAt };
  } catch {
    return { container: name, running: false, status: 'unknown', startedAt: null };
  }
}
