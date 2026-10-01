// Service status and user-facing error reporting with a tracking code.
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { moduleDefs, featureDefs } from '../../shared/catalog.js';
import { assert, parse, log, pageNumber, positiveId } from '../security.js';

const startedAt = Date.now();

export function supportRouter(db, security) {
  const router = Router();
  const stats = () => {
    const count = (table) => {
      try {
        return db.get(`SELECT COUNT(*) n FROM "${table}"`).n;
      } catch {
        return null;
      }
    };
    return {
      version: '1.1.0',
      node: process.versions.node,
      started_at: new Date(startedAt).toISOString(),
      uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
      demo: !!db.setting('demo_seeded'),
      installed: !!db.setting('installed'),
      schema_version: db.setting('schema_version', 1),
      base_path: security.basePath || '/',
      database_bytes: (() => {
        try {
          return db.export().length;
        } catch {
          return null;
        }
      })(),
      memory_mb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
      capabilities: featureDefs.length,
      modules: moduleDefs.length,
      records: Object.fromEntries(
        ['students', 'teachers', 'classes', 'users', 'attendance', 'tickets', 'outbox'].map(
          (table) => [table, count(table)],
        ),
      ),
      features_disabled: featureDefs.filter(
        (feature) => !db.get('SELECT enabled FROM features WHERE id=?', [feature.id])?.enabled,
      ).length,
      last_audit_at:
        db.get('SELECT created_at FROM audit ORDER BY id DESC LIMIT 1')?.created_at || null,
      last_backup_at: db.setting('last_backup_at', null),
      pending_outbox: db.get("SELECT COUNT(*) n FROM outbox WHERE status='queued'").n,
      failed_outbox: db.get("SELECT COUNT(*) n FROM outbox WHERE status='failed'").n,
      open_error_reports: db.get("SELECT COUNT(*) n FROM error_reports WHERE status!='resolved'").n,
      checks: [
        { name: 'دسترسی نوشتن پایگاه‌داده', ok: true },
        {
          name: 'قفل تک‌فرآیندی',
          ok: true,
          detail: 'Passenger باید یک نمونه اجرا کند',
        },
        { name: 'نسخهٔ طرح پایگاه‌داده', ok: true, detail: `v${db.setting('schema_version', 1)}` },
        {
          name: 'یکپارچگی پایگاه‌داده',
          ok: (() => {
            try {
              return db.get('PRAGMA quick_check')?.quick_check === 'ok';
            } catch {
              return false;
            }
          })(),
        },
      ],
    };
  };
  router.get(
    '/status',
    security.auth,
    security.admin,
    security.feature('settings.status'),
    (req, res) => {
      res.json(stats());
    },
  );
  // The report endpoint is reachable from the login screen too, so it needs its own rate
  // limit and a strict input cap instead of the authenticated feature guard.
  router.post('/support/report', (req, res) => {
    const data = parse(
      z.object({
        message: z.string().trim().min(4).max(1000),
        stack: z.string().max(4000).optional().default(''),
        url: z.string().max(500).optional().default(''),
      }),
      req.body,
    );
    assert(db.setting('installed'), 503, 'سامانه هنوز نصب نشده است.');
    const recent = db.get(
      "SELECT COUNT(*) n FROM error_reports WHERE created_at>=datetime('now','-10 minutes')",
    ).n;
    assert(recent < 30, 429, 'تعداد گزارش‌های اخیر زیاد است؛ کمی بعد تلاش کنید.');
    const code = `ER-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    db.transaction(() => {
      db.insert('error_reports', {
        code,
        user_id: req.user?.id ?? null,
        message: data.message,
        stack: data.stack,
        url: data.url,
        user_agent: String(req.get('user-agent') || '').slice(0, 300),
      });
      log(db, req.user, 'support.report', 'error_reports', null, code);
    });
    res.status(201).json({ code, message: 'گزارش ثبت شد؛ کد پیگیری را به پشتیبانی بدهید.' });
  });
  router.get(
    '/support/reports',
    security.auth,
    security.admin,
    security.feature('settings.support'),
    (req, res) => {
      const page = pageNumber(req.query.page);
      const where = req.query.status ? 'WHERE status=?' : '';
      const params = req.query.status ? [String(req.query.status)] : [];
      const total = db.get(`SELECT COUNT(*) n FROM error_reports ${where}`, params).n;
      res.json({
        rows: db.all(
          `SELECT r.*,u.full_name actor_name FROM error_reports r LEFT JOIN users u ON u.id=r.user_id ${where} ORDER BY r.id DESC LIMIT 20 OFFSET ?`,
          [...params, (page - 1) * 20],
        ),
        total,
        page,
        pages: Math.max(1, Math.ceil(total / 20)),
      });
    },
  );
  router.patch(
    '/support/reports/:id',
    security.auth,
    security.admin,
    security.feature('settings.support'),
    (req, res) => {
      const row = db.get('SELECT * FROM error_reports WHERE id=?', [positiveId(req.params.id)]);
      assert(row, 404, 'گزارش پیدا نشد.');
      const { status, note } = parse(
        z.object({
          status: z.enum(['new', 'seen', 'resolved']),
          note: z.string().max(1000).optional().default(''),
        }),
        req.body,
      );
      db.run('UPDATE error_reports SET status=?,note=? WHERE id=?', [status, note, row.id]);
      res.json({ ok: true });
    },
  );
  return router;
}
