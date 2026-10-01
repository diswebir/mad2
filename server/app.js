import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeSecurity } from './security.js';
import { resourceRouter } from './resources.js';
import { authRouter } from './modules/auth.js';
import { attendanceRouter } from './modules/attendance.js';
import { ticketsRouter } from './modules/tickets.js';
import { educationRouter } from './modules/education.js';
import { filesRouter } from './modules/files.js';
import { settingsRouter } from './modules/settings.js';
import { overviewRouter } from './modules/overview.js';
import { installationRouter } from './modules/installation.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function createApp(
  db,
  { demo = false, installToken = '', staticDir = path.join(root, 'dist') } = {},
) {
  const app = express(),
    security = makeSecurity(db);
  app.disable('x-powered-by');
  const trust = Number(process.env.TRUST_PROXY ?? 1);
  app.set('trust proxy', Number.isInteger(trust) && trust >= 0 && trust <= 5 ? trust : 1);
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      xFrameOptions: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          frameAncestors:
            process.env.NODE_ENV === 'production'
              ? ["'self'"]
              : ["'self'", 'https://arena.ai', 'https://*.arena.ai', 'https://*.e2b.app'],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', version: '1.0.0', installed: !!db.setting('installed') }),
  );
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 400,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'تعداد درخواست زیاد است؛ یک دقیقه صبر کنید.' },
    }),
    security.loadSession,
    security.csrf,
  );
  app.use('/api/setup', installationRouter(db, security, { installToken, demo }));
  app.use('/api/auth', authRouter(db, security, demo));
  app.use('/api/entities', resourceRouter(db, security));
  app.use('/api/attendance', attendanceRouter(db, security));
  app.use('/api/tickets', ticketsRouter(db, security));
  app.use('/api/assignments', educationRouter(db, security));
  app.use('/api/files', filesRouter(db, security));
  app.use('/api/settings', settingsRouter(db, security));
  app.use('/api', overviewRouter(db, security));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'مسیر API پیدا نشد.' }));
  if (fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(
      express.static(staticDir, {
        maxAge: '1h',
        dotfiles: 'deny',
        index: false,
        setHeaders: (res, filename) => {
          if (filename.includes('/assets/'))
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: staticDir }));
  } else {
    app.get('/', (_req, res) =>
      res
        .type('text')
        .send('مدرسه‌یار — رابط کاربری را با npm run build بسازید، یا npm run dev را اجرا کنید.'),
    );
  }
  app.use((error, _req, res, _next) => {
    let status = error.status || 500,
      message = error.message;
    if (error.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      message = 'حجم فایل بیش از حد مجاز است (پیش‌فرض ۵ مگابایت).';
    } else if (error.name === 'MulterError') {
      status = 422;
      message = 'فایل ارسالی معتبر نیست.';
    } else if (/UNIQUE constraint failed/.test(message)) {
      status = 409;
      message = 'کد، کد ملی یا شناسه تکراری است.';
    } else if (/FOREIGN KEY constraint failed/.test(message)) {
      status = 409;
      message =
        'این رکورد دارای سوابق وابسته است و قابل حذف نیست؛ آن را غیرفعال یا ابتدا وابستگی‌ها را مدیریت کنید.';
    } else if (/NOT NULL constraint failed/.test(message)) {
      status = 422;
      message = 'یک فیلد الزامی وارد نشده است.';
    }
    if (status >= 500) {
      console.error(error);
      message = 'خطای داخلی رخ داد. لطفاً دوباره تلاش کنید.';
    }
    res
      .status(status)
      .json({ error: message, ...(error.code && error.status ? { code: error.code } : {}) });
  });
  return app;
}
