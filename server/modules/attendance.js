import { Router } from 'express';
import { z } from 'zod';
import {
  assert,
  parse,
  validDate,
  today,
  scope,
  assertScope,
  log,
  notify,
  csv,
  teacherClasses,
  positiveId,
} from '../security.js';
export function attendanceRouter(db, security) {
  const router = Router();
  router.use(security.auth);
  const rows = (req) => {
    const date = String(req.query.date || today());
    assert(validDate(date), 422, 'تاریخ معتبر نیست.');
    const params = [date],
      clauses = [];
    if (req.user.role === 'teacher') {
      const classes = teacherClasses(db, req.user);
      const ids = classes.length ? classes : [-1];
      clauses.push(`COALESCE(a.class_id,r.class_id) IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    } else if (req.user.role !== 'admin') {
      clauses.push('r.id=?');
      params.push(req.user.student_id || -1);
    }
    if (req.query.class_id !== undefined && req.query.class_id !== '') {
      clauses.push('COALESCE(a.class_id,r.class_id)=?');
      params.push(positiveId(req.query.class_id, 'کلاس'));
    }
    const condition = clauses.length ? clauses.join(' AND ') : '1=1';
    return db.all(
      `SELECT r.id AS student_id,r.first_name,r.last_name,r.guardian_phone,COALESCE(a.class_id,r.class_id) class_id,
      c.name AS class_name,a.status,a.note,a.id AS attendance_id,a.date
      FROM students r LEFT JOIN attendance a ON a.student_id=r.id AND a.date=?
      JOIN classes c ON c.id=COALESCE(a.class_id,r.class_id)
      WHERE (${condition}) AND (r.status='active' OR a.id IS NOT NULL) ORDER BY r.last_name,r.first_name`,
      params,
    );
  };
  router.get('/', security.feature('attendance.view'), (req, res) => {
    const data = rows(req);
    const summary = { present: 0, absent: 0, late: 0, excused: 0, unrecorded: 0 };
    data.forEach((r) => summary[r.status || 'unrecorded']++);
    res.json({ rows: data, summary, date: req.query.date || today() });
  });
  router.get('/export', security.feature('attendance.export'), (req, res) => {
    const labels = { present: 'حاضر', absent: 'غایب', late: 'تأخیر', excused: 'غیبت موجه' };
    const output = rows(req).map((r) => ({
      name: `${r.first_name} ${r.last_name}`,
      class: r.class_name,
      date: req.query.date || today(),
      status: labels[r.status] || 'ثبت‌نشده',
      note: r.note,
    }));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="attendance-${req.query.date || today()}.csv"`,
    );
    res.type('text/csv; charset=utf-8').send(
      csv(output, [
        { key: 'name', label: 'دانش‌آموز' },
        { key: 'class', label: 'کلاس' },
        { key: 'date', label: 'تاریخ' },
        { key: 'status', label: 'وضعیت' },
        { key: 'note', label: 'توضیحات' },
      ]),
    );
  });
  router.get('/student/:id', security.feature('attendance.history'), (req, res) => {
    const student = db.get('SELECT * FROM students WHERE id=?', [positiveId(req.params.id)]);
    assert(student, 404, 'دانش‌آموز یافت نشد.');
    assertScope(db, 'students', student, req.user);
    res.json(
      db.all('SELECT * FROM attendance WHERE student_id=? ORDER BY date DESC LIMIT 180', [
        student.id,
      ]),
    );
  });
  router.post('/', security.feature('attendance.record'), (req, res) => {
    assert(
      ['admin', 'teacher'].includes(req.user.role),
      403,
      'ثبت حضور و غیاب فقط برای مدیر و معلم مجاز است.',
    );
    const data = parse(
      z.object({
        class_id: z.number().int().positive(),
        date: z.string(),
        records: z
          .array(
            z.object({
              student_id: z.number().int().positive(),
              status: z.enum(['present', 'absent', 'late', 'excused']),
              note: z.string().max(500).optional().default(''),
            }),
          )
          .min(1)
          .max(60),
      }),
      req.body,
    );
    assert(
      validDate(data.date) && data.date <= today(),
      422,
      'تاریخ باید معتبر باشد و در آینده نباشد.',
    );
    if (data.records.length > 1)
      assert(security.enabled('attendance.bulk'), 403, 'ثبت گروهی حضور و غیاب غیرفعال است.');
    const cls = db.get('SELECT * FROM classes WHERE id=?', [data.class_id]);
    assert(cls, 404, 'کلاس پیدا نشد.');
    assertScope(db, 'classes', cls, req.user);
    assert(
      new Set(data.records.map((r) => r.student_id)).size === data.records.length,
      422,
      'دانش‌آموز تکراری در فهرست وجود دارد.',
    );
    db.transaction(() => {
      for (const record of data.records) {
        const student = db.get('SELECT * FROM students WHERE id=?', [record.student_id]);
        assert(student, 422, 'دانش‌آموز پیدا نشد.');
        const old = db.get('SELECT * FROM attendance WHERE student_id=? AND date=?', [
          student.id,
          data.date,
        ]);
        if (old)
          assert(
            old.class_id === data.class_id,
            409,
            'حضور این تاریخ برای کلاس قبلی ثبت شده است و قابل انتقال نیست.',
          );
        else
          assert(
            student.class_id === data.class_id && student.status === 'active',
            422,
            'دانش‌آموز باید عضو فعال همین کلاس باشد.',
          );
        db.run(
          'INSERT INTO attendance(student_id,class_id,date,status,note,recorded_by) VALUES (?,?,?,?,?,?) ON CONFLICT(student_id,date) DO UPDATE SET status=excluded.status,note=excluded.note,recorded_by=excluded.recorded_by',
          [student.id, data.class_id, data.date, record.status, record.note, req.user.id],
        );
        if (record.status === 'absent' && old?.status !== 'absent')
          [student.user_id, student.guardian_user_id]
            .filter(Boolean)
            .forEach((uid) =>
              notify(
                db,
                uid,
                'غیبت ثبت شد',
                `برای تاریخ ${data.date} غیبت ثبت شده است. در صورت نیاز از طریق تیکت پیگیری کنید.`,
                '/attendance',
                'attendance',
              ),
            );
      }
      log(db, req.user, 'attendance.record', 'classes', data.class_id, {
        date: data.date,
        count: data.records.length,
      });
    });
    res.json({ ok: true, count: data.records.length });
  });
  return router;
}
