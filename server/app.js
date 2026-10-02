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
import { supportRouter } from './modules/support.js';
import { leavesRouter } from './modules/leaves.js';
import { meetingsRouter } from './modules/meetings.js';
import { libraryRouter } from './modules/library.js';
import { financeRouter } from './modules/finance.js';
import { analysisRouter } from './modules/analysis.js';
import { deliverOutbox } from './messaging.js';
import { VENDOR } from '../shared/license.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A school hosted in a sub-directory sets BASE_PATH=/school (cPanel "Application URL").
// Empty means the domain root. Everything the browser touches moves with it, including
// API routes, the session cookie path and the SPA fallback.
export const normalizeBasePath = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') return '';
  const trimmed = raw.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  return trimmed ? `/${trimmed}` : '';
};
export function createApp(
  db,
  {
    demo = false,
    installToken = '',
    staticDir = path.join(root, 'dist'),
    basePath = process.env.BASE_PATH,
    license = null,
  } = {},
) {
  const app = express(),
    security = makeSecurity(db, { basePath, license }),
    base = normalizeBasePath(basePath),
    mountedBase = base || '/';
  security.basePath = base;
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
          frameAncestors: demo
            ? ["'self'", 'https://disweb.ir', 'https://*.disweb.ir']
            : process.env.NODE_ENV === 'production'
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
  const api = express.Router();
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.get('/health', (_req, res) =>
    res.json({
      status: 'ok',
      version: '1.2.0',
      installed: !!db.setting('installed'),
      vendor: VENDOR.name,
      vendor_latin: VENDOR.name_latin,
      vendor_url: VENDOR.url,
    }),
  );
  api.use(
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
  api.use('/setup', installationRouter(db, security, { installToken, demo }));
  api.use('/auth', authRouter(db, security, demo));
  api.use('/entities', resourceRouter(db, security));
  api.use('/attendance', attendanceRouter(db, security));
  api.use('/tickets', ticketsRouter(db, security));
  api.use('/assignments', educationRouter(db, security));
  api.use('/files', filesRouter(db, security));
  api.use('/settings', settingsRouter(db, security));
  api.use('/leaves', leavesRouter(db, security));
  api.use('/meetings', meetingsRouter(db, security));
  api.use('/library', libraryRouter(db, security));
  api.use('/finance', financeRouter(db, security));
  api.use('/analysis', analysisRouter(db, security));
  // Support is mounted before the overview router because the latter starts with a
  // blanket auth guard; the public fault-report endpoint must win the route match.
  api.use('/', supportRouter(db, security));
  api.use('/', overviewRouter(db, security));
  // Passenger may sleep between requests: queued SMS/email is flushed by the next request,
  // never inside the request that produced it.
  api.use((req, _res, next) => {
    if (req.method === 'GET') deliverOutbox(db, security).catch(() => {});
    next();
  });
  api.use((_req, res) => res.status(404).json({ error: 'مسیر API پیدا نشد.' }));
  app.use(`${mountedBase.replace(/\/$/, '')}/api`.replace('//api', '/api'), api);
  if (base) {
    // Registered before the SPA fallback so the bare mount point always ends with a slash;
    // otherwise relative asset URLs inside index.html would resolve one directory up.
    app.get('/', (_req, res) => res.redirect(302, `${base}/`));
    app.get(base, (req, res, next) =>
      req.originalUrl.split('?')[0] === base ? res.redirect(301, `${base}/`) : next(),
    );
  }
  const serveStatic = fs.existsSync(path.join(staticDir, 'index.html'));
  if (serveStatic) {
    app.use(
      mountedBase,
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
    app.get(base ? `${base}/{*path}` : '/{*path}', (_req, res) =>
      res.sendFile('index.html', { root: staticDir }),
    );
  } else {
    app.get(base || '/', (_req, res) =>
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
