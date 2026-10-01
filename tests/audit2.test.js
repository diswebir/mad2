import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { auditFixture } from './helpers.js';
import { today } from '../server/security.js';

let f, admin, teacher, student, parent;
before(async () => {
  f = await auditFixture();
  [admin, teacher, student, parent] = await Promise.all(
    ['admin', 'teacher', 'student', 'parent'].map((role) => f.client().demo(role)),
  );
});
after(async () => f.close());
const feature = (id, enabled) =>
  f.db.run('UPDATE features SET enabled=? WHERE id=?', [enabled ? 1 : 0, id]);

test('audit2: stale revisions fail loudly and correct revisions succeed', async () => {
  const row = f.db.get('SELECT * FROM students WHERE id=3');
  const stale = await admin.request('/entities/students/3', {
    method: 'PATCH',
    body: { address: 'ویرایش اول', revision: row.revision },
  });
  assert.equal(stale.status, 200);
  const conflict = await admin.request('/entities/students/3', {
    method: 'PATCH',
    body: { address: 'ویرایش با نسخه قدیمی', revision: row.revision },
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.code, 'STALE_RECORD');
  assert.equal(f.db.get('SELECT address FROM students WHERE id=3').address, 'ویرایش اول');
});

test('audit2: list responses carry per-record permissions for every role', async () => {
  const adminRow = (await admin.request('/entities/students?limit=1')).data.rows[0];
  const teacherRow = (await teacher.request('/entities/students?limit=1')).data.rows[0];
  const studentRow = (await student.request('/entities/students')).data.rows[0];
  assert.equal(adminRow.permissions.edit, true);
  assert.equal(teacherRow.permissions.edit, false);
  assert.equal(studentRow.permissions.delete, false);
  const documents = (await student.request('/entities/documents')).data.rows;
  assert(documents.every((row) => typeof row.permissions.edit === 'boolean'));
});

test('audit2: a reviewed submission is locked until the teacher allows another attempt', async () => {
  const assignment = f.db.get('SELECT * FROM assignments WHERE teacher_id=1 AND subject_id=1');
  const submission = f.db.get('SELECT * FROM submissions WHERE assignment_id=?', [assignment.id]);
  f.db.run('UPDATE submissions SET allow_resubmit=0, score=17, feedback=? WHERE id=?', [
    'ارزیابی اولیه',
    submission.id,
  ]);
  try {
    const locked = await student.request(`/assignments/${assignment.id}/submit`, {
      method: 'POST',
      body: { body: 'تلاش دوباره بدون اجازه', revision: submission.revision },
    });
    assert.equal(locked.status, 409);
    const review = await teacher.request(
      `/assignments/${assignment.id}/submissions/${submission.id}`,
      {
        method: 'PATCH',
        body: {
          score: 17,
          feedback: 'برای اصلاح باز است',
          allow_resubmit: true,
          revision: submission.revision,
        },
      },
    );
    assert.equal(review.status, 200);
    const again = await student.request(`/assignments/${assignment.id}/submit`, {
      method: 'POST',
      body: { body: 'نسخه اصلاح‌شده', revision: submission.revision + 1 },
    });
    assert.equal(again.status, 200);
    const cleared = f.db.get('SELECT score,allow_resubmit,revision FROM submissions WHERE id=?', [
      submission.id,
    ]);
    assert.equal(cleared.score, null);
    assert.equal(cleared.allow_resubmit, 0);
    assert(cleared.revision > submission.revision + 1);
  } finally {
    f.db.run('UPDATE submissions SET score=16, feedback=NULL, allow_resubmit=1 WHERE id=?', [
      submission.id,
    ]);
  }
});

test('audit2: an absent mark notifies student and guardian exactly once and hides with its module', async () => {
  const before = f.db.get(
    "SELECT COUNT(*) n FROM notifications WHERE title='غیبت ثبت شد' AND user_id IN (?,?)",
    [
      f.db.get('SELECT user_id FROM students WHERE id=1').user_id,
      f.db.get('SELECT guardian_user_id FROM students WHERE id=1').guardian_user_id,
    ],
  ).n;
  const save = {
    method: 'POST',
    body: {
      class_id: 1,
      date: today(),
      records: [{ student_id: 1, status: 'absent', note: 'آزمون اعلان' }],
    },
  };
  assert.equal((await teacher.request('/attendance', save)).status, 200);
  assert.equal((await teacher.request('/attendance', save)).status, 200);
  const after = f.db.get(
    "SELECT COUNT(*) n FROM notifications WHERE title='غیبت ثبت شد' AND user_id IN (?,?)",
    [
      f.db.get('SELECT user_id FROM students WHERE id=1').user_id,
      f.db.get('SELECT guardian_user_id FROM students WHERE id=1').guardian_user_id,
    ],
  ).n;
  assert.equal(after, before + 2);
  feature('attendance.view', false);
  try {
    const hidden = (await parent.request('/notifications?paginated=1')).data.rows;
    assert(!hidden.some((row) => row.title === 'غیبت ثبت شد'));
  } finally {
    feature('attendance.view', true);
  }
  await admin.request('/entities/attendance/1', { method: 'DELETE', body: {} }).catch(() => {});
  f.db.run("UPDATE attendance SET status='present', note='' WHERE student_id=1 AND date=?", [
    today(),
  ]);
});

test('audit2: a class announcement is delivered once, only to its members', async () => {
  const outsider = f.db.get('SELECT id FROM students WHERE class_id=2').id;
  const outsiderUser = f.db.get('SELECT user_id FROM students WHERE id=?', [outsider]).user_id;
  const created = await admin.request('/entities/announcements', {
    method: 'POST',
    body: {
      title: 'آزمون اعلان کلاسی',
      body: 'متن آزمایشی اعلان کلاسی برای اعضای کلاس',
      audience: 'student',
      class_id: 1,
      publish_date: today(),
    },
  });
  assert.equal(created.status, 201);
  const count = () =>
    f.db.get("SELECT COUNT(*) n FROM notifications WHERE title='آزمون اعلان کلاسی'").n;
  assert(count() >= 1);
  const delivered = count();
  await admin.request('/dashboard');
  await admin.request('/lookups');
  assert.equal(count(), delivered);
  assert(
    !f.db.get("SELECT id FROM notifications WHERE title='آزمون اعلان کلاسی' AND user_id=?", [
      outsiderUser,
    ]),
  );
  assert(
    f.db.get("SELECT id FROM notifications WHERE title='آزمون اعلان کلاسی' AND user_id=?", [
      student.user.id,
    ]),
  );
});

test('audit2: a transferred student keeps past attendance and cannot be re-recorded for the old date', async () => {
  const original = f.db.get('SELECT * FROM students WHERE id=4');
  const past = f.db.get('SELECT * FROM attendance WHERE student_id=4 ORDER BY date LIMIT 1');
  try {
    const move = await admin.request('/entities/students/4', {
      method: 'PATCH',
      body: { class_id: 2 },
    });
    assert.equal(move.status, 200);
    const history = f.db.get('SELECT * FROM attendance WHERE id=?', [past.id]);
    assert.equal(history.class_id, past.class_id);
    const duplicate = await admin.request('/attendance', {
      method: 'POST',
      body: { class_id: 2, date: past.date, records: [{ student_id: 4, status: 'present' }] },
    });
    assert.equal(duplicate.status, 409);
    assert.equal((await teacher.request(`/attendance/student/${original.id}`)).status, 403);
  } finally {
    f.db.run('UPDATE students SET class_id=? WHERE id=4', [original.class_id]);
  }
});

test('audit2: disabling teacher read access hides related teacher labels everywhere', async () => {
  feature('teachers.view', false);
  try {
    const lookups = (await student.request('/lookups')).data;
    assert.equal(lookups.teachers, undefined);
    assert.equal(
      (await parent.request('/reports')).data.classes.every((row) => row.teacher === null),
      true,
    );
  } finally {
    feature('teachers.view', true);
  }
});

test('audit2: linked accounts stay inactive while their record is inactive, for every login path', async () => {
  const teacherRecord = f.db.get('SELECT * FROM teachers WHERE user_id IS NOT NULL LIMIT 1');
  const username = f.db.get('SELECT username FROM users WHERE id=?', [
    teacherRecord.user_id,
  ]).username;
  await admin.request(`/entities/teachers/${teacherRecord.id}`, {
    method: 'PATCH',
    body: { status: 'inactive' },
  });
  try {
    const blocked = await f.client().request('/auth/login', {
      method: 'POST',
      body: { username, password: 'School@1405' },
    });
    assert.equal(blocked.status, 401);
    await admin.request(`/entities/teachers/${teacherRecord.id}`, {
      method: 'PATCH',
      body: { status: 'active' },
    });
    const fresh = await f.client().login(username);
    assert.equal(fresh.user.role, 'teacher');
  } finally {
    await admin.request(`/entities/teachers/${teacherRecord.id}`, {
      method: 'PATCH',
      body: { status: 'active' },
    });
  }
});

test('audit2: grade history follows the recorded class, not the student’s later class', async () => {
  const row = f.db.get('SELECT * FROM students WHERE id=5');
  const grade = f.db.get('SELECT * FROM grades WHERE student_id=5 LIMIT 1');
  try {
    const moved = await admin.request('/entities/students/5', {
      method: 'PATCH',
      body: { class_id: 2 },
    });
    assert.equal(moved.status, 200);
    const edit = await admin.request(`/entities/grades/${grade.id}`, {
      method: 'PATCH',
      body: { score: 15.5 },
    });
    assert.equal(edit.status, 200);
    assert.equal(edit.data.row.class_id, grade.class_id);
  } finally {
    f.db.run('UPDATE students SET class_id=? WHERE id=5', [row.class_id]);
    f.db.run('UPDATE grades SET score=? WHERE id=?', [grade.score, grade.id]);
  }
});

test('audit2: concurrency conflicts are also reported when removing records', async () => {
  const created = await admin.request('/entities/rooms', {
    method: 'POST',
    body: { name: 'اتاق آزمون همزمانی', type: 'classroom', capacity: 10 },
  });
  assert.equal(created.status, 201);
  const row = created.data.row;
  f.db.run('UPDATE rooms SET revision=revision+1 WHERE id=?', [row.id]);
  const conflict = await admin.request(`/entities/rooms/${row.id}`, {
    method: 'DELETE',
    body: { revision: row.revision },
  });
  assert.equal(conflict.status, 409);
  assert.equal(
    (await admin.request(`/entities/rooms/${row.id}`, { method: 'DELETE', body: {} })).status,
    200,
  );
});
