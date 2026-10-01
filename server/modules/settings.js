import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { moduleDefs, featureDefs } from '../../shared/catalog.js';
import {
  assert,
  parse,
  publicUser,
  randomPassword,
  createAccount,
  log,
  accountRecord,
  accountUsable,
  positiveId,
  pageNumber,
} from '../security.js';
export function settingsRouter(db, security) {
  const router = Router();
  router.use(security.auth, security.admin);
  router.patch('/school', security.feature('settings.school'), (req, res) => {
    const data = parse(
      z.object({
        name: z.string().trim().min(2).max(100),
        principal: z.string().trim().min(2).max(100),
        city: z.string().max(100).optional().default(''),
        address: z.string().max(1000).optional().default(''),
        phone: z.string().max(20).optional().default(''),
        email: z
          .union([z.email(), z.literal('')])
          .optional()
          .default(''),
        academic_year: z.string().min(3).max(40),
      }),
      req.body,
    );
    db.transaction(() => {
      db.setSetting('school', data);
      log(db, req.user, 'settings.school');
    });
    res.json(data);
  });
  router.patch('/modules/:id', security.feature('settings.modules'), (req, res) => {
    const mod = moduleDefs.find((m) => m.id === req.params.id);
    assert(mod, 404, 'ماژول پیدا نشد.');
    assert(!mod.locked, 409, 'تنظیمات هسته برای جلوگیری از قفل شدن مدیریت همیشه فعال است.');
    const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
    db.transaction(() => {
      db.run('UPDATE modules SET enabled=? WHERE id=?', [enabled ? 1 : 0, mod.id]);
      log(db, req.user, 'settings.modules', 'modules', null, { id: mod.id, enabled });
    });
    res.json(security.config());
  });
  router.patch('/features/:id', security.feature('settings.modules'), (req, res) => {
    const feature = featureDefs.find((f) => f.id === req.params.id);
    assert(feature, 404, 'قابلیت پیدا نشد.');
    assert(
      !feature.locked,
      409,
      'دسترسی مدیریت ماژول‌ها برای بازیابی تنظیمات قابل غیرفعال کردن نیست.',
    );
    const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
    db.transaction(() => {
      db.run('UPDATE features SET enabled=? WHERE id=?', [enabled ? 1 : 0, feature.id]);
      log(db, req.user, 'settings.modules', 'features', null, { id: feature.id, enabled });
    });
    res.json(security.config());
  });
  router.get('/accounts', security.feature('settings.accounts'), (req, res) => {
    const params = [],
      clauses = [];
    if (req.query.q) {
      clauses.push('(full_name LIKE ? OR username LIKE ?)');
      params.push(
        `%${String(req.query.q).slice(0, 100)}%`,
        `%${String(req.query.q).slice(0, 100)}%`,
      );
    }
    if (req.query.role) {
      clauses.push('role=?');
      params.push(String(req.query.role));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const page = pageNumber(req.query.page);
    const total = db.get(`SELECT COUNT(*) n FROM users ${where}`, params).n;
    const rows = db
      .all(`SELECT * FROM users ${where} ORDER BY id LIMIT 15 OFFSET ?`, [
        ...params,
        (page - 1) * 15,
      ])
      .map((u) => ({
        ...publicUser(u),
        active: !!u.active,
        access_active: accountUsable(db, u),
        record_status: accountRecord(db, u)?.status || (u.role === 'admin' ? 'active' : 'missing'),
        created_at: u.created_at,
      }));
    res.json({ rows, total, pages: Math.ceil(total / 15), page });
  });
  router.post('/accounts', security.feature('settings.accounts'), (req, res) => {
    const data = parse(
      z.object({
        username: z
          .string()
          .regex(/^[a-zA-Z0-9_.@-]{3,100}$/, 'نام کاربری لاتین حداقل ۳ کاراکتر باشد.'),
        full_name: z.string().trim().min(2).max(100),
        role: z.enum(['admin', 'parent']),
        student_id: z.number().int().positive().nullable().optional(),
        phone: z.string().max(20).optional(),
      }),
      req.body,
    );
    let student;
    if (data.role === 'parent') {
      student = db.get('SELECT * FROM students WHERE id=?', [data.student_id || 0]);
      assert(student, 422, 'دانش‌آموز مرتبط را انتخاب کنید.');
      assert(!student.guardian_user_id, 409, 'این دانش‌آموز قبلاً حساب ولی دارد.');
    }
    const temporary_password = randomPassword();
    db.transaction(() => {
      const id = db.insert('users', {
        username: data.username,
        full_name: data.full_name,
        role: data.role,
        student_id: data.role === 'parent' ? data.student_id : null,
        phone: data.phone || null,
        password_hash: bcrypt.hashSync(temporary_password, 10),
        must_change_password: 1,
      });
      if (student) db.run('UPDATE students SET guardian_user_id=? WHERE id=?', [id, student.id]);
      log(db, req.user, 'settings.accounts', 'users', id, { role: data.role });
    });
    res.status(201).json({ username: data.username, temporary_password });
  });
  router.patch('/accounts/:id', security.feature('settings.accounts'), (req, res) => {
    const user = db.get('SELECT * FROM users WHERE id=?', [positiveId(req.params.id)]);
    assert(user, 404, 'کاربر پیدا نشد.');
    assert(user.id !== req.user.id, 409, 'نمی‌توانید حساب خودتان را غیرفعال کنید.');
    const { active } = parse(z.object({ active: z.boolean() }), req.body);
    if (active && user.role !== 'admin')
      assert(
        accountRecord(db, user)?.status === 'active',
        409,
        'ابتدا پرونده مرتبط را فعال کنید؛ حساب بدون پرونده فعال قابل فعال‌سازی نیست.',
      );
    if (!active && user.role === 'admin')
      assert(
        db.get("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1").n > 1,
        409,
        'آخرین مدیر فعال را نمی‌توان غیرفعال کرد.',
      );
    db.transaction(() => {
      db.run('UPDATE users SET active=? WHERE id=?', [active ? 1 : 0, user.id]);
      if (!active) db.run('DELETE FROM sessions WHERE user_id=?', [user.id]);
      log(db, req.user, 'settings.accounts', 'users', user.id, { active });
    });
    res.json({ ok: true });
  });
  router.post(
    '/accounts/:id/reset-password',
    security.feature('settings.reset_password'),
    (req, res) => {
      const user = db.get('SELECT * FROM users WHERE id=?', [positiveId(req.params.id)]);
      assert(user, 404, 'کاربر پیدا نشد.');
      assert(user.id !== req.user.id, 409, 'رمز خود را از بخش حساب کاربری تغییر دهید.');
      const temporary_password = randomPassword();
      db.transaction(() => {
        db.run('UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?', [
          bcrypt.hashSync(temporary_password, 10),
          user.id,
        ]);
        db.run('DELETE FROM sessions WHERE user_id=?', [user.id]);
        log(db, req.user, 'settings.reset_password', 'users', user.id);
      });
      res.json({ username: user.username, temporary_password });
    },
  );
  router.post(
    '/accounts/create/:resource/:id',
    security.feature('settings.accounts'),
    (req, res) => {
      assert(['students', 'teachers'].includes(req.params.resource), 404, 'نوع حساب معتبر نیست.');
      const row = db.get(`SELECT * FROM "${req.params.resource}" WHERE id=?`, [
        positiveId(req.params.id),
      ]);
      assert(row, 404, 'پرونده پیدا نشد.');
      let account;
      db.transaction(() => {
        account = createAccount(db, req.params.resource, row, security);
        log(db, req.user, `${req.params.resource}.account`, req.params.resource, row.id);
      });
      res.status(201).json(account);
    },
  );
  router.get('/backup', security.feature('settings.backup'), (req, res) => {
    log(db, req.user, 'settings.backup');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="madresehyar-${new Date().toISOString().slice(0, 10)}.sqlite"`,
    );
    res.type('application/octet-stream').send(Buffer.from(db.export()));
  });
  router.get('/audit', security.feature('settings.audit'), (req, res) =>
    res.json(
      db.all(
        'SELECT a.*,u.full_name actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200',
      ),
    ),
  );
  return router;
}
