import { supportedNode } from '../runtime.js';
import { Router } from 'express';
import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { moduleDefs, featureDefs } from '../../shared/catalog.js';
import { assert, parse, passwordSchema, randomPassword, log } from '../security.js';
import { seedDemo } from '../seed.js';
export function installationRouter(db, security, { installToken, demo }) {
  const router = Router();
  router.get('/', (_req, res) => {
    let writable = true;
    try {
      fs.accessSync(db.dir, fs.constants.W_OK);
    } catch {
      writable = false;
    }
    res.json({
      installed: !!db.setting('installed'),
      demo,
      version: '1.1.0',
      features: featureDefs.length,
      modules: moduleDefs,
      requirements: [
        { name: 'Node.js ۲۰.۱۹+ یا ۲۲.۱۲+', value: process.versions.node, passed: supportedNode() },
        {
          name: 'دسترسی نوشتن به پوشه داده‌ها',
          value: writable ? 'آماده' : 'نیازمند تنظیم مجوز',
          passed: writable,
        },
        { name: 'موتور SQLite بدون وابستگی بومی', value: 'SQL.js / WebAssembly', passed: true },
        { name: 'فونت فارسی وزیرمتن', value: 'میزبانی محلی و بدون CDN', passed: true },
      ],
    });
  });
  router.post(
    '/',
    rateLimit({
      windowMs: 15 * 60000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'تعداد تلاش نصب زیاد است. کمی بعد دوباره امتحان کنید.' },
    }),
    (req, res) => {
      assert(
        !db.setting('installed'),
        409,
        'سامانه قبلاً نصب شده است. از تنظیمات مدرسه استفاده کنید.',
      );
      const data = parse(
        z.object({
          token: z.string().max(200),
          school: z.object({
            name: z.string().trim().min(2).max(100),
            principal: z.string().trim().min(2).max(100),
            city: z.string().max(100).default(''),
            phone: z.string().max(20).default(''),
            email: z.union([z.email(), z.literal('')]).default(''),
            address: z.string().max(1000).default(''),
            academic_year: z.string().min(3).max(40),
          }),
          admin: z.object({
            username: z
              .string()
              .regex(/^[a-zA-Z0-9_.@-]{3,100}$/, 'نام کاربری لاتین حداقل ۳ کاراکتر باشد.'),
            password: passwordSchema,
          }),
          demo_data: z.boolean().default(true),
          enabled_modules: z.array(z.string()).optional(),
        }),
        req.body,
      );
      const a = Buffer.from(data.token),
        b = Buffer.from(installToken || '');
      assert(
        b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b),
        403,
        'توکن نصب صحیح نیست. مقدار INSTALL_TOKEN یا فایل data/install.key را بررسی کنید.',
      );
      assert(
        !data.enabled_modules ||
          data.enabled_modules.every((id) => moduleDefs.some((m) => m.id === id)),
        422,
        'ماژول انتخاب‌شده معتبر نیست.',
      );
      let user;
      db.transaction(() => {
        const adminId = db.insert('users', {
          username: data.admin.username,
          password_hash: bcrypt.hashSync(data.admin.password, 10),
          full_name: data.school.principal,
          role: 'admin',
          email: data.school.email || null,
          phone: data.school.phone || null,
        });
        if (data.demo_data) {
          seedDemo(db, { school: data.school, adminId });
          // Production sample accounts never retain publicly known demo passwords.
          db.run('UPDATE users SET password_hash=?,active=0,must_change_password=1 WHERE id!=?', [
            bcrypt.hashSync(randomPassword(), 10),
            adminId,
          ]);
        } else {
          db.setSetting('school', data.school);
          db.insert('terms', {
            name: data.school.academic_year,
            start_date: new Date().toISOString().slice(0, 10),
            end_date: `${new Date().getUTCFullYear() + 1}-06-22`,
            status: 'current',
            author_id: adminId,
          });
        }
        if (data.enabled_modules)
          for (const mod of moduleDefs)
            db.run('UPDATE modules SET enabled=? WHERE id=?', [
              mod.locked || data.enabled_modules.includes(mod.id) ? 1 : 0,
              mod.id,
            ]);
        db.setSetting('demo_seeded', false);
        db.setSetting('installed', true);
        db.setSetting('installed_at', new Date().toISOString());
        user = db.get('SELECT * FROM users WHERE id=?', [adminId]);
        log(db, user, 'install.complete', 'school', null, { demo_data: data.demo_data });
      });
      const keyPath = `${db.dir}/install.key`;
      if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
      res.status(201).json({ ...security.session(req, res, user), installed: true });
    },
  );
  return router;
}
