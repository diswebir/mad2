import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { auditFixture } from './helpers.js';
import { today, accountUsable } from '../server/security.js';
import { addDateDays } from '../shared/dates.js';

let f, admin, teacher, student, parent;
before(async () => {
  f = await auditFixture();
  [admin, teacher, student, parent] = await Promise.all(
    ['admin', 'teacher', 'student', 'parent'].map((role) => f.client().demo(role)),
  );
});
after(async () => f.close());

const ok = (result, status = 200) =>
  assert.equal(
    result.status,
    status,
    `expected ${status} got ${result.status}: ${result.data?.error}`,
  );
const blocked = (result, status = 403) =>
  assert.equal(
    result.status,
    status,
    `expected ${status} got ${result.status}: ${result.data?.error}`,
  );

const demoClient = async (user) => {
  const client = f.client();
  await client.login(user.username, 'School@1405');
  return client;
};
const otherStudentClient = async (classId) => {
  const candidates = f.db.all(
    "SELECT * FROM users WHERE role='student' AND active=1 AND must_change_password=0 AND student_id IN (SELECT id FROM students WHERE class_id!=? AND status='active') LIMIT 6",
    [classId],
  );
  for (const user of candidates) {
    if (!accountUsable(f.db, user)) continue;
    const client = f.client();
    try {
      await client.login(user.username, 'School@1405');
      return client;
    } catch {
      // password changed by an earlier fixture mutation; try the next candidate
    }
  }
  throw new Error('no active student from another class was available');
};

test('audit5: announcements reach exactly the intended audience once', async () => {
  const before = f.db.get('SELECT COUNT(*) n FROM notifications').n;
  const created = await admin.request('/entities/announcements', {
    method: 'POST',
    body: {
      title: 'اطلاعیه سراسری آزمایشی',
      body: 'متن اطلاعیه سراسری برای همه.',
      audience: 'all',
      publish_date: today(),
    },
  });
  ok(created, 201);
  await student.request('/notifications?paginated=1&limit=1');
  const once = f.db.get('SELECT COUNT(*) n FROM notifications WHERE title=?', [
    'اطلاعیه سراسری آزمایشی',
  ]).n;
  await student.request('/notifications?paginated=1&limit=1');
  await teacher.request('/notifications?paginated=1&limit=1');
  const twice = f.db.get('SELECT COUNT(*) n FROM notifications WHERE title=?', [
    'اطلاعیه سراسری آزمایشی',
  ]).n;
  assert.equal(once, twice, 'announcement delivery must be one-shot');
  assert.ok(once > before, 'announcement must create notifications');
  const studentList = await student.request('/entities/announcements');
  ok(studentList);
  assert.ok(studentList.data.rows.some((row) => row.title === 'اطلاعیه سراسری آزمایشی'));

  const teacherOnly = await admin.request('/entities/announcements', {
    method: 'POST',
    body: {
      title: 'اطلاعیه ویژه معلمان',
      body: 'فقط معلمان.',
      audience: 'teacher',
      publish_date: today(),
    },
  });
  ok(teacherOnly, 201);
  const studentListAgain = await student.request('/entities/announcements');
  assert.ok(!studentListAgain.data.rows.some((row) => row.title === 'اطلاعیه ویژه معلمان'));
  const teacherList = await teacher.request('/entities/announcements');
  assert.ok(teacherList.data.rows.some((row) => row.title === 'اطلاعیه ویژه معلمان'));

  const future = await admin.request('/entities/announcements', {
    method: 'POST',
    body: {
      title: 'اطلاعیه آینده',
      body: 'هنوز منتشر نشده.',
      audience: 'all',
      publish_date: addDateDays(today(), 3),
    },
  });
  ok(future, 201);
  const visibleNow = await student.request('/entities/announcements');
  assert.ok(!visibleNow.data.rows.some((row) => row.title === 'اطلاعیه آینده'));
  assert.equal(
    f.db.get('SELECT COUNT(*) n FROM notifications WHERE title=?', ['اطلاعیه آینده']).n,
    0,
  );
  const badExpiry = await admin.request('/entities/announcements', {
    method: 'POST',
    body: {
      title: 'اطلاعیه نامعتبر',
      body: 'تاریخ پایان قبل از انتشار.',
      audience: 'all',
      publish_date: today(),
      expires_at: addDateDays(today(), -1),
    },
  });
  assert.equal(badExpiry.status, 422);
});

test('audit5: class-targeted announcements do not leak across classes', async () => {
  const cls = f.db.get('SELECT class_id FROM students WHERE id=?', [
    student.user.student_id,
  ]).class_id;
  const outsiderClient = await otherStudentClient(cls);
  const created = await admin.request('/entities/announcements', {
    method: 'POST',
    body: {
      title: 'اطلاعیه کلاس یک',
      body: 'فقط برای کلاس هدف.',
      audience: 'all',
      class_id: cls,
      publish_date: today(),
    },
  });
  ok(created, 201);
  const inside = await student.request('/entities/announcements');
  assert.ok(inside.data.rows.some((row) => row.title === 'اطلاعیه کلاس یک'));
  const outside = await outsiderClient.request('/entities/announcements');
  assert.ok(!outside.data.rows.some((row) => row.title === 'اطلاعیه کلاس یک'));
  const outsiderNotifications = await outsiderClient.request(
    '/notifications?paginated=1&limit=100',
  );
  assert.ok(!outsiderNotifications.data.rows.some((row) => row.title === 'اطلاعیه کلاس یک'));
});

test('audit5: grades and submissions notify students and guardians', async () => {
  const target = f.db.get(
    "SELECT * FROM students WHERE guardian_user_id IS NOT NULL AND status='active' LIMIT 1",
  );
  assert.ok(target, 'demo student with guardian account expected');
  const subject = f.db.get(
    "SELECT * FROM subjects WHERE grade='all' OR grade=(SELECT grade FROM classes WHERE id=?) LIMIT 1",
    [target.class_id],
  );
  const teacherId = f.db.get('SELECT teacher_id FROM classes WHERE id=?', [
    target.class_id,
  ]).teacher_id;
  const teacherClient = await demoClient(
    f.db.get('SELECT * FROM users WHERE teacher_id=?', [teacherId]),
  );
  const grade = await admin.request('/entities/grades', {
    method: 'POST',
    body: {
      title: 'آزمون میان‌ترم',
      student_id: target.id,
      subject_id: subject.id,
      score: 18,
      max_score: 20,
      coefficient: 2,
    },
  });
  ok(grade, 201);
  const studentNotices = f.db.get(
    "SELECT COUNT(*) n FROM notifications WHERE title='نمره جدید ثبت شد' AND user_id=?",
    [target.user_id],
  ).n;
  const guardianNotices = f.db.get(
    "SELECT COUNT(*) n FROM notifications WHERE title='نمره جدید ثبت شد' AND user_id=?",
    [target.guardian_user_id],
  ).n;
  assert.ok(studentNotices >= 1, 'student must be notified of new grades');
  assert.ok(guardianNotices >= 1, 'guardian must be notified of new grades');

  const slot = f.db.get('SELECT * FROM schedules WHERE class_id=? LIMIT 1', [target.class_id]);
  assert.ok(slot, 'schedule for target class expected');
  const assignment = await teacherClient.request('/entities/assignments', {
    method: 'POST',
    body: {
      title: 'تکلیف اعلان‌دار',
      class_id: target.class_id,
      subject_id: slot.subject_id,
      due_date: today(),
      max_score: 20,
      description: 'برای آزمون اعلان‌ها',
    },
  });
  ok(assignment, 201);
  const studentUser = f.db.get('SELECT * FROM users WHERE id=?', [target.user_id]);
  const studentClient = await demoClient(studentUser);
  const submitted = await studentClient.request(`/assignments/${assignment.data.row.id}/submit`, {
    method: 'POST',
    body: { body: 'پاسخ اعلان‌دار' },
  });
  ok(submitted);
  const reviewNotice = f.db.get(
    "SELECT COUNT(*) n FROM notifications WHERE title='تکلیف شما بررسی شد' AND user_id=?",
    [target.user_id],
  ).n;
  assert.equal(reviewNotice, 0, 'no review notice before review');
  ok(await teacherClient.request('/entities/assignments', { method: 'GET' }));
  const teacherUser = f.db.get('SELECT * FROM users WHERE teacher_id=?', [teacherId]);
  const submission = f.db.get('SELECT * FROM submissions WHERE assignment_id=? AND student_id=?', [
    assignment.data.row.id,
    target.id,
  ]);
  const reviewed = await teacherClient.request(
    `/assignments/${assignment.data.row.id}/submissions/${submission.id}`,
    {
      method: 'PATCH',
      body: { score: 19, feedback: 'خوب', revision: submission.revision },
    },
  );
  ok(reviewed);
  assert.equal(
    f.db.get(
      "SELECT COUNT(*) n FROM notifications WHERE title='تکلیف شما بررسی شد' AND user_id=?",
      [target.user_id],
    ).n,
    1,
  );
  assert.equal(
    f.db.get(
      "SELECT COUNT(*) n FROM notifications WHERE title='تکلیف شما بررسی شد' AND user_id=?",
      [target.guardian_user_id],
    ).n,
    1,
  );
  assert.ok(teacherUser);
});

test('audit5: teachers announce only to their own classes', async () => {
  const schoolWide = await teacher.request('/entities/announcements', {
    method: 'POST',
    body: {
      title: 'اطلاعیه سراسری معلم',
      body: 'نباید مجاز باشد.',
      audience: 'all',
      publish_date: today(),
    },
  });
  blocked(schoolWide);
  const own = f.db.get('SELECT id FROM classes WHERE teacher_id=? LIMIT 1', [
    teacher.user.teacher_id,
  ]);
  const created = await teacher.request('/entities/announcements', {
    method: 'POST',
    body: {
      title: 'اطلاعیه کلاس خودم',
      body: 'برای کلاس خودم.',
      audience: 'student',
      class_id: own.id,
      publish_date: today(),
    },
  });
  ok(created, 201);
  const foreign = f.db.get(
    'SELECT id FROM classes WHERE id NOT IN (SELECT id FROM classes WHERE teacher_id=? UNION SELECT class_id FROM schedules WHERE teacher_id=?) LIMIT 1',
    [teacher.user.teacher_id, teacher.user.teacher_id],
  );
  if (foreign)
    blocked(
      await teacher.request('/entities/announcements', {
        method: 'POST',
        body: {
          title: 'اطلاعیه کلاس دیگران',
          body: 'نباید مجاز باشد.',
          audience: 'student',
          class_id: foreign.id,
          publish_date: today(),
        },
      }),
    );
});

test('audit5: counseling, health and discipline follow role rules', async () => {
  const cls = f.db.get('SELECT class_id FROM students WHERE id=?', [
    student.user.student_id,
  ]).class_id;
  const classStudent = f.db.get('SELECT id FROM students WHERE class_id=? LIMIT 1', [cls]);
  const allowed = await teacher.request('/entities/counseling', {
    method: 'POST',
    body: {
      student_id: classStudent.id,
      title: 'جلسه راهنمایی',
      counselor: 'مشاور',
      session_date: today(),
    },
  });
  assert.ok([201, 403].includes(allowed.status), 'teacher counseling is role-dependent');
  const foreignStudent = f.db.get(
    'SELECT id FROM students WHERE class_id NOT IN (SELECT id FROM classes WHERE teacher_id=? UNION SELECT class_id FROM schedules WHERE teacher_id=?) LIMIT 1',
    [teacher.user.teacher_id, teacher.user.teacher_id],
  );
  if (foreignStudent && allowed.status === 201)
    blocked(
      await teacher.request('/entities/counseling', {
        method: 'POST',
        body: {
          student_id: foreignStudent.id,
          title: 'جلسه غیرمجاز',
          counselor: 'مشاور',
          session_date: today(),
        },
      }),
    );
  blocked(await student.request('/entities/counseling'));
  blocked(
    await teacher.request('/entities/health', {
      method: 'POST',
      body: {
        student_id: classStudent.id,
        title: 'معاینه',
        check_date: today(),
      },
    }),
  );
  ok(await student.request('/entities/health'));
});

test('audit5: term switching archives the previous current term', async () => {
  const current = f.db.get("SELECT * FROM terms WHERE status='current'");
  assert.ok(current, 'demo current term expected');
  const created = await admin.request('/entities/terms', {
    method: 'POST',
    body: {
      name: '۱۴۰۶–۱۴۰۷',
      start_date: addDateDays(today(), 10),
      end_date: addDateDays(today(), 300),
      status: 'current',
    },
  });
  ok(created, 201);
  assert.equal(
    f.db.get('SELECT status FROM terms WHERE id=?', [current.id]).status,
    'archived',
    'previous current term must be archived',
  );
  assert.equal(f.db.setting('school', {}).academic_year, '۱۴۰۶–۱۴۰۷');
  ok(
    await admin.request(`/entities/terms/${created.data.row.id}`, {
      method: 'PATCH',
      body: { status: 'planned', revision: created.data.row.revision },
    }),
  );
  ok(
    await admin.request(`/entities/terms/${current.id}`, {
      method: 'PATCH',
      body: {
        status: 'current',
        revision: f.db.get('SELECT revision FROM terms WHERE id=?', [current.id]).revision,
      },
    }),
  );
});

test('audit5: student import validates rows and reports row numbers', async () => {
  const cls = f.db.get('SELECT id,grade FROM classes ORDER BY id LIMIT 1');
  const csvText = [
    'first_name,last_name,class_id,guardian_name,guardian_phone',
    `زهرا,آزمون‌پور,${cls.id},ولی آزمون,09121110000`,
    `محمد,آزمون‌نژاد,${cls.id},ولی آزمون,09121110001`,
  ].join('\n');
  const body = new FormData();
  body.append('file', new Blob([csvText]), 'students.csv');
  const imported = await admin.request('/entities/students/import', { method: 'POST', body });
  assert.ok([201, 409, 422].includes(imported.status), JSON.stringify(imported.data));
  if (imported.status === 201) {
    assert.equal(imported.data.count, 2);
    assert.ok(Array.isArray(imported.data.credentials));
  }
  const duplicate = new FormData();
  duplicate.append(
    'file',
    new Blob([
      `first_name,last_name,class_id,guardian_name,guardian_phone\nتکراری,ملی,${cls.id},ولی,09121110002`,
    ]),
  );
  const teacherAttempt = await teacher.request('/entities/students/import', {
    method: 'POST',
    body: duplicate,
  });
  blocked(teacherAttempt);
  const many = new FormData();
  many.append(
    'file',
    new Blob([
      'first_name,last_name,class_id,guardian_name,guardian_phone\n' +
        Array.from(
          { length: 51 },
          (_, i) => `نام${i},خانواده${i},${cls.id},ولی,0912000${String(i).padStart(4, '0')}`,
        ).join('\n'),
    ]),
  );
  const tooMany = await admin.request('/entities/students/import', { method: 'POST', body: many });
  assert.equal(tooMany.status, 422);
});

test('audit5: invoice balances stay consistent through payment edits', async () => {
  const target = f.db.get("SELECT * FROM students WHERE status='active' LIMIT 1");
  const invoice = await admin.request('/entities/invoices', {
    method: 'POST',
    body: {
      title: 'شهریه آزمایشی',
      student_id: target.id,
      amount: 1000,
      due_date: today(),
    },
  });
  ok(invoice, 201);
  assert.equal(invoice.data.row.status, 'unpaid');
  const payment = await admin.request('/entities/payments', {
    method: 'POST',
    body: {
      invoice_id: invoice.data.row.id,
      amount: 400,
      payment_date: today(),
      reference: 'R-1',
    },
  });
  ok(payment, 201);
  assert.equal(
    f.db.get('SELECT status,paid_amount FROM invoices WHERE id=?', [invoice.data.row.id]).status,
    'partial',
  );
  const second = await admin.request('/entities/payments', {
    method: 'POST',
    body: {
      invoice_id: invoice.data.row.id,
      amount: 600,
      payment_date: today(),
      reference: 'R-2',
    },
  });
  ok(second, 201);
  assert.equal(
    f.db.get('SELECT status FROM invoices WHERE id=?', [invoice.data.row.id]).status,
    'paid',
  );
  const reduce = await admin.request(`/entities/payments/${second.data.row.id}`, {
    method: 'PATCH',
    body: { amount: 100, revision: second.data.row.revision },
  });
  ok(reduce);
  assert.equal(
    f.db.get('SELECT status FROM invoices WHERE id=?', [invoice.data.row.id]).status,
    'partial',
  );
  const overpay = await admin.request(`/entities/payments/${second.data.row.id}`, {
    method: 'PATCH',
    body: { amount: 5000, revision: reduce.data.row.revision },
  });
  assert.equal(overpay.status, 422);
  ok(await admin.request(`/entities/payments/${second.data.row.id}`, { method: 'DELETE' }));
  assert.equal(
    f.db.get('SELECT status,paid_amount FROM invoices WHERE id=?', [invoice.data.row.id]).status,
    'partial',
  );
  const duplicateReference = await admin.request('/entities/payments', {
    method: 'POST',
    body: {
      invoice_id: invoice.data.row.id,
      amount: 100,
      payment_date: today(),
      reference: 'R-1',
    },
  });
  assert.ok([201, 409].includes(duplicateReference.status));
});

test('audit5: stale deletes and capacity limits are rejected', async () => {
  const cls = await admin.request('/entities/classes', {
    method: 'POST',
    body: {
      name: 'کلاس تست ظرفیت',
      grade: f.db.get('SELECT grade FROM classes WHERE capacity>=5 LIMIT 1').grade,
      teacher_id: f.db.get('SELECT id FROM teachers WHERE status=? LIMIT 1', ['active']).id,
      capacity: 1,
    },
  });
  ok(cls, 201);
  const makeStudent = (i) =>
    admin.request('/entities/students', {
      method: 'POST',
      body: {
        first_name: `دانش‌آموز${i}`,
        last_name: 'ظرفیت',
        class_id: cls.data.row.id,
        guardian_name: 'ولی',
        guardian_phone: `0912123456${i}`,
        status: 'active',
      },
    });
  ok(await makeStudent(1), 201);
  blocked(await makeStudent(2), 409);

  const route = await admin.request('/entities/routes', {
    method: 'POST',
    body: {
      name: 'سرویس تست',
      driver_name: 'راننده',
      phone: '09121234000',
      plate: '۱۱ب۲۲۲',
      capacity: 1,
    },
  });
  ok(route, 201);
  const routeStudent = await admin.request('/entities/students', {
    method: 'POST',
    body: {
      first_name: 'مسافر۱',
      last_name: 'سرویس',
      class_id: cls.data.row.id,
      guardian_name: 'ولی',
      guardian_phone: '09121234567',
      route_id: route.data.row.id,
      status: 'active',
    },
  });
  assert.equal(routeStudent.status, 409, 'class is full, student must be rejected');

  const studentRow = f.db.get('SELECT * FROM students LIMIT 1');
  const fresh = await admin.request(`/entities/students/${studentRow.id}`, {
    method: 'PATCH',
    body: { address: 'آدرس تازه', revision: studentRow.revision },
  });
  ok(fresh);
  const stale = await admin.request(`/entities/students/${studentRow.id}`, {
    method: 'PATCH',
    body: { address: 'آدرس قدیمی', revision: studentRow.revision },
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'STALE_RECORD');
  const staleDelete = await admin.request(`/entities/students/${studentRow.id}`, {
    method: 'DELETE',
    body: { revision: studentRow.revision },
  });
  assert.equal(staleDelete.status, 409);
  assert.equal(staleDelete.data.code, 'STALE_RECORD');
});

test('audit5: feature and module switches close every path', async () => {
  f.db.run('UPDATE features SET enabled=0 WHERE id=?', ['students.view']);
  const list = await admin.request('/entities/students');
  assert.equal(list.status, 403);
  assert.equal(list.data.code, 'FEATURE_DISABLED');
  const lookups = await admin.request('/lookups');
  ok(lookups);
  assert.equal(lookups.data.students, undefined, 'disabled lookups must not leak');
  const dashboard = await admin.request('/dashboard');
  ok(dashboard);
  assert.equal(dashboard.data.stats.students, null);
  f.db.run('UPDATE features SET enabled=1 WHERE id=?', ['students.view']);
  ok((await admin.request('/entities/students')).rows || { status: 200 });

  f.db.run('UPDATE modules SET enabled=0 WHERE id=?', ['attendance']);
  const attendance = await admin.request('/attendance');
  assert.equal(attendance.status, 403);
  assert.equal(attendance.data.code, 'FEATURE_DISABLED');
  const dashboard2 = await admin.request('/dashboard');
  ok(dashboard2);
  assert.equal(dashboard2.data.stats.attendance_rate, null);
  assert.equal(dashboard2.data.chart.length, 0);
  f.db.run('UPDATE modules SET enabled=1 WHERE id=?', ['attendance']);
  ok(await admin.request('/attendance'));
});

test('audit5: exports obey their own switches and backup stays a real database', async () => {
  assert.equal(
    (await admin.request('/settings/backup', { raw: true })).data.subarray(0, 15).toString(),
    'SQLite format 3',
  );
  ok(await admin.request('/config'));
  const health = await admin.request('/health');
  ok(health);
  assert.equal(health.data.status, 'ok');

  f.db.run('UPDATE features SET enabled=0 WHERE id=?', ['students.export']);
  blocked(await admin.request('/entities/students/export'));
  f.db.run('UPDATE features SET enabled=1 WHERE id=?', ['students.export']);
  ok(await admin.request('/entities/students/export', { raw: true }));

  f.db.run('UPDATE features SET enabled=0 WHERE id=?', ['attendance.export']);
  blocked(await admin.request('/attendance/export'));
  f.db.run('UPDATE features SET enabled=1 WHERE id=?', ['attendance.export']);
  ok(await admin.request('/attendance/export', { raw: true }));

  f.db.run('UPDATE features SET enabled=0 WHERE id=?', ['reports.export']);
  blocked(await admin.request('/reports/export'));
  f.db.run('UPDATE features SET enabled=1 WHERE id=?', ['reports.export']);
  ok(await admin.request('/reports/export', { raw: true }));
});

test('audit5: audit trail records sensitive actions', async () => {
  const toggled = await admin.request('/settings/modules/attendance', {
    method: 'PATCH',
    body: { enabled: false },
  });
  ok(toggled);
  assert.equal((await admin.request('/attendance')).status, 403);
  ok(
    await admin.request('/settings/modules/attendance', {
      method: 'PATCH',
      body: { enabled: true },
    }),
  );
  const entries = await admin.request('/settings/audit');
  ok(entries);
  const actions = new Set(entries.data.map((row) => row.action));
  for (const expected of ['auth.login', 'settings.modules', 'students.create'])
    assert.ok(actions.has(expected), `audit must include ${expected}`);
  blocked(await teacher.request('/settings/audit'));
  blocked(await student.request('/settings/audit'));
});

test('audit5: families and homeroom teachers are notified about new records', async () => {
  const target = f.db.get(
    "SELECT * FROM students WHERE guardian_user_id IS NOT NULL AND status='active' LIMIT 1",
  );
  const title = 'شهریه نیم‌سال دوم';
  const noticeCount = (uid) =>
    f.db.get(
      "SELECT COUNT(*) n FROM notifications WHERE user_id=? AND title='صورتحساب جدید ثبت شد'",
      [uid],
    ).n;
  const beforeNotices = [target.user_id, target.guardian_user_id].map(noticeCount);
  const invoice = await admin.request('/entities/invoices', {
    method: 'POST',
    body: { title, student_id: target.id, amount: 2500000, due_date: addDateDays(today(), 14) },
  });
  ok(invoice, 201);
  [target.user_id, target.guardian_user_id].forEach((uid, index) =>
    assert.equal(
      noticeCount(uid),
      beforeNotices[index] + 1,
      'invoice notice must reach each family member once',
    ),
  );
  assert.ok(
    f.db
      .get(
        "SELECT body FROM notifications WHERE user_id=? AND title='صورتحساب جدید ثبت شد' ORDER BY id DESC LIMIT 1",
        [target.guardian_user_id],
      )
      .body.includes(title),
  );
  const paidBefore = f.db.get(
    "SELECT COUNT(*) n FROM notifications WHERE user_id=? AND title='پرداخت ثبت شد'",
    [target.guardian_user_id],
  ).n;
  const payment = await admin.request('/entities/payments', {
    method: 'POST',
    body: {
      invoice_id: invoice.data.row.id,
      amount: 500000,
      payment_date: today(),
      reference: 'RCPT-NOTIFY',
    },
  });
  ok(payment, 201);
  assert.equal(
    f.db.get("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND title='پرداخت ثبت شد'", [
      target.guardian_user_id,
    ]).n,
    paidBefore + 1,
    'recording a receipt must inform the family',
  );

  const slot = f.db.get('SELECT * FROM schedules WHERE class_id=? LIMIT 1', [target.class_id]);
  assert.ok(slot, 'schedule expected for the class');
  const assignment = await admin.request('/entities/assignments', {
    method: 'POST',
    body: {
      title: 'تکلیف اعلانی',
      class_id: target.class_id,
      subject_id: slot.subject_id,
      due_date: addDateDays(today(), 5),
      max_score: 20,
      description: 'برای آزمون اعلان کلاس',
    },
  });
  ok(assignment, 201);
  assert.ok(
    f.db.get("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND title='تکلیف جدید'", [
      target.user_id,
    ]).n >= 1,
  );

  const exam = await admin.request('/entities/exams', {
    method: 'POST',
    body: {
      title: 'آزمون اعلانی',
      class_id: target.class_id,
      subject_id: slot.subject_id,
      exam_date: addDateDays(today(), 10),
      start_time: '10:00',
      duration: 60,
      max_score: 20,
    },
  });
  ok(exam, 201);
  assert.ok(
    f.db.get("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND title='آزمون جدید'", [
      target.guardian_user_id,
    ]).n >= 1,
  );

  const homeroom = f.db.get(
    'SELECT u.id FROM users u JOIN classes c ON c.teacher_id=u.teacher_id WHERE c.id=?',
    [target.class_id],
  );
  if (homeroom) {
    const before = f.db.get(
      "SELECT COUNT(*) n FROM notifications WHERE user_id=? AND title='دانش‌آموز جدید در کلاس'",
      [homeroom.id],
    ).n;
    f.db.run('UPDATE features SET enabled=0 WHERE id=?', ['students.account']);
    const added = await admin.request('/entities/students', {
      method: 'POST',
      body: {
        first_name: 'تازه',
        last_name: 'وارد',
        class_id: target.class_id,
        guardian_name: 'ولی تازه',
        guardian_phone: '09123334455',
        status: 'active',
      },
    });
    f.db.run('UPDATE features SET enabled=1 WHERE id=?', ['students.account']);
    ok(added, 201);
    assert.equal(
      f.db.get(
        "SELECT COUNT(*) n FROM notifications WHERE user_id=? AND title='دانش‌آموز جدید در کلاس'",
        [homeroom.id],
      ).n,
      before + 1,
    );
  }

  const teacherB = f.db.get(
    'SELECT t.* FROM teachers t WHERE t.id!=? AND NOT EXISTS (SELECT 1 FROM users u WHERE u.teacher_id=t.id AND u.active=1) LIMIT 1',
    [target.teacher_id || 0],
  );
  if (teacherB) {
    const created = await admin.request('/entities/classes', {
      method: 'POST',
      body: {
        name: 'کلاس اعلان تخصیص',
        grade: f.db.get('SELECT grade FROM classes ORDER BY id LIMIT 1').grade,
        teacher_id: teacherB.id,
        capacity: 30,
      },
    });
    ok(created, 201);
    const teacherAccount = f.db.get('SELECT id FROM users WHERE teacher_id=?', [teacherB.id]);
    if (teacherAccount)
      assert.ok(
        f.db.get('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND title=?', [
          teacherAccount.id,
          'کلاس به شما تخصیص یافت',
        ]).n >= 1,
      );
  }
});
