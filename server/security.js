import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { moduleDefs, featureDefs, resourceDefs } from '../shared/catalog.js';
import { schoolDate } from '../shared/dates.js';
// messaging.js imports notificationFeature from this module, so it is wired lazily.
let queueOutbox = null;
export const setOutboxQueue = (fn) => {
  queueOutbox = fn;
};
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const assert = (condition, status, message, code) => {
  if (!condition) throw new HttpError(status, message, code);
};
export const digits = (value) =>
  String(value)
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
export const today = schoolDate;
export const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value &&
  Number(value.slice(0, 4)) >= 1900 &&
  Number(value.slice(0, 4)) <= 2100;
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
export const passwordSchema = z
  .string()
  .min(10, 'رمز عبور باید حداقل ۱۰ کاراکتر داشته باشد.')
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'رمز عبور باید حداکثر ۷۲ بایت باشد (حروف فارسی فضای بیشتری می‌گیرند).',
  );
export const parse = (schema, data) => {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new HttpError(422, result.error.issues[0]?.message || 'اطلاعات واردشده معتبر نیست.');
  return result.data;
};
export const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  full_name: user.full_name,
  role: user.role,
  email: user.email,
  phone: user.phone,
  student_id: user.student_id,
  teacher_id: user.teacher_id,
  must_change_password: !!user.must_change_password,
});
export const randomPassword = () => `${crypto.randomBytes(9).toString('base64url')}Aa1!`;
export const log = (db, user, action, entity = null, record_id = null, detail = null) =>
  db.insert('audit', {
    actor_id: user?.id || null,
    action,
    entity,
    record_id,
    detail: typeof detail === 'object' ? JSON.stringify(detail) : detail,
  });
export const notify = (
  db,
  user_id,
  title,
  body,
  link = '/',
  type = 'info',
  source_feature = null,
) => {
  if (!user_id) return null;
  const feature = source_feature || notificationFeature({ type, title });
  const id = db.insert('notifications', {
    user_id,
    title,
    body,
    link,
    type,
    source_feature: feature,
  });
  // SMS/email copy (queued only; delivery happens on a later request).
  queueOutbox?.(db, user_id, { title, body, link, source_feature: feature });
  return id;
};
export function notificationFeature(row) {
  return (
    row.source_feature ||
    { ticket: 'tickets.view', attendance: 'attendance.view', announcement: 'announcements.view' }[
      row.type
    ] ||
    (row.type === 'education'
      ? row.title === 'نمره جدید ثبت شد'
        ? 'grades.view'
        : 'assignments.view'
      : null)
  );
}

// Kept outside makeSecurity so both request handling and tests can reuse it.
export const normalizeBase = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') return '';
  return `/${raw.replace(/^\/+|\/+$/g, '')}`;
};
export function makeSecurity(db, { basePath } = {}) {
  const security = { basePath: normalizeBase(basePath ?? process.env.BASE_PATH) };
  const securityPath = (req) => security.basePath || normalizeBase(req?.basePath);

  const enabled = (feature) => {
    const def = featureDefs.find((f) => f.id === feature);
    return (
      !!def &&
      !!db.get('SELECT enabled FROM features WHERE id=?', [feature])?.enabled &&
      !!db.get('SELECT enabled FROM modules WHERE id=?', [def.module])?.enabled &&
      def.requires.every((dependency) => enabled(dependency))
    );
  };
  const config = () => ({
    modules: moduleDefs.map((m) => ({
      ...m,
      enabled: !!db.get('SELECT enabled FROM modules WHERE id=?', [m.id])?.enabled,
    })),
    features: featureDefs.map((f) => ({
      ...f,
      enabled: !!db.get('SELECT enabled FROM features WHERE id=?', [f.id])?.enabled,
    })),
    school: db.setting('school', {}),
    feature_count: featureDefs.length,
  });
  const loadSession = (req, _res, next) => {
    const token = req.cookies?.school_session;
    if (token && typeof token === 'string' && token.length < 200) {
      const session = db.get('SELECT * FROM sessions WHERE id=? AND expires_at>?', [
        hashToken(token),
        Date.now(),
      ]);
      if (session) {
        const user = db.get('SELECT * FROM users WHERE id=? AND active=1', [session.user_id]);
        if (user && accountUsable(db, user)) {
          req.user = user;
          req.session = session;
        }
      }
    }
    next();
  };
  const auth = (req, _res, next) => {
    if (req.user) {
      const current = db.get('SELECT * FROM users WHERE id=?', [req.user.id]);
      if (
        !current ||
        !accountUsable(db, current) ||
        !db.get('SELECT id FROM sessions WHERE id=? AND expires_at>?', [req.session.id, Date.now()])
      )
        req.user = null;
      else req.user = current;
    }
    assert(db.setting('installed'), 503, 'سامانه هنوز نصب نشده است.');
    assert(
      req.user,
      401,
      'نشست شما منقضی یا حساب غیرفعال شده است؛ دوباره وارد شوید.',
      'AUTH_REQUIRED',
    );
    if (
      req.user.must_change_password &&
      !['/api/auth/me', '/api/auth/password', '/api/auth/logout'].includes(
        req.originalUrl.split('?')[0],
      ) &&
      req.path !== '/config'
    )
      throw new HttpError(
        428,
        'برای ادامه ابتدا رمز موقت را تغییر دهید.',
        'PASSWORD_CHANGE_REQUIRED',
      );
    next();
  };
  const admin = (req, _res, next) => {
    assert(req.user?.role === 'admin', 403, 'این بخش فقط در دسترس مدیر مدرسه است.');
    next();
  };
  const feature = (id) => (req, _res, next) => {
    assert(
      enabled(id),
      403,
      'این قابلیت یا یکی از پیش‌نیازهای آن توسط مدیر مدرسه غیرفعال شده است.',
      'FEATURE_DISABLED',
    );
    next();
  };
  const cookieOptions = (req) => {
    const preview = (req.get('host') || '').split(':')[0].toLowerCase().endsWith('.e2b.app');
    return {
      httpOnly: true,
      secure: preview || req.secure || process.env.NODE_ENV === 'production',
      sameSite: preview ? 'none' : 'lax',
      partitioned: preview,
      path: `${securityPath(req)}/`.replace(/\/{2,}/g, '/'),
    };
  };
  const session = (req, res, user) => {
    const token = crypto.randomBytes(32).toString('hex');
    const csrf = crypto.randomBytes(24).toString('hex');
    db.transaction(() => {
      db.run('DELETE FROM sessions WHERE expires_at<?', [Date.now()]);
      db.insert('sessions', {
        id: hashToken(token),
        user_id: user.id,
        csrf,
        expires_at: Date.now() + 8 * 3600000,
      });
    });
    res.cookie('school_session', token, { ...cookieOptions(req), maxAge: 8 * 3600000 });
    return { user: publicUser(user), csrf };
  };
  const csrf = (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin) {
        let parsed;
        try {
          parsed = new URL(origin);
        } catch {
          throw new HttpError(403, 'مبدأ درخواست معتبر نیست.');
        }
        const expectedProtocol = cookieOptions(req).secure ? 'https:' : 'http:';
        assert(
          parsed.host === req.get('host') && parsed.protocol === expectedProtocol,
          403,
          'درخواست از مبدأ غیرمجاز ارسال شده است.',
        );
      }
      if (req.session) {
        const supplied = Buffer.from(req.get('x-csrf-token') || '', 'utf8');
        const expected = Buffer.from(req.session.csrf, 'utf8');
        assert(
          supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected),
          403,
          'اعتبار درخواست منقضی شده؛ صفحه را تازه کنید.',
          'CSRF_INVALID',
        );
      }
    }
    next();
  };
  return Object.assign(security, {
    enabled,
    config,
    loadSession,
    auth,
    admin,
    feature,
    session,
    csrf,
    cookieOptions,
  });
}

export function teacherClasses(db, user) {
  if (!user.teacher_id) return [];
  return db
    .all(
      'SELECT id FROM classes WHERE teacher_id=? UNION SELECT class_id AS id FROM schedules WHERE teacher_id=?',
      [user.teacher_id, user.teacher_id],
    )
    .map((r) => r.id);
}
export function studentIds(db, user) {
  if (user.role === 'admin') return db.all('SELECT id FROM students').map((r) => r.id);
  if (['student', 'parent'].includes(user.role)) return user.student_id ? [user.student_id] : [];
  const classes = teacherClasses(db, user);
  return classes.length
    ? db
        .all(
          `SELECT id FROM students WHERE class_id IN (${classes.map(() => '?').join(',')})`,
          classes,
        )
        .map((r) => r.id)
    : [];
}
export function ownClass(db, user) {
  return db.get('SELECT class_id FROM students WHERE id=?', [user.student_id || 0])?.class_id;
}
export function scope(db, resource, user, alias = 'r') {
  if (user.role === 'admin') return { sql: '1=1', params: [] };
  const teacher = user.role === 'teacher';
  const cls = teacher ? teacherClasses(db, user) : [ownClass(db, user)].filter(Boolean);
  const list = cls.length ? cls : [-1];
  const inClasses = (column) => ({
    sql: `${alias}.${column} IN (${list.map(() => '?').join(',')})`,
    params: list,
  });
  if (resource === 'students')
    return teacher
      ? inClasses('class_id')
      : { sql: `${alias}.id=?`, params: [user.student_id || -1] };
  if (resource === 'classes') return inClasses('id');
  if (resource === 'teachers' || resource === 'payroll')
    return {
      sql: `${alias}.${resource === 'teachers' ? 'id' : 'teacher_id'}=?`,
      params: [user.teacher_id || -1],
    };
  if (resource === 'grades' && teacher) return inClasses('class_id');
  if (
    ['grades', 'discipline', 'health', 'documents', 'counseling', 'loans', 'invoices'].includes(
      resource,
    )
  ) {
    if (teacher)
      return {
        sql: `${alias}.student_id IN (SELECT id FROM students WHERE class_id IN (${list.map(() => '?').join(',')}))`,
        params: list,
      };
    return { sql: `${alias}.student_id=?`, params: [user.student_id || -1] };
  }
  if (resource === 'payments')
    return {
      sql: `${alias}.invoice_id IN (SELECT id FROM invoices WHERE student_id=?)`,
      params: [user.student_id || -1],
    };
  if (['assignments', 'exams', 'schedules'].includes(resource)) return inClasses('class_id');
  if (['staff', 'staff_attendance', 'staff_payroll', 'payroll'].includes(resource))
    return teacher && resource === 'payroll'
      ? { sql: `${alias}.teacher_id=?`, params: [user.teacher_id || -1] }
      : { sql: '1=0', params: [] };
  if (['leaves', 'reservations', 'student_years', 'meeting_bookings'].includes(resource)) {
    if (teacher)
      return {
        sql: `${alias}.student_id IN (SELECT id FROM students WHERE class_id IN (${list.map(() => '?').join(',')}))`,
        params: list,
      };
    return { sql: `${alias}.student_id=?`, params: [user.student_id || -1] };
  }
  if (resource === 'meeting_slots') {
    if (teacher) return { sql: `${alias}.teacher_id=?`, params: [user.teacher_id || -1] };
    return {
      sql: `${alias}.class_id IN (${list.map(() => '?').join(',')})`,
      params: list,
    };
  }
  if (resource === 'announcements' && teacher)
    return {
      sql: `(${alias}.class_id IS NULL OR ${alias}.class_id IN (${list.map(() => '?').join(',')})) AND (${alias}.audience IN ('all','teacher') OR ${alias}.author_id=?)`,
      params: [...list, user.id],
    };
  if (resource === 'announcements')
    return {
      sql: `(${alias}.class_id IS NULL OR ${alias}.class_id IN (${list.map(() => '?').join(',')})) AND (${alias}.audience='all' OR ${alias}.audience=?) AND ${alias}.publish_date<=?`,
      params: [...list, user.role, today()],
    };
  if (resource === 'events')
    return {
      sql: `(${alias}.class_id IS NULL OR ${alias}.class_id IN (${list.map(() => '?').join(',')}))`,
      params: list,
    };
  if (resource === 'routes' && !teacher)
    return {
      sql: `${alias}.id IN (SELECT route_id FROM students WHERE id=?)`,
      params: [user.student_id || -1],
    };
  // Defence in depth: a resource added to the registry without an explicit scope rule
  // stays invisible to non-admins instead of silently becoming world-readable.
  return { sql: '1=0', params: [] };
}
export function teachesSubject(db, user, classId, subjectId) {
  return (
    user.role === 'admin' ||
    !!db.get('SELECT id FROM schedules WHERE teacher_id=? AND class_id=? AND subject_id=?', [
      user.teacher_id || -1,
      classId,
      subjectId,
    ])
  );
}
export function assertScope(db, resource, row, user, write = false) {
  if (user.role === 'admin') return;
  if (!write) {
    const s = scope(db, resource, user);
    assert(
      !!db.get(`SELECT r.id FROM "${resource}" r WHERE r.id=? AND (${s.sql})`, [
        row.id,
        ...s.params,
      ]),
      403,
      'شما به این پرونده دسترسی ندارید.',
    );
    return;
  }
  if (user.role === 'teacher') {
    const classes = teacherClasses(db, user);
    if ('class_id' in row)
      assert(
        row.class_id && classes.includes(Number(row.class_id)),
        403,
        'فقط کلاس‌های تخصیص‌یافته به شما قابل مدیریت هستند.',
      );
    if ('student_id' in row && resource !== 'grades')
      assert(
        studentIds(db, user).includes(Number(row.student_id)),
        403,
        'این دانش‌آموز در کلاس شما نیست.',
      );
    if ('teacher_id' in row && row.teacher_id)
      assert(Number(row.teacher_id) === user.teacher_id, 403, 'این رکورد متعلق به معلم دیگری است.');
    if (['grades', 'exams', 'assignments'].includes(resource)) {
      const classId =
        row.class_id ||
        db.get('SELECT class_id FROM students WHERE id=?', [row.student_id])?.class_id;
      assert(
        teachesSubject(db, user, classId, row.subject_id),
        403,
        'ثبت یا ارزیابی فقط برای درس تخصیص‌یافته به شما در برنامه هفتگی مجاز است.',
      );
    }
    if (row.id) {
      if (resource === 'assignments')
        assert(row.teacher_id === user.teacher_id, 403, 'این تکلیف به معلم دیگری تخصیص یافته است.');
      else
        assert(
          row.author_id === user.id,
          403,
          'ویرایش یا حذف سابقه ثبت‌شده توسط همکار یا مدیر مجاز نیست.',
        );
    }
  } else {
    assert(
      resource === 'documents' && Number(row.student_id) === user.student_id,
      403,
      'امکان ویرایش پرونده دیگران وجود ندارد.',
    );
    if (row.id)
      assert(
        row.author_id === user.id,
        403,
        'فقط مدارکی که خودتان ثبت کرده‌اید قابل ویرایش یا حذف هستند.',
      );
  }
}
export function recordPermissions(db, security, resource, row, user) {
  let writable = true;
  try {
    assertScope(db, resource, row, user, true);
  } catch (error) {
    if (error.status !== 403) throw error;
    writable = false;
  }
  const def = resourceDefs[resource];
  return {
    edit: writable && def.write.includes(user.role) && security.enabled(`${resource}.edit`),
    delete: writable && def.write.includes(user.role) && security.enabled(`${resource}.delete`),
    ...(resource === 'assignments'
      ? {
          review:
            writable &&
            ['admin', 'teacher'].includes(user.role) &&
            security.enabled('assignments.review'),
        }
      : {}),
  };
}
export function accountRecord(db, user) {
  if (user.role === 'admin') return null;
  const resource = user.role === 'teacher' ? 'teachers' : 'students';
  const row = db.get(`SELECT * FROM "${resource}" WHERE id=?`, [
    user.role === 'teacher' ? user.teacher_id || -1 : user.student_id || -1,
  ]);
  const field = user.role === 'parent' ? 'guardian_user_id' : 'user_id';
  return row?.[field] === user.id ? row : undefined;
}
export function accountUsable(db, user) {
  return !!user.active && (user.role === 'admin' || accountRecord(db, user)?.status === 'active');
}
// active is the administrator's explicit choice; a record suspension is a separate gate.
export function syncLinkedAccounts(db, resource, row, old = null) {
  if (!['students', 'teachers'].includes(resource)) return;
  if (row.user_id) {
    const changes = {};
    if (!old || old.first_name !== row.first_name || old.last_name !== row.last_name)
      changes.full_name = `${row.first_name} ${row.last_name}`;
    for (const field of ['email', 'phone'])
      if (!old || old[field] !== row[field]) changes[field] = row[field];
    const keys = Object.keys(changes);
    if (keys.length)
      db.run(`UPDATE users SET ${keys.map((key) => `${key}=?`).join(',')} WHERE id=?`, [
        ...Object.values(changes),
        row.user_id,
      ]);
  }
  if (row.status !== 'active')
    db.run(
      `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE ${resource === 'students' ? 'student_id' : 'teacher_id'}=?)`,
      [row.id],
    );
}
export function positiveId(value, label = 'شناسه') {
  const normalized = typeof value === 'string' ? digits(value) : value;
  const n = Number(normalized);
  assert(
    (typeof normalized === 'number' ||
      (typeof normalized === 'string' && /^\d+$/.test(normalized))) &&
      Number.isSafeInteger(n) &&
      n > 0 &&
      n <= 1e12,
    422,
    `${label} باید عدد صحیح مثبت باشد.`,
  );
  return n;
}
export function pageNumber(value, fallback = 1, maximum = 10000) {
  if (value === undefined) return fallback;
  const n = positiveId(value, 'صفحه / تعداد');
  assert(n <= maximum, 422, 'صفحه یا تعداد از حد مجاز بیشتر است.');
  return n;
}
export function assertRevision(row, supplied) {
  if (supplied === undefined) return;
  assert(
    positiveId(supplied, 'نسخه رکورد') === row.revision,
    409,
    'این رکورد هم‌زمان تغییر کرده است؛ دوباره دریافت کنید و تغییرات را بررسی کنید.',
    'STALE_RECORD',
  );
}
export function assertFileContext(db, fileId, user, context, previousFileId = null) {
  if (!fileId || fileId === previousFileId) return;
  const file = db.get('SELECT * FROM files WHERE id=?', [fileId]);
  assert(
    file && file.owner_id === user.id,
    403,
    'فقط فایل بارگذاری‌شده توسط خودتان قابل استفاده است.',
  );
  assert(
    file.context === context || file.context === 'legacy',
    403,
    'فایل برای این نوع فعالیت بارگذاری نشده است؛ دوباره در همین بخش بارگذاری کنید.',
  );
}
export function csv(rows, columns) {
  const cell = (value) => {
    let s = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return (
    '\uFEFF' +
    [
      columns.map((c) => cell(c.label)).join(','),
      ...rows.map((row) => columns.map((c) => cell(row[c.key])).join(',')),
    ].join('\r\n')
  );
}
export function createAccount(db, resource, row, security) {
  assert(['students', 'teachers'].includes(resource), 400, 'نوع حساب معتبر نیست.');
  assert(security.enabled(`${resource}.account`), 403, 'ساخت حساب کاربری غیرفعال است.');
  // A user row may already reference this record even when the record's own link is stale;
  // repair the link instead of creating a second login for the same person.
  const column = resource === 'students' ? 'student_id' : 'teacher_id';
  const existing = db.get(`SELECT id FROM users WHERE ${column}=? LIMIT 1`, [row.id]);
  if (existing) {
    if (row.user_id !== existing.id)
      db.run(`UPDATE "${resource}" SET user_id=? WHERE id=?`, [existing.id, row.id]);
    throw new HttpError(
      409,
      'این پرونده از قبل حساب کاربری دارد؛ برای تغییر رمز از بازنشانی رمز استفاده کنید.',
    );
  }
  assert(!row.user_id, 409, 'این فرد قبلاً حساب کاربری دارد.');
  const temporary_password = randomPassword();
  const base = `${resource === 'students' ? 's' : 't'}${row.national_id || row.id}`;
  let username = base,
    suffix = 1;
  while (db.get('SELECT id FROM users WHERE username=?', [username]))
    username = `${base}_${suffix++}`;
  const uid = db.insert('users', {
    username,
    password_hash: bcrypt.hashSync(temporary_password, 10),
    full_name: `${row.first_name} ${row.last_name}`,
    role: resource === 'students' ? 'student' : 'teacher',
    email: row.email || null,
    phone: row.phone || null,
    [resource === 'students' ? 'student_id' : 'teacher_id']: row.id,
    must_change_password: 1,
  });
  db.run(`UPDATE "${resource}" SET user_id=? WHERE id=?`, [uid, row.id]);
  return { username, temporary_password };
}
