import { Router } from 'express';
import multer from 'multer';
import { parse as parseCSV } from 'csv-parse/sync';
import { z } from 'zod';
import { deliverAnnouncements } from './announcements.js';
import { buildXlsx, sheetsFromRows } from '../shared/xlsx.js';
import { resourceDefs, resourceLabel } from '../shared/catalog.js';
import {
  HttpError,
  assert,
  assertScope,
  scope,
  digits,
  validDate,
  today,
  log,
  notify,
  csv,
  createAccount,
  syncLinkedAccounts,
  assertFileContext,
  positiveId,
  pageNumber,
  recordPermissions,
  assertRevision,
} from './security.js';

export function validateRecord(db, resource, input, { update = false } = {}) {
  const def = resourceDefs[resource];
  assert(
    input && typeof input === 'object' && !Array.isArray(input),
    422,
    'اطلاعات فرم معتبر نیست.',
  );
  const output = {};
  for (const f of def.fields) {
    let value = input[f.name];
    if (value === undefined && update) continue;
    if (value === undefined && !update && f.default !== undefined) value = f.default;
    if (value === undefined || value === null || value === '') {
      assert(
        !f.required && f.default === undefined,
        422,
        `${f.label} الزامی است و نمی‌تواند خالی باشد.`,
      );
      output[f.name] = null;
      continue;
    }
    if (['number', 'reference', 'file'].includes(f.type)) {
      assert(['string', 'number'].includes(typeof value), 422, `${f.label} باید مقدار عددی باشد.`);
      const n = Number(digits(value));
      assert(Number.isFinite(n), 422, `${f.label} باید عدد معتبر باشد.`);
      assert(
        !['reference', 'file'].includes(f.type) || (Number.isSafeInteger(n) && n > 0),
        422,
        `${f.label} معتبر نیست.`,
      );
      assert(!f.integer || Number.isSafeInteger(n), 422, `${f.label} باید عدد صحیح باشد.`);
      assert(f.min === undefined || n >= f.min, 422, `${f.label} کمتر از حد مجاز است.`);
      assert(f.max === undefined || n <= f.max, 422, `${f.label} بیشتر از حد مجاز است.`);
      assert(n <= 1e12, 422, `${f.label} بیشتر از حد مجاز است.`);
      if (f.type === 'reference')
        assert(
          !!db.get(`SELECT id FROM "${f.resource}" WHERE id=?`, [n]),
          422,
          `${f.label} انتخاب‌شده وجود ندارد.`,
        );
      if (f.type === 'file')
        assert(
          !!db.get('SELECT id FROM files WHERE id=?', [n]),
          422,
          'فایل انتخاب‌شده وجود ندارد.',
        );
      output[f.name] = n;
    } else {
      assert(typeof value === 'string' || typeof value === 'number', 422, `${f.label} معتبر نیست.`);
      value = String(value).trim();
      assert(
        value.length <= (f.type === 'textarea' ? 10000 : 300),
        422,
        `${f.label} بیش از حد طولانی است.`,
      );
      assert(!f.required || value.length > 0, 422, `${f.label} الزامی است.`);
      if (f.type === 'select')
        assert(
          f.options.some((o) => o.value === value),
          422,
          `${f.label} انتخاب‌شده معتبر نیست.`,
        );
      if (f.type === 'date') {
        value = digits(value);
        assert(validDate(value), 422, `${f.label} معتبر نیست.`);
      }
      if (f.type === 'time') {
        value = digits(value);
        assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(value), 422, `${f.label} معتبر نیست.`);
      }
      if (f.type === 'email')
        assert(z.email().safeParse(value).success, 422, 'نشانی ایمیل معتبر نیست.');
      if (f.type === 'tel') {
        value = digits(value).replace(/[\s\-()]/g, '');
        assert(
          /^(?:0\d{10}|\+\d{10,14})$/.test(value),
          422,
          `${f.label} باید شماره معتبر ۱۱ رقمی باشد.`,
        );
      }
      if (f.pattern === 'national') {
        value = digits(value);
        assert(/^\d{10}$/.test(value), 422, 'کد ملی باید ۱۰ رقم باشد.');
      }
      output[f.name] = value;
    }
  }
  return output;
}

export function businessRules(db, resource, row, id = 0) {
  const old = id ? db.get(`SELECT * FROM "${resource}" WHERE id=?`, [id]) : null;
  const cls = row.class_id ? db.get('SELECT * FROM classes WHERE id=?', [row.class_id]) : null;
  if (row.subject_id && cls) {
    const subject = db.get('SELECT * FROM subjects WHERE id=?', [row.subject_id]);
    assert(
      subject.grade === 'all' || subject.grade === cls.grade,
      422,
      'پایه درس با پایه کلاس مطابقت ندارد.',
    );
  }
  if (row.teacher_id)
    assert(
      db.get('SELECT status FROM teachers WHERE id=?', [row.teacher_id])?.status === 'active',
      422,
      'معلم انتخاب‌شده باید فعال باشد.',
    );
  if (resource === 'students') {
    assert(
      !row.birth_date || row.birth_date <= today(),
      422,
      'تاریخ تولد نمی‌تواند در آینده باشد.',
    );
    if (row.route_id && row.status === 'active') {
      const route = db.get('SELECT capacity FROM routes WHERE id=?', [row.route_id]);
      const passengers = db.get(
        "SELECT COUNT(*) n FROM students WHERE route_id=? AND status='active' AND id!=?",
        [row.route_id, id],
      ).n;
      // Legacy overcapacity does not block unrelated edits, but cannot increase further.
      if (!old || old.route_id !== row.route_id || old.status !== 'active')
        assert(passengers < route.capacity, 409, 'ظرفیت سرویس مدرسه تکمیل است.');
    }
  }
  if (resource === 'announcements' && row.expires_at)
    assert(row.expires_at >= row.publish_date, 422, 'پایان نمایش نمی‌تواند قبل از انتشار باشد.');
  if (resource === 'visitors' && row.exit_time)
    assert(row.exit_time >= row.entry_time, 422, 'ساعت خروج نمی‌تواند قبل از ورود باشد.');
  if (resource === 'payroll' && row.status === 'paid')
    assert(
      row.payment_date && row.payment_date <= today(),
      422,
      'فیش پرداخت‌شده به تاریخ پرداخت غیرآینده نیاز دارد.',
    );
  if (['payments', 'expenses'].includes(resource)) {
    const date = row.payment_date || row.expense_date;
    assert(!date || date <= today(), 422, 'تاریخ ثبت پرداخت یا هزینه نمی‌تواند در آینده باشد.');
  }
  if (resource === 'subjects' && old && old.grade !== row.grade && row.grade !== 'all') {
    const mismatch = db.get(
      `SELECT id FROM classes WHERE grade!=? AND id IN (
      SELECT class_id FROM schedules WHERE subject_id=? UNION SELECT class_id FROM assignments WHERE subject_id=?
      UNION SELECT class_id FROM exams WHERE subject_id=? UNION SELECT class_id FROM grades WHERE subject_id=?) LIMIT 1`,
      [row.grade, id, id, id, id],
    );
    assert(!mismatch, 409, 'این درس در پایه‌های دیگر سابقه دارد؛ پایه آن قابل محدودکردن نیست.');
  }
  if (resource === 'classes' && old && old.grade !== row.grade) {
    assert(
      !db.get(
        `SELECT id FROM subjects WHERE grade NOT IN ('all',?) AND id IN (
      SELECT subject_id FROM schedules WHERE class_id=? UNION SELECT subject_id FROM assignments WHERE class_id=?
      UNION SELECT subject_id FROM exams WHERE class_id=?) LIMIT 1`,
        [row.grade, id, id, id],
      ),
      409,
      'پایه جدید با دروس و برنامه ثبت‌شده کلاس ناسازگار است.',
    );
  }
  if (resource === 'assignments') {
    if (old && db.get('SELECT id FROM submissions WHERE assignment_id=? LIMIT 1', [id])) {
      assert(
        row.class_id === old.class_id && row.subject_id === old.subject_id,
        409,
        'کلاس و درس تکلیف دارای پاسخ قابل تغییر نیست؛ تکلیف جدید بسازید.',
      );
      if (row.max_score !== old.max_score)
        assert(
          !db.get(
            'SELECT id FROM submissions WHERE assignment_id=? AND score IS NOT NULL LIMIT 1',
            [id],
          ),
          409,
          'مقیاس تکلیف ارزیابی‌شده قابل تغییر نیست.',
        );
    }
  }
  if (resource === 'assignments' && row.teacher_id)
    assert(
      db.get('SELECT id FROM schedules WHERE class_id=? AND subject_id=? AND teacher_id=?', [
        row.class_id,
        row.subject_id,
        row.teacher_id,
      ]),
      422,
      'معلم تکلیف باید در همین کلاس و درس تخصیص داشته باشد.',
    );
  if (resource === 'exams' && old && db.get('SELECT id FROM grades WHERE exam_id=? LIMIT 1', [id]))
    assert(
      row.class_id === old.class_id &&
        row.subject_id === old.subject_id &&
        row.max_score === old.max_score,
      409,
      'کلاس، درس و مقیاس آزمون دارای نمره قابل تغییر نیست.',
    );

  if (row.start_date && row.end_date)
    assert(row.end_date >= row.start_date, 422, 'تاریخ پایان نباید قبل از شروع باشد.');
  if (resource === 'grades') {
    if (old)
      assert(
        row.student_id === old.student_id && row.class_id === old.class_id,
        409,
        'نمره ثبت‌شده قابل انتقال به دانش‌آموز یا کلاس دیگر نیست.',
      );
    else
      assert(
        db.get('SELECT status FROM students WHERE id=?', [row.student_id])?.status === 'active',
        422,
        'دانش‌آموز باید فعال باشد.',
      );
    assert(row.score <= row.max_score, 422, 'نمره نمی‌تواند از نمره کامل بیشتر باشد.');
    if (row.exam_id) {
      const exam = db.get('SELECT * FROM exams WHERE id=?', [row.exam_id]);
      const student = db.get('SELECT class_id FROM students WHERE id=?', [row.student_id]);
      assert(
        exam.class_id === (row.class_id || student.class_id) &&
          exam.subject_id === row.subject_id &&
          exam.max_score === row.max_score,
        422,
        'آزمون باید مربوط به کلاس و درس ارزشیابی باشد و مقیاس نمره یکسان داشته باشد.',
      );
    }
  }
  if (resource === 'students' && row.status === 'active') {
    const cls = db.get('SELECT capacity FROM classes WHERE id=?', [row.class_id]);
    const count = db.get(
      "SELECT COUNT(*) n FROM students WHERE class_id=? AND status='active' AND id!=?",
      [row.class_id, id],
    ).n;
    assert(count < cls.capacity, 409, 'ظرفیت این کلاس تکمیل است.');
  }
  if (resource === 'classes')
    assert(
      row.capacity >=
        db.get("SELECT COUNT(*) n FROM students WHERE class_id=? AND status='active'", [id]).n,
      409,
      'ظرفیت نمی‌تواند کمتر از تعداد دانش‌آموزان کلاس باشد.',
    );
  if (resource === 'schedules') {
    assert(row.end_time > row.start_time, 422, 'ساعت پایان باید بعد از ساعت شروع باشد.');
    const overlap = db.get(
      'SELECT id FROM schedules WHERE id!=? AND day=? AND (class_id=? OR teacher_id=?) AND start_time<? AND end_time>?',
      [id, row.day, row.class_id, row.teacher_id, row.end_time, row.start_time],
    );
    assert(!overlap, 409, 'این زنگ با برنامه کلاس یا معلم تداخل دارد.');
  }
  if (resource === 'invoices') {
    if (old && row.student_id !== old.student_id)
      assert(
        !db.get('SELECT id FROM payments WHERE invoice_id=? LIMIT 1', [id]),
        409,
        'صورتحساب دارای رسید قابل انتقال به دانش‌آموز دیگری نیست.',
      );
    const paid = db.get('SELECT COALESCE(SUM(amount),0) n FROM payments WHERE invoice_id=?', [
      id,
    ]).n;
    assert(
      Number(row.discount || 0) <= Number(row.amount || 0),
      422,
      'تخفیف نمی‌تواند از مبلغ صورتحساب بیشتر باشد.',
    );
    assert(
      Number(row.discount || 0) > 0 || !row.discount_reason,
      422,
      'برای تخفیف، مبلغ تخفیف را هم وارد کنید.',
    );
    assert(
      payable(row) >= paid,
      422,
      'مبلغ قابل پرداخت صورتحساب نمی‌تواند کمتر از پرداخت‌های ثبت‌شده باشد.',
    );
  }
  if (resource === 'payments') {
    if (old)
      assert(
        row.invoice_id === old.invoice_id,
        409,
        'رسید را نمی‌توان به صورتحساب دیگر منتقل کرد؛ ابتدا اصلاح را با حذف و ثبت رسید جدید انجام دهید.',
      );
    const invoice = db.get('SELECT * FROM invoices WHERE id=?', [row.invoice_id]);
    const paid = db.get(
      'SELECT COALESCE(SUM(amount),0) n FROM payments WHERE invoice_id=? AND id!=?',
      [row.invoice_id, id],
    ).n;
    assert(row.amount <= payable(invoice) - paid, 422, 'پرداخت از مانده صورتحساب بیشتر است.');
  }
  if (resource === 'loans') {
    assert(
      row.borrow_date <= today() && (!row.return_date || row.return_date <= today()),
      422,
      'تاریخ امانت یا بازگشت نمی‌تواند در آینده باشد.',
    );
    if (old)
      assert(
        old.book_id === row.book_id && old.student_id === row.student_id,
        409,
        'رکورد امانت را نمی‌توان به کتاب یا دانش‌آموز دیگری منتقل کرد.',
      );
    assert(row.due_date >= row.borrow_date, 422, 'مهلت بازگشت باید بعد از تاریخ امانت باشد.');
    if (row.return_date)
      assert(row.return_date >= row.borrow_date, 422, 'بازگشت قبل از امانت امکان‌پذیر نیست.');
    if (row.return_date && (!old || !old.return_date)) {
      // First time the copy comes back: compute the fine with the configured daily rate.
      const rate = Number(db.setting('library', {}).daily_fine || 0);
      const lateDays = Math.max(
        0,
        Math.round((Date.parse(row.return_date) - Date.parse(row.due_date)) / 86400000),
      );
      row.fine = lateDays > 0 ? lateDays * rate : 0;
      row.fine_status =
        lateDays > 0 && rate > 0
          ? row.fine_status === 'paid'
            ? 'paid'
            : 'due'
          : row.fine_status || 'none';
    }
    if (!row.return_date) {
      const copies = db.get('SELECT copies FROM books WHERE id=?', [row.book_id]).copies;
      const active = db.get(
        'SELECT COUNT(*) n FROM loans WHERE book_id=? AND return_date IS NULL AND id!=?',
        [row.book_id, id],
      ).n;
      assert(active < copies, 409, 'نسخه‌ای از این کتاب برای امانت موجود نیست.');
    }
  }
  if (resource === 'books')
    assert(
      row.copies >=
        db.get('SELECT COUNT(*) n FROM loans WHERE book_id=? AND return_date IS NULL', [id]).n,
      409,
      'تعداد نسخه کمتر از امانت‌های فعال است.',
    );
  if (resource === 'payroll')
    assert((row.deductions || 0) <= row.gross, 422, 'کسورات نمی‌تواند از حقوق بیشتر باشد.');
}
const familyIds = (db, studentId) => {
  const student = db.get('SELECT user_id,guardian_user_id FROM students WHERE id=?', [studentId]);
  return [student?.user_id, student?.guardian_user_id].filter(Boolean);
};
const classFamilyIds = (db, classId) => {
  const ids = new Set();
  for (const student of db.all(
    "SELECT user_id,guardian_user_id FROM students WHERE class_id=? AND status='active'",
    [classId],
  ))
    for (const id of [student.user_id, student.guardian_user_id]) if (id) ids.add(id);
  return [...ids];
};
const faNumber = (value) => Number(value || 0).toLocaleString('fa-IR');
const payable = (invoice) =>
  Math.max(
    0,
    Number(invoice.amount || 0) - Number(invoice.discount || 0) + Number(invoice.late_fee || 0),
  );
const recalcInvoice = (db, id) => {
  if (!id) return;
  const paid = db.get('SELECT COALESCE(SUM(amount),0) n FROM payments WHERE invoice_id=?', [id]).n;
  const invoice = db.get('SELECT * FROM invoices WHERE id=?', [id]);
  if (invoice)
    db.run(
      "UPDATE invoices SET paid_amount=?,net_amount=?,remaining=?,status=?,revision=revision+1,updated_at=datetime('now') WHERE id=?",
      [
        paid,
        payable(invoice),
        Math.max(0, payable(invoice) - paid),
        paid >= payable(invoice) ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
        id,
      ],
    );
};

export function resourceRouter(db, security) {
  const router = Router();
  router.use(security.auth);
  const check = (req, action) => {
    const resource = req.params.resource;
    const def = resourceDefs[resource];
    assert(Object.hasOwn(resourceDefs, resource), 404, 'این بخش وجود ندارد.');
    assert(
      (action === 'view' ? def.read : def.write).includes(req.user.role),
      403,
      'شما اجازه انجام این عملیات را ندارید.',
    );
    assert(
      security.entitled(`${resource}.${action}`),
      403,
      'این بخش در لایسنس این مدرسه فعال نشده است؛ برای خرید ماژول با پشتیبانی تماس بگیرید.',
      'LICENSE_REQUIRED',
    );
    assert(
      security.enabled(`${resource}.${action}`),
      403,
      'این قابلیت یا پیش‌نیاز مشاهده آن توسط مدیر مدرسه غیرفعال شده است.',
      'FEATURE_DISABLED',
    );
    return def;
  };
  const sortClause = (req, def) => {
    const allowed = new Set(['id', ...def.fields.map((f) => f.name)]);
    const column = String(req.query.sort || '');
    if (!column) return 'r.id DESC';
    assert(allowed.has(column), 422, 'ستون مرتب‌سازی معتبر نیست.');
    const dir = String(req.query.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    return `r."${column}" ${dir}, r.id DESC`;
  };
  const filters = (req) => {
    const resource = req.params.resource,
      def = resourceDefs[resource],
      s = scope(db, resource, req.user);
    const clauses = [`(${s.sql})`],
      params = [...s.params];
    const q = String(req.query.q || '')
      .trim()
      .slice(0, 200);
    if (q) {
      const names = def.fields
        .filter((f) => ['text', 'email', 'tel'].includes(f.type))
        .map((f) => f.name);
      const terms = names.map((name) => `CAST(r."${name}" AS TEXT) LIKE ?`);
      params.push(...names.map(() => `%${q}%`));
      if (def.fields.some((f) => f.name === 'first_name')) {
        terms.push("(r.first_name || ' ' || r.last_name) LIKE ?");
        params.push(`%${q}%`);
      }
      if (terms.length) clauses.push(`(${terms.join(' OR ')})`);
    }
    for (const f of [...def.fields, ...(def.computed || [])])
      if (req.query[f.name] !== undefined && req.query[f.name] !== '') {
        clauses.push(`r."${f.name}"=?`);
        params.push(String(req.query[f.name]));
      }
    return { sql: clauses.join(' AND '), params };
  };
  router.get('/:resource/export', (req, res) => {
    const def = check(req, 'view');
    assert(
      security.enabled(req.params.resource === 'students' ? 'students.export' : 'reports.export'),
      403,
      'خروجی غیرفعال است.',
    );
    const where = filters(req);
    const rows = db.all(
      `SELECT r.* FROM "${req.params.resource}" r WHERE ${where.sql} ORDER BY ${sortClause(req, def)} LIMIT 10000`,
      where.params,
    );
    const cols = [...def.fields, ...(def.computed || [])];
    const output = rows.map((row) =>
      Object.fromEntries(
        cols.map((f) => {
          let val = row[f.name];
          if (f.type === 'reference' && val)
            val = !security.enabled(`${f.resource}.view`)
              ? `#${val}`
              : resourceLabel(
                  f.resource,
                  db.get(`SELECT * FROM "${f.resource}" WHERE id=?`, [val]),
                );
          if (f.type === 'select')
            val = f.options.find((o) => o.value === String(val))?.label || val;
          return [f.name, val];
        }),
      ),
    );
    const columnDefs = cols.map((f) => ({ key: f.name, label: f.label }));
    if (String(req.query.format || '').toLowerCase() === 'xlsx') {
      assert(
        security.enabled('exports.xlsx'),
        403,
        'خروجی اکسل توسط مدیر غیرفعال شده است.',
        'FEATURE_DISABLED',
      );
      const workbook = buildXlsx(
        sheetsFromRows(columnDefs, output, resourceDefs[req.params.resource].title),
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${req.params.resource}-${today()}.xlsx"`,
      );
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(workbook);
    }
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${req.params.resource}-${today()}.csv"`,
    );
    return res.type('text/csv; charset=utf-8').send(csv(output, columnDefs));
  });
  const importUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024, files: 1 },
  });
  router.post(
    '/students/import',
    security.admin,
    security.feature('students.import'),
    security.feature('students.create'),
    importUpload.single('file'),
    (req, res) => {
      assert(req.file, 422, 'فایل CSV را انتخاب کنید.');
      let records;
      try {
        records = parseCSV(req.file.buffer.toString('utf8'), {
          columns: true,
          bom: true,
          trim: true,
          skip_empty_lines: true,
        });
      } catch {
        throw new HttpError(422, 'ساختار CSV صحیح نیست.');
      }
      assert(
        records.length > 0 && records.length <= 50,
        422,
        'در هر فایل بین ۱ تا ۵۰ دانش‌آموز وارد کنید.',
      );
      const credentials = [];
      db.transaction(() => {
        records.forEach((raw, index) => {
          try {
            const normalized = {};
            for (const f of resourceDefs.students.fields)
              if (raw[f.name] !== undefined || raw[f.label] !== undefined)
                normalized[f.name] = raw[f.name] ?? raw[f.label];
            const row = validateRecord(db, 'students', normalized);
            businessRules(db, 'students', row);
            const id = db.insert('students', { ...row, author_id: req.user.id });
            if (security.enabled('students.account'))
              credentials.push({
                student: `${row.first_name} ${row.last_name}`,
                ...createAccount(db, 'students', { ...row, id }, security),
              });
          } catch (error) {
            throw new HttpError(
              error.status || 409,
              `ردیف ${index + 2}: ${error.status ? error.message : 'کد ملی تکراری یا اطلاعات نامعتبر است.'}`,
            );
          }
        });
        log(db, req.user, 'students.import', 'students', null, { count: records.length });
      });
      res.status(201).json({ count: records.length, credentials });
    },
  );
  router.get('/:resource', (req, res) => {
    const def = check(req, 'view');
    const where = filters(req);
    const page = pageNumber(req.query.page);
    const limit = pageNumber(req.query.limit, 10, 100);
    const total = db.get(
      `SELECT COUNT(*) n FROM "${req.params.resource}" r WHERE ${where.sql}`,
      where.params,
    ).n;
    const order = sortClause(req, def);
    const rows = db.all(
      `SELECT r.* FROM "${req.params.resource}" r WHERE ${where.sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...where.params, limit, (page - 1) * limit],
    );
    if (req.params.resource === 'classes')
      for (const row of rows)
        row.student_count = db.get(
          "SELECT COUNT(*) n FROM students WHERE class_id=? AND status='active'",
          [row.id],
        ).n;
    for (const row of rows)
      row.permissions = recordPermissions(db, security, req.params.resource, row, req.user);
    res.json({ rows, total, page, limit, pages: Math.ceil(total / limit) });
  });
  // Bulk operations keep per-record scope, revision and business checks, so a checkbox in
  // the UI can never do something a single-row request could not.
  router.post('/:resource/bulk', (req, res) => {
    const def = check(req, 'delete');
    const resource = req.params.resource;
    const data = z
      .object({
        action: z.enum(['delete', 'update']),
        ids: z.array(z.number().int().positive()).min(1).max(200),
        patch: z.record(z.string(), z.unknown()).optional().default({}),
        revision: z.number().int().positive().optional(),
      })
      .parse(req.body || {});
    if (data.action === 'update')
      assert(
        def.write.includes(req.user.role) && security.enabled(`${resource}.edit`),
        403,
        'ویرایش گروهی برای نقش شما مجاز نیست.',
      );
    const results = { ok: [], failed: [] };
    for (const id of [...new Set(data.ids)]) {
      try {
        const row = db.get(`SELECT * FROM "${resource}" WHERE id=?`, [id]);
        assert(row, 404, 'رکورد پیدا نشد.');
        assertScope(db, resource, row, req.user);
        assertScope(db, resource, row, req.user, true);
        if (data.action === 'update') {
          const patch = validateRecord(db, resource, data.patch, { update: true });
          assert(Object.keys(patch).length, 422, 'تغییری برای اعمال وجود ندارد.');
          assertRevision(row, data.revision);
          const combined = { ...row, ...patch };
          assertScope(db, resource, combined, req.user, true);
          assertFileContext(db, combined.file_id, req.user, resource, row.file_id);
          businessRules(db, resource, combined, row.id);
          db.transaction(() => {
            db.run(
              `UPDATE "${resource}" SET ${Object.keys(patch)
                .map((key) => `"${key}"=?`)
                .join(',')},updated_at=datetime('now'),revision=revision+1 WHERE id=?`,
              [...Object.values(patch), id],
            );
            log(db, req.user, `${resource}.bulk_edit`, resource, id, { count: 1 });
          });
        } else {
          assertRevision(row, data.revision);
          if (resource === 'students')
            assert(
              !db.get(
                'SELECT id FROM attendance WHERE student_id=? UNION SELECT id FROM submissions WHERE student_id=? LIMIT 1',
                [row.id, row.id],
              ),
              409,
              'پرونده دارای سابقه قابل حذف نیست؛ آن را غیرفعال کنید.',
            );
          db.transaction(() => {
            const linked = ['students', 'teachers'].includes(resource)
              ? db.all(
                  `SELECT id FROM users WHERE ${resource === 'students' ? 'student_id' : 'teacher_id'}=?`,
                  [row.id],
                )
              : [];
            db.run(`DELETE FROM "${resource}" WHERE id=?`, [row.id]);
            for (const account of linked) {
              db.run('UPDATE users SET active=0,student_id=NULL,teacher_id=NULL WHERE id=?', [
                account.id,
              ]);
              db.run('DELETE FROM sessions WHERE user_id=?', [account.id]);
            }
            if (resource === 'payments') recalcInvoice(db, row.invoice_id);
            log(db, req.user, `${resource}.bulk_delete`, resource, id);
          });
        }
        results.ok.push(id);
      } catch (error) {
        const parts = String(error.message || '').split('ردیف ');
        results.failed.push({ id, error: parts.length > 1 ? parts[1] : error.message });
      }
    }
    res.json({
      ...results,
      requested: data.ids.length,
      message: `${results.ok.length} رکورد انجام شد${results.failed.length ? ` و ${results.failed.length} مورد رد شد` : ''}.`,
    });
  });
  router.get('/:resource/:id', (req, res) => {
    check(req, 'view');
    const row = db.get(`SELECT * FROM "${req.params.resource}" WHERE id=?`, [
      positiveId(req.params.id),
    ]);
    assert(row, 404, 'این رکورد پیدا نشد.');
    assertScope(db, req.params.resource, row, req.user);
    res.json({
      ...row,
      permissions: recordPermissions(db, security, req.params.resource, row, req.user),
    });
  });
  const save = (req, res, update) => {
    const def = check(req, update ? 'edit' : 'create'),
      resource = req.params.resource;
    const old = update
      ? db.get(`SELECT * FROM "${resource}" WHERE id=?`, [positiveId(req.params.id)])
      : null;
    if (update) {
      assert(old, 404, 'رکورد پیدا نشد.');
      assertScope(db, resource, old, req.user);
      assertScope(db, resource, old, req.user, true);
      assertRevision(old, req.body?.revision);
    }
    const data = validateRecord(db, resource, req.body, { update });
    if (req.user.role === 'teacher' && def.fields.some((f) => f.name === 'teacher_id'))
      data.teacher_id = req.user.teacher_id;
    if (resource === 'grades')
      data.class_id =
        old?.class_id ||
        db.get('SELECT class_id FROM students WHERE id=?', [data.student_id || old?.student_id])
          ?.class_id;
    const combined = { ...old, ...data };
    assertScope(db, resource, combined, req.user, true);
    assertFileContext(db, combined.file_id, req.user, resource, old?.file_id);
    businessRules(db, resource, combined, old?.id);
    let account, row;
    db.transaction(() => {
      let id;
      if (update) {
        id = old.id;
        const keys = Object.keys(data);
        assert(keys.length > 0, 422, 'تغییری برای ذخیره وجود ندارد.');
        db.run(
          `UPDATE "${resource}" SET ${keys.map((k) => `"${k}"=?`).join(',')},updated_at=datetime('now'),revision=revision+1 WHERE id=?`,
          [...Object.values(data), id],
        );
      } else {
        id = db.insert(resource, {
          ...data,
          ...(resource === 'invoices' ? { status: 'unpaid', paid_amount: 0 } : {}),
          author_id: req.user.id,
        });
      }
      row = db.get(`SELECT * FROM "${resource}" WHERE id=?`, [id]);
      if (['students', 'teachers'].includes(resource)) {
        if (!update && security.enabled(`${resource}.account`)) {
          account = createAccount(db, resource, row, security);
          row = db.get(`SELECT * FROM "${resource}" WHERE id=?`, [id]);
        }
        syncLinkedAccounts(db, resource, row, old);
      }
      if (resource === 'payments') {
        recalcInvoice(db, old?.invoice_id);
        recalcInvoice(db, row.invoice_id);
      }
      if (resource === 'invoices') {
        recalcInvoice(db, id);
        row = db.get('SELECT * FROM invoices WHERE id=?', [id]);
      }
      if (!update && resource === 'payments') {
        const invoice = db.get('SELECT student_id,title FROM invoices WHERE id=?', [
          row.invoice_id,
        ]);
        if (invoice)
          for (const uid of familyIds(db, invoice.student_id))
            notify(
              db,
              uid,
              'پرداخت ثبت شد',
              `مبلغ ${faNumber(row.amount)} تومان برای «${invoice.title}» ثبت شد.`,
              '/finance?tab=payments',
              'info',
              'payments.view',
            );
      }
      if (!update && resource === 'invoices')
        for (const uid of familyIds(db, row.student_id))
          notify(
            db,
            uid,
            'صورتحساب جدید ثبت شد',
            `${row.title} — مبلغ ${faNumber(row.amount)} تومان، مهلت پرداخت تا ${row.due_date}`,
            '/finance?tab=invoices',
            'info',
            'invoices.view',
          );
      if (!update && resource === 'assignments')
        for (const uid of classFamilyIds(db, row.class_id))
          notify(
            db,
            uid,
            'تکلیف جدید',
            `${row.title} — مهلت تحویل ${row.due_date}`,
            '/education?tab=assignments',
            'info',
            'assignments.view',
          );
      if (!update && resource === 'exams')
        for (const uid of classFamilyIds(db, row.class_id))
          notify(
            db,
            uid,
            'آزمون جدید',
            `${row.title} — تاریخ ${row.exam_date}`,
            '/education?tab=exams',
            'info',
            'exams.view',
          );
      if (resource === 'classes' && row.teacher_id && (!old || old.teacher_id !== row.teacher_id)) {
        const assigned = db.get('SELECT user_id FROM teachers WHERE id=?', [row.teacher_id]);
        notify(
          db,
          assigned?.user_id,
          'کلاس به شما تخصیص یافت',
          `${row.name} به فهرست کلاس‌های شما اضافه شد.`,
          '/classes',
          'info',
          'classes.view',
        );
      }
      if (
        resource === 'students' &&
        row.status === 'active' &&
        row.class_id &&
        (!old || old.class_id !== row.class_id)
      ) {
        const homeroom = db.get(
          'SELECT user_id FROM teachers WHERE id=(SELECT teacher_id FROM classes WHERE id=?)',
          [row.class_id],
        );
        notify(
          db,
          homeroom?.user_id,
          'دانش‌آموز جدید در کلاس',
          `${row.first_name} ${row.last_name} به کلاس شما اضافه شد.`,
          '/classes',
          'info',
          'classes.view',
        );
      }
      if (resource === 'terms' && row.status === 'current') {
        db.run("UPDATE terms SET status='archived' WHERE id!=? AND status='current'", [id]);
        const school = db.setting('school', {});
        db.setSetting('school', { ...school, academic_year: row.name });
      }
      if (!update && resource === 'grades') {
        const student = db.get('SELECT user_id,guardian_user_id FROM students WHERE id=?', [
          row.student_id,
        ]);
        [student?.user_id, student?.guardian_user_id]
          .filter(Boolean)
          .forEach((uid) =>
            notify(
              db,
              uid,
              'نمره جدید ثبت شد',
              `${row.title}: ${row.score} از ${row.max_score}`,
              '/education?tab=grades',
              'education',
            ),
          );
      }
      log(
        db,
        req.user,
        `${resource}.${update ? 'edit' : 'create'}`,
        resource,
        id,
        resourceLabel(resource, row),
      );
      if (resource === 'announcements') deliverAnnouncements(db, security);
    });
    row.permissions = recordPermissions(db, security, resource, row, req.user);
    res.status(update ? 200 : 201).json({ row, account });
  };
  router.post('/:resource', (req, res) => save(req, res, false));
  router.patch('/:resource/:id', (req, res) => save(req, res, true));
  router.delete('/:resource/:id', (req, res) => {
    check(req, 'delete');
    const resource = req.params.resource,
      row = db.get(`SELECT * FROM "${resource}" WHERE id=?`, [positiveId(req.params.id)]);
    assert(row, 404, 'رکورد پیدا نشد.');
    assertScope(db, resource, row, req.user);
    assertScope(db, resource, row, req.user, true);
    assertRevision(row, req.body?.revision);
    if (resource === 'assignments')
      assert(
        !db.get('SELECT id FROM submissions WHERE assignment_id=? LIMIT 1', [row.id]),
        409,
        'تکلیف دارای پاسخ قابل حذف نیست؛ وضعیت آن را پایان‌یافته کنید.',
      );
    if (resource === 'students')
      assert(
        !db.get(
          'SELECT id FROM attendance WHERE student_id=? UNION SELECT id FROM submissions WHERE student_id=? LIMIT 1',
          [row.id, row.id],
        ),
        409,
        'پرونده دارای سابقه حضور یا تکلیف قابل حذف نیست؛ آن را غیرفعال کنید.',
      );
    db.transaction(() => {
      const linked = ['students', 'teachers'].includes(resource)
        ? db.all(
            `SELECT id FROM users WHERE ${resource === 'students' ? 'student_id' : 'teacher_id'}=?`,
            [row.id],
          )
        : [];
      db.run(`DELETE FROM "${resource}" WHERE id=?`, [row.id]);
      for (const account of linked) {
        db.run('UPDATE users SET active=0,student_id=NULL,teacher_id=NULL WHERE id=?', [
          account.id,
        ]);
        db.run('DELETE FROM sessions WHERE user_id=?', [account.id]);
      }
      if (resource === 'payments') recalcInvoice(db, row.invoice_id);
      log(db, req.user, `${resource}.delete`, resource, row.id, resourceLabel(resource, row));
    });
    res.json({ ok: true });
  });
  return router;
}
