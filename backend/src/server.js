import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config.js';
import api from './routes/api.js';
import { ConfigError } from './services/palConfig.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // behind nginx / Cloudflare, so rate limiting sees real IPs

app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '32kb' }));

app.use(cors({
  origin(origin, cb) {
    // Same-origin requests and curl send no Origin header.
    if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
    return cb(new ConfigError(`Origin không được phép: ${origin}`, 403));
  },
  methods: ['GET', 'PUT', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
  maxAge: 86_400,
}));

app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.use('/api', api);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Không tìm thấy route ${req.method} ${req.path}` });
});

// Central error handler: ConfigError carries a safe message + status, anything
// else is logged in full and reported generically so paths never leak.
app.use((err, req, res, _next) => {
  if (err instanceof ConfigError) {
    return res.status(err.status).json({ ok: false, error: err.message, details: err.details });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'JSON không hợp lệ.' });
  }
  console.error('[unhandled]', err);
  return res.status(500).json({ ok: false, error: 'Lỗi máy chủ nội bộ.' });
});

app.listen(config.port, () => {
  console.log(`Palworld panel API đang chạy tại http://0.0.0.0:${config.port}`);
  console.log(`  config : ${config.configPath}`);
  console.log(`  docker : ${config.container}`);
  console.log(`  cors   : ${config.corsOrigins.join(', ')}`);
  if (!config.apiKey) {
    console.warn('  ⚠  API_KEY trống — API đang mở công khai. Chỉ dùng khi test cục bộ.');
  }
});
