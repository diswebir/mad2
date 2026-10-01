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
  assertFileContext,
  assertRevision,
  teachesSubject,
  teacherClasses,
} from '../security.js';
export function educationRouter(db, security) {
  const router = Router();
  router.use(security.auth);
  const assignment = (req) => {
    const row = db.get('SELECT * FROM assignments WHERE id=?', [positiveId(req.params.id)]);
    assert(row, 404, 'تکلیف پیدا نشد.');
    assertScope(db, 'assignments', row, req.user);
    return row;
  };
  // One screen, one class: a teacher enters a whole exam at once instead of 30 forms.
  router.post('/grades/bulk', security.feature('grades.bulk'), (req, res) => {
    const data = parse(
      z.object({
        class_id: z.number().int().positive(),
        subject_id: z.number().int().positive(),
        title: z.string().trim().min(2).max(120),
        max_score: z.number().min(1).max(100).default(20),
        coefficient: z.number().min(0.1).max(10).default(1),
        term: z.string().max(40).optional().default(''),
        scores: z
          .array(
            z.object({
              student_id: z.number().int().positive(),
              score: z.number().min(0),
              notes: z.string().max(500).optional().default(''),
            }),
          )
          .min(1)
          .max(80),
      }),
      req.body,
    );
    assert(
      ['admin', 'teacher'].includes(req.user.role),
      403,
      'ثبت گروهی نمره فقط برای مدیر و معلم مجاز است.',
    );
    const cls = db.get('SELECT * FROM classes WHERE id=?', [data.class_id]);
    assert(cls, 404, 'کلاس پیدا نشد.');
    assertScope(db, 'classes', cls, req.user);
    assert(
      teachesSubject(db, req.user, cls.id, data.subject_id),
      403,
      'این درس در برنامهٔ هفتگی شما برای این کلاس نیست.',
    );
    const seen = new Set();
    let created = 0;
    let updated = 0;
    db.transaction(() => {
      for (const entry of data.scores) {
        assert(!seen.has(entry.student_id), 422, 'دانش‌آموز تکراری در فهرست نمرات.');
        seen.add(entry.student_id);
        assert(entry.score <= data.max_score, 422, 'نمره‌ای بیشتر از نمرهٔ کامل ثبت شده است.');
        const student = db.get('SELECT * FROM students WHERE id=?', [entry.student_id]);
        assert(student, 422, 'دانش‌آموز پیدا نشد.');
        assert(
          student.class_id === cls.id && student.status === 'active',
          422,
          'دانش‌آموز باید عضو فعال همین کلاس باشد.',
        );
        const existing = db.get(
          'SELECT * FROM grades WHERE student_id=? AND subject_id=? AND title=? AND class_id=?',
          [student.id, data.subject_id, data.title, cls.id],
        );
        if (existing) {
          db.run(
            "UPDATE grades SET score=?,max_score=?,coefficient=?,notes=?,revision=revision+1,updated_at=datetime('now') WHERE id=?",
            [entry.score, data.max_score, data.coefficient, entry.notes, existing.id],
          );
          updated += 1;
        } else {
          db.insert('grades', {
            title: data.title,
            student_id: student.id,
            subject_id: data.subject_id,
            class_id: cls.id,
            score: entry.score,
            max_score: data.max_score,
            coefficient: data.coefficient,
            term: data.term,
            notes: entry.notes,
            author_id: req.user.id,
          });
          created += 1;
        }
        for (const uid of [student.user_id, student.guardian_user_id].filter(Boolean))
          notify(
            db,
            uid,
            'نمره جدید ثبت شد',
            `${data.title}: ${entry.score} از ${data.max_score}`,
            '/education?tab=grades',
            'education',
          );
      }
      log(db, req.user, 'grades.bulk', 'classes', cls.id, {
        title: data.title,
        created,
        updated,
      });
    });
    res.status(201).json({ ok: true, created, updated, count: data.scores.length });
  });
  router.get('/:id/submissions', security.feature('assignments.view'), (req, res) => {
    const row = assignment(req);
    assert(
      req.user.role === 'student' ||
        security.enabled('assignments.review') ||
        req.user.role === 'parent',
      403,
      'ارزیابی تکالیف غیرفعال است.',
    );
    const restricted = ['student', 'parent'].includes(req.user.role);
    if (!restricted) assertScope(db, 'assignments', row, req.user, true);
    res.json(
      db.all(
        `SELECT s.*,st.first_name,st.last_name,f.original_name file_name FROM submissions s JOIN students st ON st.id=s.student_id LEFT JOIN files f ON f.id=s.file_id WHERE s.assignment_id=? ${restricted ? 'AND s.student_id=?' : ''} ORDER BY s.submitted_at DESC`,
        restricted ? [row.id, req.user.student_id] : [row.id],
      ),
    );
  });
  router.post('/:id/submit', security.feature('assignments.submit'), (req, res) => {
    assert(
      req.user.role === 'student' && req.user.student_id,
      403,
      'تحویل تکلیف فقط توسط دانش‌آموز انجام می‌شود.',
    );
    const row = assignment(req);
    assert(
      row.status === 'published' && row.due_date >= today(),
      409,
      'مهلت تحویل این تکلیف به پایان رسیده است.',
    );
    const data = parse(
      z.object({
        body: z.string().trim().min(1, 'پاسخ تکلیف را وارد کنید.').max(10000),
        file_id: z.number().int().positive().nullable().optional(),
      }),
      req.body,
    );
    const previous = db.get('SELECT * FROM submissions WHERE assignment_id=? AND student_id=?', [
      row.id,
      req.user.student_id,
    ]);
    if (previous) {
      assert(
        previous.score === null || previous.allow_resubmit,
        409,
        'پاسخ ارزیابی‌شده قفل است؛ برای ارسال دوباره از معلم اجازه بگیرید.',
      );
      assertRevision(previous, req.body.revision);
    }
    assertFileContext(db, data.file_id, req.user, 'submission', previous?.file_id);
    db.transaction(() => {
      db.run(
        "INSERT INTO submissions(assignment_id,student_id,body,file_id) VALUES (?,?,?,?) ON CONFLICT(assignment_id,student_id) DO UPDATE SET body=excluded.body,file_id=excluded.file_id,submitted_at=datetime('now'),score=NULL,feedback=NULL,reviewed_at=NULL,allow_resubmit=0,revision=submissions.revision+1",
        [row.id, req.user.student_id, data.body, data.file_id || null],
      );
      const teacher = db.get('SELECT user_id FROM teachers WHERE id=?', [row.teacher_id]);
      notify(
        db,
        teacher?.user_id,
        'تکلیف جدید تحویل شد',
        `${req.user.full_name}: ${row.title}`,
        '/education?tab=assignments',
        'education',
      );
      log(db, req.user, 'assignments.submit', 'assignments', row.id);
    });
    res.json({ ok: true });
  });
  router.patch(
    '/:id/submissions/:submissionId',
    security.feature('assignments.review'),
    (req, res) => {
      assert(
        ['admin', 'teacher'].includes(req.user.role),
        403,
        'ارزیابی فقط برای مدیر و معلم مجاز است.',
      );
      const row = assignment(req);
      assertScope(db, 'assignments', row, req.user, true);
      const submission = db.get('SELECT * FROM submissions WHERE id=? AND assignment_id=?', [
        positiveId(req.params.submissionId),
        row.id,
      ]);
      assert(submission, 404, 'پاسخ دانش‌آموز پیدا نشد.');
      assertRevision(submission, req.body.revision);
      const data = parse(
        z.object({
          score: z
            .number()
            .min(0)
            .max(row.max_score || 20),
          feedback: z.string().max(3000).optional().default(''),
          allow_resubmit: z.boolean().optional().default(false),
        }),
        req.body,
      );
      db.transaction(() => {
        db.run(
          "UPDATE submissions SET score=?,feedback=?,reviewed_at=datetime('now'),allow_resubmit=?,revision=revision+1 WHERE id=?",
          [data.score, data.feedback, data.allow_resubmit ? 1 : 0, submission.id],
        );
        const student = db.get('SELECT user_id,guardian_user_id FROM students WHERE id=?', [
          submission.student_id,
        ]);
        for (const uid of [student?.user_id, student?.guardian_user_id].filter(Boolean))
          notify(
            db,
            uid,
            'تکلیف شما بررسی شد',
            `${row.title}: نمره ${data.score}`,
            '/education?tab=assignments',
            'education',
          );
        log(db, req.user, 'assignments.review', 'submissions', submission.id);
      });
      res.json({ ok: true });
    },
  );
  return router;
}
