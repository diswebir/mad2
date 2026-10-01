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
