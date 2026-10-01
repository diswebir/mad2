import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import {
  assert,
  parse,
  passwordSchema,
  publicUser,
  hashToken,
  log,
  accountUsable,
} from '../security.js';
import { demoAccounts } from '../seed.js';
export function authRouter(db, security, demo) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 12,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const value = req.body?.username || req.body?.role || '';
      const name = typeof value === 'string' ? value.trim().slice(0, 100).toLowerCase() : 'invalid';
      return `${ipKeyGenerator(req.ip)}:${name}`;
    },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'تلاش‌های ورود زیاد است؛ ۱۵ دقیقه بعد دوباره امتحان کنید.' },
  });
  router.get('/me', (req, res) =>
    res.json({
      installed: !!db.setting('installed'),
      demo,
      user: req.user ? publicUser(req.user) : null,
      csrf: req.session?.csrf || null,
      school: {
        name: db.setting('school', {}).name,
        academic_year: db.setting('school', {}).academic_year,
      },
    }),
  );
  router.post('/login', limiter, (req, res) => {
    assert(db.setting('installed'), 503, 'ابتدا سامانه را نصب کنید.');
    const { username, password } = parse(
      z.object({
        username: z.string().min(1).max(100),
        password: z
          .string()
          .min(1)
          .max(128)
          .refine(
            (value) => Buffer.byteLength(value, 'utf8') <= 72,
            'رمز عبور بیش از ۷۲ بایت است؛ از مدیر درخواست بازنشانی کنید.',
          ),
      }),
      req.body,
    );
    const user = db.get('SELECT * FROM users WHERE username=?', [username.trim()]);
    // Always do a password comparison, including for unknown usernames.
    const hash =
      user?.password_hash || '$2b$10$7lKDOIlLoGWthshSMaJCMOxe/qsidTgpomOdDOzmSKJEfl7KM3bFO';
    const ok = bcrypt.compareSync(password, hash);
    assert(
      user && ok && accountUsable(db, user),
      401,
      'نام کاربری یا رمز عبور صحیح نیست، یا حساب غیرفعال است.',
    );
    if (req.session) db.run('DELETE FROM sessions WHERE id=?', [req.session.id]);
    log(db, user, 'auth.login');
    res.json(security.session(req, res, user));
  });
  router.post('/demo', limiter, (req, res) => {
    assert(demo, 404, 'ورود نمایشی در محیط واقعی در دسترس نیست.');
    const role = req.body?.role || 'admin';
    assert(
      typeof role === 'string' && Object.hasOwn(demoAccounts, role),
      422,
      'نقش انتخاب‌شده معتبر نیست.',
    );
    const user = db.get('SELECT * FROM users WHERE username=? AND active=1', [demoAccounts[role]]);
    assert(user?.role === role && accountUsable(db, user), 404, 'حساب نمایشی در دسترس نیست.');
    if (req.session) db.run('DELETE FROM sessions WHERE id=?', [req.session.id]);
    res.json(security.session(req, res, user));
  });
  router.post('/logout', (req, res) => {
    const token = req.cookies?.school_session;
    if (typeof token === 'string' && token.length < 200)
      db.run('DELETE FROM sessions WHERE id=?', [hashToken(token)]);
    res.clearCookie('school_session', security.cookieOptions(req));
    res.json({ ok: true });
  });
  router.patch('/profile', security.auth, security.feature('profile.edit'), (req, res) => {
    const data = parse(
      z.object({
        full_name: z.string().trim().min(2, 'نام را وارد کنید.').max(100),
        phone: z.string().max(20).nullable().optional(),
        email: z.union([z.email(), z.literal(''), z.null()]).optional(),
      }),
      req.body,
    );
    db.transaction(() => {
      db.run('UPDATE users SET full_name=?,phone=?,email=? WHERE id=?', [
        data.full_name,
        data.phone || null,
        data.email || null,
        req.user.id,
      ]);
      log(db, req.user, 'profile.edit');
    });
    res.json({ user: publicUser(db.get('SELECT * FROM users WHERE id=?', [req.user.id])) });
  });
  router.post('/password', security.auth, (req, res) => {
    assert(
      req.user.must_change_password || security.enabled('profile.password'),
      403,
      'تغییر رمز عبور غیرفعال شده است.',
    );
    const data = parse(
      z.object({ current_password: z.string().max(128), new_password: passwordSchema }),
      req.body,
    );
    assert(
      bcrypt.compareSync(data.current_password, req.user.password_hash),
      422,
      'رمز عبور فعلی صحیح نیست.',
    );
    assert(
      data.new_password !== data.current_password,
      422,
      'رمز جدید باید با رمز فعلی متفاوت باشد.',
    );
    db.transaction(() => {
      db.run('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?', [
        bcrypt.hashSync(data.new_password, 10),
        req.user.id,
      ]);
      db.run('DELETE FROM sessions WHERE user_id=?', [req.user.id]);
      log(db, req.user, 'profile.password');
    });
    res.json(security.session(req, res, db.get('SELECT * FROM users WHERE id=?', [req.user.id])));
  });
  return router;
}
