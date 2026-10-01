// Library desk: renewals, reservations, overdue fines and a collection report.
import { Router } from 'express';
import { z } from 'zod';
import { assert, parse, log, notify, today, positiveId, csv } from '../security.js';
import { addDateDays } from '../../shared/dates.js';
import { buildXlsx, sheetsFromRows } from '../../shared/xlsx.js';

export function libraryRouter(db, security) {
  const router = Router();
  router.use(security.auth);
  const settings = () => ({
    daily_fine: 0,
    due_days: 14,
    max_renewals: 2,
    ...db.setting('library', {}),
  });
  const lateDays = (loan) =>
    Math.max(
      0,
      Math.round((Date.parse(loan.return_date || today()) - Date.parse(loan.due_date)) / 86400000),
    );
  const overdueRow = (loan) => ({
    ...loan,
    late_days: lateDays(loan),
    fine: lateDays(loan) * settings().daily_fine,
  });

  router.get('/overdue', security.feature('loans.view'), (req, res) => {
    const rows = db
      .all(
        `SELECT l.*,b.title book_title,st.first_name,st.last_name FROM loans l
         JOIN books b ON b.id=l.book_id JOIN students st ON st.id=l.student_id
         WHERE l.return_date IS NULL AND l.due_date<? ORDER BY l.due_date LIMIT 500`,
        [today()],
      )
      .map(overdueRow);
    res.json({
      rows,
      total_fine: rows.reduce((sum, row) => sum + row.fine, 0),
      daily_fine: settings().daily_fine,
      max_renewals: settings().max_renewals,
    });
  });

  router.get('/settings', security.feature('settings.school'), (_req, res) => res.json(settings()));
  router.patch('/settings', security.feature('settings.school'), (req, res) => {
    const data = parse(
      z.object({
        daily_fine: z.number().int().min(0).max(100000000).default(0),
        due_days: z.number().int().min(1).max(120).default(14),
        max_renewals: z.number().int().min(0).max(10).default(2),
      }),
      req.body,
    );
    db.transaction(() => {
      db.setSetting('library', data);
      log(db, req.user, 'library.settings', 'settings', null, data);
    });
    res.json(data);
  });

  router.post('/loans/:id/renew', security.feature('library.renew'), (req, res) => {
    const loan = db.get('SELECT * FROM loans WHERE id=?', [positiveId(req.params.id)]);
    assert(loan, 404, 'امانت پیدا نشد.');
    assert(!loan.return_date, 409, 'این امانت بازگشته است؛ تمدید معنا ندارد.');
    const limits = settings();
    assert(
      Number(loan.renewals || 0) < limits.max_renewals,
      409,
      `سقف تمدید (${limits.max_renewals} بار) تکمیل است.`,
    );
    const waiting = db.get(
      "SELECT r.id,st.first_name,st.last_name FROM reservations r JOIN students st ON st.id=r.student_id WHERE r.book_id=? AND r.status IN ('waiting','ready') AND r.student_id!=? LIMIT 1",
      [loan.book_id, loan.student_id],
    );
    assert(!waiting, 409, 'برای این کتاب نفر بعدی در نوبت است؛ تمدید ممکن نیست.');
    const newDue = addDateDays(loan.due_date > today() ? loan.due_date : today(), limits.due_days);
    db.transaction(() => {
      db.run(
        "UPDATE loans SET due_date=?,renewals=renewals+1,revision=revision+1,updated_at=datetime('now') WHERE id=?",
        [newDue, loan.id],
      );
      notify(
        db,
        db.get('SELECT user_id FROM students WHERE id=?', [loan.student_id])?.user_id,
        'امانت کتاب تمدید شد',
        `مهلت بازگشت جدید: ${newDue}`,
        '/library?tab=loans',
        'info',
        'loans.view',
      );
      log(db, req.user, 'library.renew', 'loans', loan.id, { due_date: newDue });
    });
    res.json({ ok: true, due_date: newDue, renewals: Number(loan.renewals || 0) + 1 });
  });

  router.post('/loans/:id/return', security.feature('loans.edit'), (req, res) => {
    const loan = db.get('SELECT * FROM loans WHERE id=?', [positiveId(req.params.id)]);
    assert(loan, 404, 'امانت پیدا نشد.');
    assert(!loan.return_date, 409, 'این امانت قبلاً بازگشته است.');
    const rate = settings().daily_fine;
    const days = lateDays(loan);
    const fine = days * rate;
    const data = parse(
      z.object({
        return_date: z.string().optional().default(today()),
        fine_paid: z.boolean().optional().default(false),
      }),
      req.body,
    );
    db.transaction(() => {
      db.run(
        "UPDATE loans SET return_date=?,fine=?,fine_status=?,revision=revision+1,updated_at=datetime('now') WHERE id=?",
        [data.return_date, fine, fine === 0 ? 'none' : data.fine_paid ? 'paid' : 'due', loan.id],
      );
      if (fine > 0)
        notify(
          db,
          db.get('SELECT user_id FROM students WHERE id=?', [loan.student_id])?.user_id,
          'جریمه دیرکرد کتاب',
          `${days} روز تأخیر؛ جریمه ${fine.toLocaleString('fa-IR')} تومان`,
          '/library?tab=loans',
          'info',
          'loans.view',
        );
      log(db, req.user, 'library.return', 'loans', loan.id, { days, fine });
    });
    res.json({
      ok: true,
      late_days: days,
      fine,
      fine_status: fine === 0 ? 'none' : data.fine_paid ? 'paid' : 'due',
    });
  });

  router.post('/loans/:id/fine', security.feature('library.fines'), (req, res) => {
    const loan = db.get('SELECT * FROM loans WHERE id=?', [positiveId(req.params.id)]);
    assert(loan, 404, 'امانت پیدا نشد.');
    assert(Number(loan.fine || 0) > 0, 409, 'برای این امانت جریمه‌ای ثبت نشده است.');
    const data = parse(z.object({ paid: z.boolean() }), req.body);
    db.transaction(() => {
      db.run(
        "UPDATE loans SET fine_status=?,revision=revision+1,updated_at=datetime('now') WHERE id=?",
        [data.paid ? 'paid' : 'due', loan.id],
      );
      log(db, req.user, 'library.fine_status', 'loans', loan.id, data);
    });
    res.json({ ok: true });
  });

  router.get('/reservations', security.feature('library.reserve'), (req, res) => {
    const clauses = [];
    const params = [];
    if (['student', 'parent'].includes(req.user.role)) {
      clauses.push('r.student_id=?');
      params.push(req.user.student_id || -1);
    } else if (req.user.role === 'teacher') {
      const classes = db
        .all(
          'SELECT id FROM classes WHERE teacher_id=? UNION SELECT class_id AS id FROM schedules WHERE teacher_id=?',
          [req.user.teacher_id || -1, req.user.teacher_id || -1],
        )
        .map((row) => row.id);
      const list = classes.length ? classes : [-1];
      clauses.push(
        `r.student_id IN (SELECT id FROM students WHERE class_id IN (${list.map(() => '?').join(',')}))`,
      );
      params.push(...list);
    }
    const rows = db.all(
      `SELECT r.*,b.title book_title,st.first_name,st.last_name FROM reservations r
       JOIN books b ON b.id=r.book_id JOIN students st ON st.id=r.student_id
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY r.id DESC LIMIT 300`,
      params,
    );
    res.json({ rows, waiting: rows.filter((row) => row.status === 'waiting').length });
  });

  router.post('/reservations', security.feature('library.reserve'), (req, res) => {
    const data = parse(
      z.object({
        book_id: z.number().int().positive(),
        student_id: z.number().int().positive().optional(),
        needed_by: z.string().optional().nullable(),
        note: z.string().max(1000).optional().default(''),
      }),
      req.body,
    );
    const book = db.get('SELECT * FROM books WHERE id=?', [data.book_id]);
    assert(book, 404, 'کتاب پیدا نشد.');
    const studentId = ['student', 'parent'].includes(req.user.role)
      ? req.user.student_id
      : data.student_id || 0;
    const student = db.get('SELECT * FROM students WHERE id=?', [studentId]);
    assert(student, 422, 'دانش‌آموز مشخص نیست.');
    if (['student', 'parent'].includes(req.user.role))
      assert(student.id === req.user.student_id, 403, 'فقط برای خودتان رزرو می‌کنید.');
    assert(
      !db.get(
        "SELECT id FROM reservations WHERE book_id=? AND student_id=? AND status IN ('waiting','ready')",
        [book.id, student.id],
      ),
      409,
      'برای این کتاب رزرو فعال دارید.',
    );
    const activeLoans = db.get(
      'SELECT COUNT(*) n FROM loans WHERE book_id=? AND return_date IS NULL',
      [book.id],
    ).n;
    const copies = Number(book.copies || 0);
    let id;
    db.transaction(() => {
      id = db.insert('reservations', {
        book_id: book.id,
        student_id: student.id,
        status: activeLoans < copies ? 'ready' : 'waiting',
        needed_by: data.needed_by || null,
        note: data.note,
        author_id: req.user.id,
      });
      const librarian = db.get(
        "SELECT id FROM users WHERE role='admin' AND active=1 ORDER BY id LIMIT 1",
      );
      notify(
        db,
        librarian?.id,
        'رزرو کتاب جدید',
        `${book.title} — ${student.first_name} ${student.last_name}`,
        '/library?tab=reservations',
        'info',
        'books.view',
      );
      log(db, req.user, 'library.reserve', 'reservations', id, { book_id: book.id });
    });
    res.status(201).json({ id, status: activeLoans < copies ? 'ready' : 'waiting' });
  });

  router.patch('/reservations/:id', security.feature('library.reserve'), (req, res) => {
    const row = db.get('SELECT * FROM reservations WHERE id=?', [positiveId(req.params.id)]);
    assert(row, 404, 'رزرو پیدا نشد.');
    const data = parse(
      z.object({ status: z.enum(['waiting', 'ready', 'fulfilled', 'cancelled']) }),
      req.body,
    );
    const family = ['student', 'parent'].includes(req.user.role);
    if (family) {
      assert(
        row.student_id === req.user.student_id && data.status === 'cancelled',
        403,
        'شما فقط می‌توانید رزرو خود را لغو کنید.',
      );
    } else assert(['admin', 'teacher'].includes(req.user.role), 403, 'دسترسی ندارید.');
    db.transaction(() => {
      db.run(
        "UPDATE reservations SET status=?,revision=revision+1,updated_at=datetime('now') WHERE id=?",
        [data.status, row.id],
      );
      if (data.status === 'ready')
        notify(
          db,
          db.get('SELECT user_id FROM students WHERE id=?', [row.student_id])?.user_id,
          'کتاب شما آماده تحویل است',
          'برای دریافت به کتابخانه مراجعه کنید.',
          '/library?tab=reservations',
          'info',
          'books.view',
        );
      log(db, req.user, 'library.reservation_status', 'reservations', row.id, data);
    });
    res.json({ ok: true });
  });

  router.get('/report', security.feature('loans.view'), (req, res) => {
    const format = String(req.query.format || '').toLowerCase();
    const rows = db
      .all(
        `SELECT l.*,b.title book_title,st.first_name,st.last_name FROM loans l
         JOIN books b ON b.id=l.book_id JOIN students st ON st.id=l.student_id ORDER BY l.id DESC LIMIT 2000`,
      )
      .map((loan) => ({
        ...overdueRow(loan),
        status_label: loan.return_date
          ? 'بازگشته'
          : loan.due_date < today()
            ? 'دیرکرد'
            : 'در امانت',
      }));
    const columns = [
      { key: 'book_title', label: 'کتاب' },
      { key: 'name', label: 'دانش‌آموز' },
      { key: 'borrow_date', label: 'تاریخ امانت' },
      { key: 'due_date', label: 'مهلت' },
      { key: 'return_date', label: 'بازگشت' },
      { key: 'status_label', label: 'وضعیت' },
      { key: 'late_days', label: 'روز تأخیر' },
      { key: 'fine', label: 'جریمه (تومان)' },
    ];
    const output = rows.map((row) => ({ ...row, name: `${row.first_name} ${row.last_name}` }));
    if (format === 'xlsx') {
      assert(security.enabled('exports.xlsx'), 403, 'خروجی اکسل غیرفعال است.', 'FEATURE_DISABLED');
      res.setHeader('Content-Disposition', `attachment; filename="library-${today()}.xlsx"`);
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buildXlsx(sheetsFromRows(columns, output, 'کتابخانه')));
    }
    res.setHeader('Content-Disposition', `attachment; filename="library-${today()}.csv"`);
    res.type('text/csv; charset=utf-8');
    return res.send(csv(output, columns));
  });
  return router;
}
