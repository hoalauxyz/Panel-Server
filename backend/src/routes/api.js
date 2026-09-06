import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { requireApiKey } from '../middleware/auth.js';
import { readOrScaffold, writeRaw } from '../services/configFile.js';
import { restartContainer, containerStatus } from '../services/docker.js';
import { SCHEMA, applySettings, toJson, validate } from '../services/palConfig.js';

const router = Router();

const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Quá nhiều yêu cầu, thử lại sau một phút.' },
});

const restartLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: 6,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Quá nhiều lần restart, thử lại sau vài phút.' },
});

/** Wrap async handlers so rejections reach the error middleware. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Public: lets the dashboard render range hints without hardcoding them. */
router.get('/schema', (req, res) => {
  res.json({ ok: true, schema: SCHEMA });
});

router.use(requireApiKey);

/** GET /api/config -> parsed settings as JSON */
router.get('/config', wrap(async (req, res) => {
  const raw = await readOrScaffold();
  const { settings, missingKeys, totalKeys } = toJson(raw);
  res.json({
    ok: true,
    settings,
    meta: { path: config.configPath, missingKeys, totalKeys },
  });
}));

/** PUT /api/config -> validate, merge onto the existing ini, write atomically */
router.put('/config', writeLimiter, wrap(async (req, res) => {
  const clean = validate(req.body);
  const raw = await readOrScaffold();
  const next = applySettings(raw, clean);

  let backupPath = null;
  if (next !== raw) {
    ({ backupPath } = await writeRaw(next));
  }

  res.json({
    ok: true,
    changed: next !== raw,
    settings: toJson(next).settings,
    meta: { path: config.configPath, backupPath },
  });
}));

/** GET /api/config/raw -> the untouched file, for debugging from the panel */
router.get('/config/raw', wrap(async (req, res) => {
  res.type('text/plain').send(await readOrScaffold());
}));

/** POST /api/restart-server -> docker restart <container> */
router.post('/restart-server', restartLimiter, wrap(async (req, res) => {
  const result = await restartContainer();
  res.json({ ok: true, message: `Đã restart container "${result.container}".`, ...result });
}));

/** GET /api/status -> container health for the dashboard header */
router.get('/status', wrap(async (req, res) => {
  res.json({ ok: true, ...(await containerStatus()) });
}));

export default router;
