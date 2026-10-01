// Student leave requests: a guardian (or the student) asks, the school decides, and an
// approved request is written into attendance as an excused absence.
import { Router } from 'express';
import { z } from 'zod';
import {
  assert,
  assertScope,
  parse,
  log,
  notify,
  today,
  positiveId,
  teacherClasses,
} from '../security.js';

export function leavesRouter(db, security) {
  const router = Router();
  router.use(security.auth);
  const familyStudentIds = (user) => (user.student_id ? [user.student_id] : []);
  const visible = (user) => {
    if (user.role === 'admin') return { sql: '1=1', params: [] };
    if (user.role === 'teacher') {
      const classes = teacherClasses(db, user);
      const list = classes.length ? classes : [-1];
      return {
        sql: `l.student_id IN (SELECT id FROM students WHERE class_id IN (${list.map(() => '?').join(',')}))`,
        params: list,
      };
    }
    return { sql: 'l.student_id=?', params: [user.student_id || -1] };
  };
  const load = (req) => {
    const row = db.get('SELECT * FROM leaves WHERE id=?', [positiveId(req.params.id)]);
    assert(row, 404, 'درخواست مرخصی پیدا نشد.');
    const s = visible(req.user);
    assert(
      !!db.get(`SELECT l.id FROM leaves l WHERE l.id=? AND (${s.sql})`, [row.id, ...s.params]),
      403,
      'شما به این درخواست دسترسی ندارید.',
    );
    return row;
  };

  router.get('/', security.feature('leaves.view'), (req, res) => {
    const s = visible(req.user);
    const clauses = [`(${s.sql})`];
    const params = [...s.params];
    if (req.query.status) {
      clauses.push('l.status=?');
      params.push(String(req.query.status));
    }
    const rows = db.all(
      `SELECT l.*,st.first_name,st.last_name,st.class_id,c.name class_name FROM leaves l
       JOIN students st ON st.id=l.student_id JOIN classes c ON c.id=st.class_id
       WHERE ${clauses.join(' AND ')} ORDER BY l.id DESC LIMIT 200`,
      params,
    );
    res.json({
      rows,
      pending: rows.filter((row) => row.status === 'pending').length,
      approved: rows.filter((row) => row.status === 'approved').length,
    });
  });

  router.post('/', security.feature('leaves.submit'), (req, res) => {
    const data = parse(
      z.object({
        student_id: z.number().int().positive().optional(),
        type: z.enum(['sick', 'family', 'event', 'travel', 'other']).default('sick'),
        from_date: z.string(),
        to_date: z.string(),
        reason: z.string().trim().min(3, 'دلیل درخواست را بنویسید.').max(2000),
      }),
      req.body,
    );
    const mine = familyStudentIds(req.user);
    const studentId = ['student', 'parent'].includes(req.user.role)
      ? mine[0]
      : data.student_id || 0;
    assert(studentId, 422, 'دانش‌آموز درخواست‌کننده مشخص نیست.');
    const student = db.get('SELECT * FROM students WHERE id=?', [studentId]);
    assert(student, 404, 'دانش‌آموز پیدا نشد.');
    assertScope(db, 'students', student, req.user);
    assert(
      /^\d{4}-\d{2}-\d{2}$/.test(data.from_date) && /^\d{4}-\d{2}-\d{2}$/.test(data.to_date),
      422,
      'تاریخ‌ها معتبر نیستند.',
    );
    assert(data.to_date >= data.from_date, 422, 'تاریخ پایان نمی‌تواند قبل از شروع باشد.');
    const days = Math.round((Date.parse(data.to_date) - Date.parse(data.from_date)) / 86400000) + 1;
    assert(days <= 90, 422, 'بازهٔ مرخصی بیش از ۹۰ روز قابل ثبت نیست.');
    assert(
      !db.get(
        "SELECT id FROM leaves WHERE student_id=? AND status='pending' AND from_date<=? AND to_date>=?",
        [student.id, data.to_date, data.from_date],
      ),
      409,
      'برای همین بازه یک درخواست در انتظار تأیید وجود دارد.',
    );
    let id;
    db.transaction(() => {
      id = db.insert('leaves', {
        student_id: student.id,
        type: data.type,
        from_date: data.from_date,
        to_date: data.to_date,
        reason: data.reason,
        status: 'pending',
        author_id: req.user.id,
      });
      const homeroom = db.get(
        'SELECT u.id FROM users u JOIN classes c ON c.teacher_id=u.teacher_id WHERE c.id=?',
        [student.class_id],
      );
      notify(
        db,
        homeroom?.id,
        'درخواست مرخصی جدید',
        `${student.first_name} ${student.last_name}: ${data.from_date} تا ${data.to_date}`,
        '/attendance?tab=leaves',
        'info',
        'leaves.view',
      );
      log(db, req.user, 'leaves.submit', 'leaves', id, { student_id: student.id });
    });
    res.status(201).json({ id });
  });

  router.patch('/:id/decision', security.feature('leaves.approve'), (req, res) => {
    const row = load(req);
    const data = parse(
      z.object({
        status: z.enum(['approved', 'rejected', 'cancelled']),
        decision_note: z.string().max(1000).optional().default(''),
        mark_attendance: z.boolean().optional().default(true),
      }),
      req.body,
    );
    assert(
      row.status === 'pending' || data.status === 'cancelled',
      409,
      'این درخواست قبلاً بررسی شده است.',
    );
    let marked = 0;
    db.transaction(() => {
      db.run(
        "UPDATE leaves SET status=?,decision_note=?,revision=revision+1,updated_at=datetime('now') WHERE id=?",
        [data.status, data.decision_note, row.id],
      );
      if (data.status === 'approved' && data.mark_attendance) {
        // Approved leave writes "excused" for the covered days that are not in the future;
        // a recorded absence is upgraded, an existing present record is left alone.
        const days = [];
        for (
          let cursor = row.from_date;
          cursor <= row.to_date && days.length < 120;
          cursor = new Date(Date.parse(cursor) + 86400000).toISOString().slice(0, 10)
        )
          days.push(cursor);
        for (const date of days.filter((day) => day <= today())) {
          const student = db.get('SELECT class_id FROM students WHERE id=?', [row.student_id]);
          const existing = db.get('SELECT * FROM attendance WHERE student_id=? AND date=?', [
            row.student_id,
            date,
          ]);
          if (existing && existing.status === 'present') continue;
          db.run(
            "INSERT INTO attendance(student_id,class_id,date,status,note,recorded_by) VALUES (?,?,?,'excused',?,?) ON CONFLICT(student_id,date) DO UPDATE SET status='excused',note=excluded.note,recorded_by=excluded.recorded_by",
            [
              row.student_id,
              existing?.class_id || student.class_id,
              date,
              `مرخصی تأییدشده (درخواست #${row.id})`,
              req.user.id,
            ],
          );
          marked += 1;
        }
      }
      const student = db.get(
        'SELECT user_id,guardian_user_id,first_name,last_name FROM students WHERE id=?',
        [row.student_id],
      );
      for (const uid of [student?.user_id, student?.guardian_user_id].filter(Boolean))
        notify(
          db,
          uid,
          data.status === 'approved' ? 'مرخصی تأیید شد' : 'درخواست مرخصی بررسی شد',
          `${row.from_date} تا ${row.to_date}${data.decision_note ? ` — ${data.decision_note}` : ''}`,
          '/attendance?tab=leaves',
          'info',
          'leaves.view',
        );
      log(db, req.user, 'leaves.decision', 'leaves', row.id, {
        status: data.status,
        marked,
      });
    });
    res.json({ ok: true, marked_days: marked });
  });

  router.delete('/:id', security.feature('leaves.submit'), (req, res) => {
    const row = load(req);
    assert(
      ['student', 'parent'].includes(req.user.role),
      403,
      'حذف درخواست فقط توسط ثبت‌کننده انجام می‌شود.',
    );
    assert(
      row.status === 'pending' || row.status === 'cancelled',
      409,
      'درخواست بررسی‌شده قابل حذف نیست؛ آن را لغو کنید.',
    );
    db.transaction(() => {
      db.run('DELETE FROM leaves WHERE id=?', [row.id]);
      log(db, req.user, 'leaves.delete', 'leaves', row.id);
    });
    res.json({ ok: true });
  });
  return router;
}
