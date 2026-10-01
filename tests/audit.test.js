import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { passwordSchema, today } from '../server/security.js';
import { auditFixture, uploadText } from './helpers.js';

let f, admin, teacher, colleague, student, parent;
before(async () => {
  f = await auditFixture();
  [admin, teacher, student, parent] = await Promise.all(
    ['admin', 'teacher', 'student', 'parent'].map((role) => f.client().demo(role)),
  );
  colleague = await f.client().login('teacher2');
  // A second teacher teaches science in the first teacher's class, not mathematics.
  const result = await admin.request('/entities/schedules', {
    method: 'POST',
    body: {
      title: 'همکار علوم در کلاس مشترک',
      class_id: 1,
      subject_id: 2,
      teacher_id: 2,
      day: '5',
      start_time: '16:00',
      end_time: '17:00',
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
});
after(async () => f.close());

const feature = (id, enabled) =>
  f.db.run('UPDATE features SET enabled=? WHERE id=?', [enabled ? 1 : 0, id]);

test('audit: editing an active student never reactivates a manually disabled account', async () => {
  const row = f.db.get('SELECT * FROM students WHERE id=2');
  await admin.request(`/settings/accounts/${row.user_id}`, {
    method: 'PATCH',
    body: { active: false },
  });
  try {
    assert.equal(
      (
        await admin.request('/entities/students/2', {
          method: 'PATCH',
          body: { address: 'ویرایش نشانی، نه فعال‌سازی حساب' },
        })
      ).status,
      200,
    );
    assert.equal(f.db.get('SELECT active FROM users WHERE id=?', [row.user_id]).active, 0);
  } finally {
    f.db.run('UPDATE users SET active=1 WHERE id=?', [row.user_id]);
  }
});

test('audit: a guardian session is revoked while the linked student is inactive', async () => {
  const p = await f.client().demo('parent');
  try {
    assert.equal(
      (
        await admin.request('/entities/students/1', {
          method: 'PATCH',
          body: { status: 'inactive' },
        })
      ).status,
      200,
    );
    assert.equal((await p.request('/entities/students/1')).status, 401);
    const reactivation = await admin.request(`/settings/accounts/${p.user.id}`, {
      method: 'PATCH',
      body: { active: true },
    });
    assert.equal(reactivation.status, 409);
  } finally {
    f.db.run("UPDATE students SET status='active' WHERE id=1");
    f.db.run('UPDATE users SET active=1 WHERE student_id=1');
    student = await f.client().demo('student');
    parent = await f.client().demo('parent');
  }
});

test('audit: another class teacher cannot take ownership of a colleague assignment', async () => {
  try {
    const response = await colleague.request('/entities/assignments/1', {
      method: 'PATCH',
      body: { title: 'تغییر غیرمجاز همکار' },
    });
    assert.equal(response.status, 403);
    assert.equal(f.db.get('SELECT teacher_id FROM assignments WHERE id=1').teacher_id, 1);
  } finally {
    f.db.run('UPDATE assignments SET teacher_id=1 WHERE id=1');
  }
});

test('audit: assignment submissions and reviews belong to the designated teacher, not every class teacher', async () => {
  const submission = f.db.get('SELECT id FROM submissions WHERE assignment_id=1 LIMIT 1');
  assert(submission);
  assert.equal((await colleague.request('/assignments/1/submissions')).status, 403);
  assert.equal(
    (
      await colleague.request(`/assignments/1/submissions/${submission.id}`, {
        method: 'PATCH',
        body: { score: 10, feedback: 'ارزیابی توسط معلم غیرمرتبط' },
      })
    ).status,
    403,
  );
});

test('audit: private document authorship prevents a student deleting an official document', async () => {
  const document = f.db.get('SELECT * FROM documents WHERE student_id=1 AND author_id!=?', [
    student.user.id,
  ]);
  assert(document);
  const response = await student.request(`/entities/documents/${document.id}`, {
    method: 'PATCH',
    body: { title: 'دستکاری مدرک رسمی' },
  });
  assert.equal(response.status, 403);
});

test('audit: assignments with submitted work cannot silently change class, scale, or erase answers', async () => {
  const row = f.db.get('SELECT * FROM assignments WHERE id=1');
  try {
    const response = await admin.request('/entities/assignments/1', {
      method: 'PATCH',
      body: { class_id: 2 },
    });
    assert.equal(response.status, 409);
    const score = await admin.request('/entities/assignments/1', {
      method: 'PATCH',
      body: { max_score: 5 },
    });
    assert.equal(score.status, 409);
    assert.equal(
      (await admin.request('/entities/assignments/1', { method: 'DELETE', body: {} })).status,
      409,
    );
  } finally {
    f.db.run('UPDATE assignments SET class_id=?,max_score=? WHERE id=1', [
      row.class_id,
      row.max_score,
    ]);
  }
});

test('audit: an exam cannot invalidate existing linked marks', async () => {
  const grade = f.db.get('SELECT * FROM grades WHERE exam_id IS NOT NULL LIMIT 1');
  assert(grade);
  const exam = f.db.get('SELECT * FROM exams WHERE id=?', [grade.exam_id]);
  try {
    const result = await admin.request(`/entities/exams/${exam.id}`, {
      method: 'PATCH',
      body: { max_score: 5 },
    });
    assert.equal(result.status, 409);
  } finally {
    f.db.run('UPDATE exams SET max_score=? WHERE id=?', [exam.max_score, exam.id]);
  }
});

test('audit: a paid invoice cannot be transferred to another student', async () => {
  const invoice = f.db.get('SELECT * FROM invoices WHERE paid_amount>0 LIMIT 1');
  try {
    const result = await admin.request(`/entities/invoices/${invoice.id}`, {
      method: 'PATCH',
      body: { student_id: invoice.student_id === 2 ? 3 : 2 },
    });
    assert.equal(result.status, 409);
  } finally {
    f.db.run('UPDATE invoices SET student_id=? WHERE id=?', [invoice.student_id, invoice.id]);
  }
});

test('audit: disabled read capabilities close lookup, profile, report and export bypasses', async (t) => {
  await t.test('lookup labels disappear when student viewing is disabled', async () => {
    feature('students.view', false);
    try {
      assert.equal((await admin.request('/lookups')).data.students, undefined);
    } finally {
      feature('students.view', true);
    }
  });
  await t.test('profile also requires the student view capability', async () => {
    feature('students.view', false);
    try {
      assert.equal((await admin.request('/students/1/profile')).status, 403);
    } finally {
      feature('students.view', true);
    }
  });
  await t.test('disabled grades do not leak through aggregate reports', async () => {
    feature('grades.view', false);
    try {
      const result = await student.request('/reports');
      assert.equal(result.status, 200);
      assert.equal(result.data.average, null);
      assert.equal(result.data.grade_count, null);
    } finally {
      feature('grades.view', true);
    }
  });
  await t.test('report export requires report viewing', async () => {
    feature('reports.view', false);
    try {
      assert.equal((await parent.request('/reports/export', { raw: true })).status, 403);
    } finally {
      feature('reports.view', true);
    }
  });
  await t.test('attendance export requires attendance viewing', async () => {
    feature('attendance.view', false);
    try {
      assert.equal((await student.request('/attendance/export', { raw: true })).status, 403);
    } finally {
      feature('attendance.view', true);
    }
  });
});

test('audit: file owners cannot bypass attachment feature switches', async () => {
  const id = await uploadText(student, 'tickets');
  feature('tickets.attachments', false);
  try {
    assert.equal((await student.request(`/files/${id}`, { raw: true })).status, 403);
  } finally {
    feature('tickets.attachments', true);
  }
});

test('audit: upload context prevents using a ticket file as a student document', async () => {
  const id = await uploadText(student, 'tickets');
  const result = await student.request('/entities/documents', {
    method: 'POST',
    body: { student_id: 1, title: 'فایل با زمینه نادرست', file_id: id },
  });
  assert.equal(result.status, 403);
});

test('audit: fractional pagination fails validation rather than causing an SQL/server error', async () => {
  assert.equal((await admin.request('/entities/students?page=1.5')).status, 422);
  assert.equal((await admin.request('/settings/accounts?page=1.5')).status, 422);
});

test('audit: bcrypt passwords are bounded by UTF-8 bytes, not just characters', () => {
  assert.equal(passwordSchema.safeParse('A'.repeat(73)).success, false);
  assert.equal(passwordSchema.safeParse('س'.repeat(37)).success, false);
  assert.equal(passwordSchema.safeParse('س'.repeat(35) + 'Aa').success, true);
});

test('audit: explicit null cannot remove a score scale or create a future birth date', async () => {
  assert.equal(
    (await admin.request('/entities/assignments/1', { method: 'PATCH', body: { max_score: null } }))
      .status,
    422,
  );
  assert.equal(
    (
      await admin.request('/entities/students/1', {
        method: 'PATCH',
        body: { birth_date: '2099-01-01' },
      })
    ).status,
    422,
  );
});

test('audit: class announcements notify timetable teachers as well as the class guide', async () => {
  const result = await admin.request('/entities/announcements', {
    method: 'POST',
    body: {
      title: 'خبر کلاس مشترک',
      body: 'جلسه برای همه معلمان کلاس',
      audience: 'teacher',
      class_id: 1,
      publish_date: today(),
    },
  });
  assert.equal(result.status, 201);
  assert(
    f.db.get('SELECT id FROM notifications WHERE user_id=? AND title=?', [
      colleague.user.id,
      'خبر کلاس مشترک',
    ]),
  );
});
