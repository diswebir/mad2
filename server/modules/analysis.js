// Reporting and year-end tools: report card, term trend, ministerial export and promotion.
import { Router } from 'express';
import { z } from 'zod';
import {
  assert,
  assertScope,
  scope,
  parse,
  log,
  notify,
  today,
  csv,
  positiveId,
  teacherClasses,
} from '../security.js';
import { buildXlsx, sheetsFromRows } from '../../shared/xlsx.js';

const weightedAverage = (grades) => {
  const total = grades.reduce((sum, grade) => sum + Number(grade.coefficient || 1), 0);
  if (!total) return null;
  const value =
    grades.reduce(
      (sum, grade) =>
        sum +
        (Number(grade.score) / Number(grade.max_score || 20)) * 20 * Number(grade.coefficient || 1),
      0,
    ) / total;
  return Math.round(value * 100) / 100;
};

export function analysisRouter(db, security) {
  const router = Router();
  router.use(security.auth);
  const termRange = (termName) => {
    const term = termName
      ? db.get('SELECT * FROM terms WHERE name=?', [termName])
      : db.get("SELECT * FROM terms ORDER BY (status='current') DESC, id DESC LIMIT 1");
    if (!term) return { from: '1900-01-01', to: today(), name: termName || '' };
    return { from: term.start_date, to: term.end_date, name: term.name, id: term.id };
  };
  const gradesOf = (studentId, range) =>
    db.all(
      `SELECT g.*,s.name subject_name FROM grades g
       LEFT JOIN subjects s ON s.id=g.subject_id
       WHERE g.student_id=? AND (g.term=? OR (g.term IS NULL AND ?='')) ` +
        `ORDER BY g.subject_id, g.id`,
      [studentId, range.name, range.name],
    );
  const attendanceOf = (studentId, range) =>
    db.get(
      `SELECT COUNT(*) total,
        COALESCE(SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END),0) present,
        COALESCE(SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END),0) absent,
        COALESCE(SUM(CASE WHEN status='excused' THEN 1 ELSE 0 END),0) excused
       FROM attendance WHERE student_id=? AND date BETWEEN ? AND ?`,
      [studentId, range.from, range.to],
    );

  const reportCard = (studentId, termName) => {
    const student = db.get(
      `SELECT st.*,c.name class_name,c.grade,t.first_name||' '||t.last_name teacher_name
       FROM students st JOIN classes c ON c.id=st.class_id LEFT JOIN teachers t ON t.id=c.teacher_id
       WHERE st.id=?`,
      [studentId],
    );
    assert(student, 404, 'دانش‌آموز پیدا نشد.');
    const range = termRange(termName);
    const grades = gradesOf(studentId, range);
    const bySubject = new Map();
    for (const grade of grades) {
      const key = grade.subject_id || 0;
      const entry = bySubject.get(key) || {
        subject_id: grade.subject_id,
        subject: grade.subject_name || 'بدون درس',
        coefficient: Number(grade.coefficient || grade.subject_coefficient || 1),
        items: [],
      };
      entry.items.push({
        title: grade.title,
        score: Number(grade.score),
        max_score: Number(grade.max_score || 20),
        coefficient: Number(grade.coefficient || 1),
        date: grade.created_at,
      });
      bySubject.set(key, entry);
    }
    const subjects = [...bySubject.values()].map((entry) => ({
      ...entry,
      average: weightedAverage(entry.items),
    }));
    const attendance = attendanceOf(studentId, range);
    const overall = weightedAverage(
      grades.map((grade) => ({
        score: grade.score,
        max_score: grade.max_score || 20,
        coefficient: grade.coefficient || grade.subject_coefficient || 1,
      })),
    );
    return {
      student: {
        id: student.id,
        name: `${student.first_name} ${student.last_name}`,
        class_name: student.class_name,
        grade: student.grade,
        national_id: student.national_id,
        teacher_name: student.teacher_name,
      },
      term: range.name,
      term_range: { from: range.from, to: range.to },
      subjects,
      grades,
      average: overall,
      attendance: {
        ...attendance,
        rate: attendance.total
          ? Math.round((attendance.present / attendance.total) * 1000) / 10
          : null,
      },
      school: db.setting('school', {}),
      generated_at: new Date().toISOString(),
      printed_by: null,
    };
  };

  router.get('/report-card/:studentId', security.feature('reports.report_card'), (req, res) => {
    const student = db.get('SELECT * FROM students WHERE id=?', [positiveId(req.params.studentId)]);
    assert(student, 404, 'دانش‌آموز پیدا نشد.');
    assertScope(db, 'students', student, req.user);
    res.json(reportCard(student.id, req.query.term ? String(req.query.term) : null));
  });

  router.get('/report-cards', security.feature('reports.report_card'), (req, res) => {
    const classId = positiveId(req.query.class_id, 'کلاس');
    const cls = db.get('SELECT * FROM classes WHERE id=?', [classId]);
    assert(cls, 404, 'کلاس پیدا نشد.');
    assertScope(db, 'classes', cls, req.user);
    const s = scope(db, 'students', req.user);
    const rows = db
      .all(
        `SELECT st.id FROM students st WHERE st.class_id=? AND st.status='active' AND (${s.sql}) ORDER BY st.last_name`,
        [classId, ...s.params],
      )
      .map((row) => {
        const card = reportCard(row.id, req.query.term ? String(req.query.term) : null);
        return {
          id: row.id,
          name: card.student.name,
          average: card.average,
          attendance_rate: card.attendance.rate,
          subject_count: card.subjects.length,
        };
      });
    res.json({
      class: cls,
      term: termRange(req.query.term ? String(req.query.term) : null).name,
      rows,
      class_average: rows.length
        ? Math.round(
            (rows.reduce((sum, row) => sum + (row.average || 0), 0) /
              rows.filter((row) => row.average !== null).length) *
              100,
          ) / 100
        : null,
    });
  });

  router.get('/trend/:studentId', security.feature('reports.trend'), (req, res) => {
    const student = db.get('SELECT * FROM students WHERE id=?', [positiveId(req.params.studentId)]);
    assert(student, 404, 'دانش‌آموز پیدا نشد.');
    assertScope(db, 'students', student, req.user);
    const grades = db.all(
      `SELECT g.*,s.name subject_name FROM grades g LEFT JOIN subjects s ON s.id=g.subject_id
       WHERE g.student_id=? ORDER BY g.created_at, g.id`,
      [student.id],
    );
    const attendance = db.all(
      'SELECT date,status FROM attendance WHERE student_id=? ORDER BY date',
      [student.id],
    );
    const byMonth = new Map();
    for (const grade of grades) {
      const month = String(grade.created_at || '').slice(0, 7);
      if (!month) continue;
      const list = byMonth.get(month) || [];
      list.push(grade);
      byMonth.set(month, list);
    }
    const trend = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, list]) => ({
        month,
        average: weightedAverage(
          list.map((grade) => ({ ...grade, coefficient: grade.coefficient || 1 })),
        ),
        count: list.length,
      }));
    const attendanceTrend = new Map();
    for (const row of attendance) {
      const month = String(row.date || '').slice(0, 7);
      const entry = attendanceTrend.get(month) || { total: 0, present: 0 };
      entry.total += 1;
      if (['present', 'late'].includes(row.status)) entry.present += 1;
      attendanceTrend.set(month, entry);
    }
    const subjects = new Map();
    for (const grade of grades) {
      const key = grade.subject_name || 'بدون درس';
      const list = subjects.get(key) || [];
      list.push(grade);
      subjects.set(key, list);
    }
    res.json({
      student: { id: student.id, name: `${student.first_name} ${student.last_name}` },
      trend,
      attendance: [...attendanceTrend.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, entry]) => ({
          month,
          rate: entry.total ? Math.round((entry.present / entry.total) * 1000) / 10 : null,
          total: entry.total,
        })),
      subjects: [...subjects.entries()].map(([name, list]) => ({
        name,
        average: weightedAverage(
          list.map((grade) => ({ ...grade, coefficient: grade.coefficient || 1 })),
        ),
        count: list.length,
      })),
      overall: weightedAverage(
        grades.map((grade) => ({ ...grade, coefficient: grade.coefficient || 1 })),
      ),
    });
  });

  const ministerialRows = () => {
    const students = db.all(
      `SELECT st.*,c.name class_name,c.grade,st.national_id,st.guardian_name,st.guardian_phone,
        SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END) present_days,
        COUNT(a.id) attendance_days
       FROM students st JOIN classes c ON c.id=st.class_id
       LEFT JOIN attendance a ON a.student_id=st.id
       WHERE st.status='active' GROUP BY st.id ORDER BY c.grade, st.last_name`,
    );
    const grades = db.all(
      `SELECT st.national_id student_national_id,st.first_name,st.last_name,c.grade,
        COALESCE(g.class_id,st.class_id) class_id,sub.name subject,g.title,g.score,g.max_score,COALESCE(g.coefficient,1) coefficient
       FROM grades g JOIN students st ON st.id=g.student_id LEFT JOIN classes c ON c.id=COALESCE(g.class_id,st.class_id)
       LEFT JOIN subjects sub ON sub.id=g.subject_id ORDER BY st.last_name, g.id`,
    );
    return { students, grades };
  };

  router.get('/ministerial', security.feature('reports.ministerial'), (req, res) => {
    const type = String(req.query.type || 'students');
    const format = String(req.query.format || 'csv').toLowerCase();
    const data = ministerialRows();
    const columns =
      type === 'grades'
        ? [
            { key: 'student_national_id', label: 'کد ملی دانش‌آموز' },
            { key: 'first_name', label: 'نام' },
            { key: 'last_name', label: 'نام خانوادگی' },
            { key: 'grade', label: 'پایه' },
            { key: 'subject', label: 'درس' },
            { key: 'title', label: 'عنوان ارزشیابی' },
            { key: 'score', label: 'نمره' },
            { key: 'max_score', label: 'نمره کامل' },
            { key: 'coefficient', label: 'ضریب' },
          ]
        : [
            { key: 'national_id', label: 'کد ملی' },
            { key: 'first_name', label: 'نام' },
            { key: 'last_name', label: 'نام خانوادگی' },
            { key: 'guardian_name', label: 'نام ولی' },
            { key: 'guardian_phone', label: 'تماس ولی' },
            { key: 'grade', label: 'پایه' },
            { key: 'class_name', label: 'کلاس' },
            { key: 'present_days', label: 'روزهای حضور' },
            { key: 'attendance_days', label: 'روزهای ثبت‌شده' },
          ];
    const rows = type === 'grades' ? data.grades : data.students;
    if (format === 'xlsx') {
      assert(security.enabled('exports.xlsx'), 403, 'خروجی اکسل غیرفعال است.', 'FEATURE_DISABLED');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="ministerial-${type}-${today()}.xlsx"`,
      );
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(
        buildXlsx(sheetsFromRows(columns, rows, type === 'grades' ? 'نمرات' : 'دانش‌آموزان')),
      );
    }
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ministerial-${type}-${today()}.csv"`,
    );
    res.type('text/csv; charset=utf-8');
    return res.send(csv(rows, columns));
  });

  router.get('/promotion/preview', security.feature('reports.promote'), (req, res) => {
    const classes = db.all(
      `SELECT c.*,(SELECT COUNT(*) FROM students st WHERE st.class_id=c.id AND st.status='active') students
       FROM classes c ORDER BY c.grade, c.name`,
    );
    const rows = classes.map((cls) => {
      const averages = db.all(
        `SELECT g.student_id,SUM(g.score/g.max_score*20*COALESCE(g.coefficient,1))/NULLIF(SUM(COALESCE(g.coefficient,1)),0) avg
         FROM grades g JOIN students st ON st.id=g.student_id
         WHERE st.class_id=? GROUP BY g.student_id`,
        [cls.id],
      );
      const map = new Map(averages.map((row) => [row.student_id, row.avg]));
      const students = db.all(
        "SELECT id,first_name,last_name,national_id FROM students WHERE class_id=? AND status='active' ORDER BY last_name",
        [cls.id],
      );
      return {
        ...cls,
        roster: students.map((student) => ({
          ...student,
          average:
            map.get(student.id) === undefined ? null : Math.round(map.get(student.id) * 100) / 100,
          suggested:
            map.get(student.id) === undefined
              ? 'promoted'
              : map.get(student.id) >= 10
                ? 'promoted'
                : 'repeated',
        })),
      };
    });
    const nextGrade = (grade) => String(Math.min(12, Number(grade || 1) + 1));
    res.json({
      classes: rows,
      active_year: db.setting('school', {}).academic_year || '',
      next_year: (() => {
        const current = String(db.setting('school', {}).academic_year || '');
        const match = current.match(/(\d{4})/g);
        if (!match || match.length < 2) return '';
        return `${Number(match[1].replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))) + 1}–${
          Number(match[1].replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))) + 2
        }`;
      })(),
      grade_step: nextGrade,
    });
  });

  router.post('/promotion/apply', security.feature('reports.promote'), (req, res) => {
    const data = parse(
      z.object({
        term: z.string().trim().min(3).max(40),
        decisions: z
          .array(
            z.object({
              student_id: z.number().int().positive(),
              action: z.enum(['promoted', 'repeated', 'graduated', 'transferred']),
              target_class_id: z.number().int().positive().nullable().optional(),
            }),
          )
          .min(1)
          .max(2000),
      }),
      req.body,
    );
    const summary = { promoted: 0, repeated: 0, graduated: 0, transferred: 0 };
    db.transaction(() => {
      for (const decision of data.decisions) {
        const student = db.get('SELECT * FROM students WHERE id=?', [decision.student_id]);
        assert(student, 404, `دانش‌آموز ${decision.student_id} پیدا نشد.`);
        const classAverages = db.get(
          `SELECT SUM(g.score/g.max_score*20*COALESCE(g.coefficient,1))/NULLIF(SUM(COALESCE(g.coefficient,1)),0) avg,
            COUNT(*) count FROM grades g WHERE g.student_id=?`,
          [student.id],
        );
        const attendance = db.get(
          "SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END),0) present FROM attendance WHERE student_id=?",
          [student.id],
        );
        const average =
          classAverages?.avg === null || classAverages?.avg === undefined
            ? null
            : Math.round(classAverages.avg * 100) / 100;
        db.insert('student_years', {
          student_id: student.id,
          term: data.term,
          class_id: student.class_id,
          average,
          attendance_rate: attendance.total
            ? Math.round((attendance.present / attendance.total) * 1000) / 10
            : null,
          grade_count: classAverages?.count || 0,
          status: decision.action,
          note: null,
          author_id: req.user.id,
        });
        if (decision.action === 'promoted' || decision.action === 'repeated') {
          const targetClassId = decision.target_class_id || student.class_id;
          const target =
            db.get('SELECT * FROM classes WHERE id=?', [targetClassId]) ||
            db.get('SELECT * FROM classes WHERE id=?', [student.class_id]);
          assert(target, 422, 'کلاس مقصد پیدا نشد.');
          if (decision.action === 'promoted' && target.id === student.class_id) {
            // Same class id, different grade: move to the first class of the next grade.
            const next = db.get('SELECT * FROM classes WHERE grade=? ORDER BY id LIMIT 1', [
              String(Number(target.grade) + 1),
            ]);
            assert(
              next,
              409,
              `برای پایهٔ ${Number(target.grade) + 1} کلاسی تعریف نشده است؛ ابتدا کلاس را بسازید.`,
            );
            db.run(
              "UPDATE students SET class_id=?,revision=revision+1,updated_at=datetime('now') WHERE id=?",
              [next.id, student.id],
            );
          } else if (target.id !== student.class_id) {
            const active = db.get(
              "SELECT COUNT(*) n FROM students WHERE class_id=? AND status='active'",
              [target.id],
            ).n;
            assert(active < target.capacity, 409, `ظرفیت کلاس ${target.name} تکمیل است.`);
            db.run(
              "UPDATE students SET class_id=?,revision=revision+1,updated_at=datetime('now') WHERE id=?",
              [target.id, student.id],
            );
          }
        }
        if (decision.action === 'graduated' || decision.action === 'transferred') {
          db.run(
            "UPDATE students SET status=?,revision=revision+1,updated_at=datetime('now') WHERE id=?",
            [decision.action === 'graduated' ? 'graduated' : 'inactive', student.id],
          );
          db.run(
            'DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE student_id=?)',
            [student.id],
          );
        }
        const family = db.get('SELECT user_id,guardian_user_id FROM students WHERE id=?', [
          student.id,
        ]);
        for (const uid of [family?.user_id, family?.guardian_user_id].filter(Boolean))
          notify(
            db,
            uid,
            'کارنامه سالانه ثبت شد',
            `${data.term} — وضعیت: ${
              {
                promoted: 'ارتقا',
                repeated: 'تکرار پایه',
                graduated: 'فارغ‌التحصیلی',
                transferred: 'انتقال',
              }[decision.action]
            }${average === null ? '' : ` — معدل ${average}`}`,
            '/reports',
            'info',
            'student_years.view',
          );
        summary[decision.action] += 1;
      }
      const term = db.get('SELECT * FROM terms WHERE name=?', [data.term]);
      if (term?.status === 'current') {
        db.run("UPDATE terms SET status='archived' WHERE id=?", [term.id]);
        db.setSetting('school', {
          ...db.setting('school', {}),
          academic_year: data.term,
        });
      }
      log(db, req.user, 'reports.promote', 'student_years', null, summary);
    });
    res.json({ ok: true, summary });
  });

  router.get('/student-years', security.feature('student_years.view'), (req, res) => {
    const s = scope(db, 'student_years', req.user);
    const rows = db.all(
      `SELECT y.*,st.first_name,st.last_name,c.name class_name FROM student_years y
       JOIN students st ON st.id=y.student_id LEFT JOIN classes c ON c.id=y.class_id
       WHERE (${s.sql}) ORDER BY y.id DESC LIMIT 500`,
      s.params,
    );
    res.json(rows);
  });

  const teacherClassesOf = (user) => teacherClasses(db, user);
  router.get('/my-day', security.feature('dashboard.view'), (req, res) => {
    const user = req.user;
    const classes = user.role === 'admin' ? db.all('SELECT id,name FROM classes') : [];
    const scoped =
      user.role === 'teacher'
        ? teacherClassesOf(user).map((id) => db.get('SELECT id,name FROM classes WHERE id=?', [id]))
        : classes;
    const rows = scoped.filter(Boolean).map((cls) => {
      const recorded = db.get('SELECT COUNT(*) n FROM attendance WHERE class_id=? AND date=?', [
        cls.id,
        today(),
      ]).n;
      const roster = db.get(
        "SELECT COUNT(*) n FROM students WHERE class_id=? AND status='active'",
        [cls.id],
      ).n;
      const leaves = db.get(
        "SELECT COUNT(*) n FROM leaves l JOIN students st ON st.id=l.student_id WHERE st.class_id=? AND l.status='pending'",
        [cls.id],
      ).n;
      return {
        class_id: cls.id,
        name: cls.name,
        students: roster,
        recorded,
        missing: recorded === 0 && roster > 0,
        pending_leaves: leaves,
      };
    });
    const teacherTasks =
      user.role === 'teacher'
        ? {
            unreviewed: db.get(
              `SELECT COUNT(*) n FROM submissions s JOIN assignments a ON a.id=s.assignment_id
               WHERE a.teacher_id=? AND s.score IS NULL`,
              [user.teacher_id || -1],
            ).n,
            today_classes: rows.length,
          }
        : null;
    const adminTasks =
      user.role === 'admin'
        ? {
            missing_attendance: rows.filter((row) => row.missing).length,
            pending_leaves: db.get("SELECT COUNT(*) n FROM leaves WHERE status='pending'").n,
            unpaid_invoices: db.get(
              "SELECT COUNT(*) n FROM invoices WHERE status!='paid' AND due_date<?",
              [today()],
            ).n,
            open_tickets: db.get(
              "SELECT COUNT(*) n FROM tickets WHERE status IN ('open','in_progress')",
            ).n,
            new_error_reports: db.get("SELECT COUNT(*) n FROM error_reports WHERE status='new'").n,
            pending_outbox: db.get("SELECT COUNT(*) n FROM outbox WHERE status='failed'").n,
            no_account: db.get(
              "SELECT COUNT(*) n FROM students WHERE user_id IS NULL AND status='active'",
            ).n,
          }
        : null;
    res.json({
      date: today(),
      classes: rows,
      teacher: teacherTasks,
      admin: adminTasks,
      upcoming_meetings: db.get('SELECT COUNT(*) n FROM meeting_slots WHERE event_date>=?', [
        today(),
      ]).n,
      pending_leaves: db.get("SELECT COUNT(*) n FROM leaves WHERE status='pending'").n,
    });
  });
  return router;
}
