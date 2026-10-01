import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditFixture, uploadText } from './helpers.js';
import { openDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import bcrypt from 'bcryptjs';
import { today, accountUsable } from '../server/security.js';

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

const makeClient = (url) => {
  let index = 1;
  return () => ({
    cookie: '',
    csrf: '',
    user: null,
    ip: `10.9.0.${index++}`,
    async request(route, { method = 'GET', body, raw = false, headers = {} } = {}) {
      const isForm = body instanceof FormData;
      const response = await fetch(`${url}/api${route}`, {
        method,
        headers: {
          'X-Forwarded-For': this.ip,
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          ...(this.csrf ? { 'X-CSRF-Token': this.csrf } : {}),
          ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
      });
      const cookie = response.headers.get('set-cookie');
      if (cookie) this.cookie = cookie.split(';')[0];
      const data = raw
        ? Buffer.from(await response.arrayBuffer())
        : await response.json().catch(() => null);
      if (data?.csrf) this.csrf = data.csrf;
      if (data?.user) this.user = data.user;
      return { status: response.status, data, headers: response.headers };
    },
  });
};

test('audit4: profile and password lifecycle behave under all roles', async () => {
  blocked(await student.request('/settings/accounts'));
  blocked(await teacher.request('/settings/audit'));
  blocked(await parent.request('/settings/backup'));

  const weak = await student.request('/auth/password', {
    method: 'POST',
    body: { current_password: 'School@1405', new_password: 'short' },
  });
  assert.equal(weak.status, 422);
  const wrong = await student.request('/auth/password', {
    method: 'POST',
    body: { current_password: 'WrongPass!2345', new_password: 'NewStrongPass!2345' },
  });
  assert.equal(wrong.status, 422);
  const changed = await student.request('/auth/password', {
    method: 'POST',
    body: { current_password: 'School@1405', new_password: 'NewStrongPass!2345' },
  });
  ok(changed);
  assert.ok(changed.data.csrf);
  ok(await student.request('/entities/students'), 200);
  const oldLogin = await f.client().request('/auth/login', {
    method: 'POST',
    body: { username: 'student', password: 'School@1405' },
  });
  assert.equal(oldLogin.status, 401, 'old password must stop working');
  await student.request('/auth/password', {
    method: 'POST',
    body: { current_password: 'NewStrongPass!2345', new_password: 'School@1405' },
  });
  await f.client().login('student', 'School@1405');
});

test('audit4: temporary passwords force a change before any work', async () => {
  f.db.run('UPDATE features SET enabled=0 WHERE id=?', ['students.account']);
  const unlinked = await admin.request('/entities/students', {
    method: 'POST',
    body: {
      first_name: 'حساب',
      last_name: 'موقت',
      class_id: f.db.get('SELECT id FROM classes WHERE capacity>=5 ORDER BY id LIMIT 1').id,
      guardian_name: 'ولی موقت',
      guardian_phone: '09129998877',
      status: 'active',
    },
  });
  f.db.run('UPDATE features SET enabled=1 WHERE id=?', ['students.account']);
  ok(unlinked, 201);
  const target = unlinked.data.row;
  const created = await admin.request(`/settings/accounts/create/students/${target.id}`, {
    method: 'POST',
  });
  ok(created, 201);
  const fresh = f.client();
  await fresh.login(created.data.username, created.data.temporary_password);
  const gated = await fresh.request('/entities/students');
  assert.equal(gated.status, 428);
  assert.equal(gated.data.code, 'PASSWORD_CHANGE_REQUIRED');
  ok(await fresh.request('/auth/me'));
  const first = await fresh.request('/auth/password', {
    method: 'POST',
    body: {
      current_password: created.data.temporary_password,
      new_password: 'AnotherGoodPass!2345',
    },
  });
  ok(first);
  ok(await fresh.request('/entities/students'));
  const deactivate = await admin.request(`/settings/accounts/${fresh.user.id}`, {
    method: 'PATCH',
    body: { active: false },
  });
  ok(deactivate);
  const afterDisable = await fresh.request('/entities/students');
  assert.equal(afterDisable.status, 401);
});

test('audit4: file upload contexts, signatures and download authorisation', async () => {
  blocked(await uploadAttempt(student, 'assignments', 'x.pdf', '%PDF-1.4 ok'));
  blocked(await uploadAttempt(parent, 'submission', 'x.txt', 'hello'));
  blocked(await uploadAttempt(teacher, 'documents', 'x.txt', 'hello'));
  const adminTicketFile = await uploadAttempt(admin, 'tickets', 'x.txt', 'hello');
  assert.equal(adminTicketFile.status, 201);
  const badExt = await uploadAttempt(student, 'documents', 'evil.exe', 'MZ');
  assert.equal(badExt.status, 422);
  const badSignature = await uploadAttempt(student, 'documents', 'fake.pdf', 'not a pdf');
  assert.equal(badSignature.status, 422);
  const nulFile = await uploadAttempt(student, 'documents', 'nul.txt', 'abc\u0000def');
  assert.equal(nulFile.status, 422);

  const fileId = await uploadText(student, 'documents');
  ok(await student.request(`/files/${fileId}`, { raw: true }));
  // An unattached upload belongs to its owner only; even the principal cannot read it.
  blocked(await admin.request(`/files/${fileId}`));
});

const uploadAttempt = async (client, context, name, content) => {
  const body = new FormData();
  body.append('file', new Blob([content]), name);
  return client.request(`/files?context=${context}`, { method: 'POST', body });
};

test('audit4: submission files are private to the submitting family', async () => {
  const slot = f.db.get('SELECT * FROM schedules WHERE teacher_id=? LIMIT 1', [
    teacher.user.teacher_id,
  ]);
  const assignment = await teacher.request('/entities/assignments', {
    method: 'POST',
    body: {
      title: 'تکلیف فایل‌دار',
      class_id: slot.class_id,
      subject_id: slot.subject_id,
      due_date: today(),
      max_score: 20,
      description: 'فایل خود را بارگذاری کنید',
    },
  });
  ok(assignment, 201);
  const id = assignment.data.row.id;
  const studentRow = f.db.get('SELECT * FROM students WHERE id=?', [student.user.student_id]);
  assert.equal(studentRow.class_id, slot.class_id, 'demo student must belong to the slot class');
  const fileId = await uploadText(student, 'submission');
  const submitted = await student.request(`/assignments/${id}/submit`, {
    method: 'POST',
    body: { body: 'پاسخ تکلیف', file_id: fileId },
  });
  ok(submitted);
  ok(await student.request(`/files/${fileId}`, { raw: true }));
  ok(await teacher.request(`/files/${fileId}`, { raw: true }));
  ok(await admin.request(`/files/${fileId}`, { raw: true }));
  const strangers = f.db
    .all(
      'SELECT * FROM users WHERE id NOT IN (?,?) AND student_id!=? AND must_change_password=0 LIMIT 12',
      [student.user.id, teacher.user.id, student.user.student_id],
    )
    .filter(
      (user) => accountUsable(f.db, user) && bcrypt.compareSync('School@1405', user.password_hash),
    )
    .slice(0, 3);
  for (const stranger of strangers) {
    const client = f.client();
    await client.login(stranger.username, 'School@1405');
    blocked(await client.request(`/files/${fileId}`));
  }
  ok(await student.request(`/attendance/student/${student.user.student_id}`));
});

test('audit4: notifications respect feature visibility and ownership', async () => {
  const target = f.db.get('SELECT * FROM students WHERE guardian_user_id IS NOT NULL LIMIT 1');
  assert.ok(target);
  const record = await teacher.request('/attendance', {
    method: 'POST',
    body: {
      class_id: target.class_id,
      date: today(),
      records: [{ student_id: target.id, status: 'absent', note: 'audit4' }],
    },
  });
  ok(record);
  const guardian = f.client();
  const guardianUser = f.db.get('SELECT * FROM users WHERE id=?', [target.guardian_user_id]);
  await guardian.login(guardianUser.username, 'School@1405');
  const before = await guardian.request('/notifications?paginated=1&limit=100');
  ok(before);
  assert.ok(before.data.rows.some((row) => row.title.includes('غیبت')));
  const mine = before.data.rows[0];
  const foreign = f.db.get(
    'SELECT * FROM notifications WHERE user_id!=? ORDER BY id DESC LIMIT 1',
    [guardianUser.id],
  );
  assert.equal(
    (await guardian.request('/notifications/read', { method: 'PATCH', body: { id: foreign.id } }))
      .status,
    404,
  );
  const markOne = await guardian.request('/notifications/read', {
    method: 'PATCH',
    body: { id: mine.id },
  });
  ok(markOne);
  const after = await guardian.request('/notifications?paginated=1&limit=100');
  assert.equal(after.data.unread, before.data.unread - 1);

  f.db.run('UPDATE features SET enabled=0 WHERE id=?', ['attendance.view']);
  const hidden = await guardian.request('/notifications?paginated=1&limit=100');
  ok(hidden);
  assert.ok(hidden.data.rows.every((row) => !row.title.includes('غیبت')));
  f.db.run('UPDATE features SET enabled=1 WHERE id=?', ['attendance.view']);
});

test('audit4: attendance rules protect history and scope', async () => {
  blocked(
    await student.request('/attendance', {
      method: 'POST',
      body: {
        class_id: f.db.get('SELECT class_id FROM students WHERE id=?', [student.user.student_id])
          .class_id,
        date: today(),
        records: [{ student_id: student.user.student_id, status: 'present' }],
      },
    }),
  );
  const cls = f.db.get('SELECT class_id FROM students WHERE id=?', [
    student.user.student_id,
  ]).class_id;
  const future = await teacher.request('/attendance', {
    method: 'POST',
    body: {
      class_id: cls,
      date: '2030-01-01',
      records: [{ student_id: student.user.student_id, status: 'present' }],
    },
  });
  assert.equal(future.status, 422);
  const duplicate = await teacher.request('/attendance', {
    method: 'POST',
    body: {
      class_id: cls,
      date: today(),
      records: [
        { student_id: student.user.student_id, status: 'present' },
        { student_id: student.user.student_id, status: 'absent' },
      ],
    },
  });
  assert.equal(duplicate.status, 422);
  const probeDate = '2026-08-18';
  const otherClassStudent = f.db.get(
    'SELECT * FROM students WHERE class_id!=? AND id NOT IN (SELECT student_id FROM attendance WHERE date=?) LIMIT 1',
    [cls, probeDate],
  );
  assert.ok(otherClassStudent, 'a student of another class is required');
  const crossClass = await teacher.request('/attendance', {
    method: 'POST',
    body: {
      class_id: cls,
      date: probeDate,
      records: [{ student_id: otherClassStudent.id, status: 'present' }],
    },
  });
  assert.equal(crossClass.status, 422, JSON.stringify(crossClass.data));
  assert.ok(
    !f.db.get('SELECT id FROM attendance WHERE student_id=? AND date=?', [
      otherClassStudent.id,
      probeDate,
    ]),
    'cross-class attendance must not be written',
  );
  ok(
    await teacher.request('/attendance', {
      method: 'POST',
      body: {
        class_id: cls,
        date: today(),
        records: [{ student_id: student.user.student_id, status: 'present' }],
      },
    }),
  );
  const history = await student.request(`/attendance/student/${student.user.student_id}`);
  ok(history);
  assert.ok(history.data.every((row) => row.student_id === student.user.student_id));
  const exportRows = await teacher.request(`/attendance/export?date=${today()}`, { raw: true });
  assert.equal(exportRows.status, 200);
  assert.ok(exportRows.data.toString().includes('دانش‌آموز'));
});

test('audit4: business validation rejects nonsensical records', async () => {
  const cls = f.db.get('SELECT * FROM classes ORDER BY id LIMIT 1');
  const studentRow = f.db.get('SELECT * FROM students WHERE class_id=? LIMIT 1', [cls.id]);
  const cases = [
    [
      '/entities/payments',
      {
        invoice_id: f.db.get('SELECT id FROM invoices ORDER BY id LIMIT 1').id,
        amount: 1000,
        payment_date: '2031-01-01',
        reference: 'FUTURE',
      },
      422,
    ],
    ['/entities/expenses', { title: 'هزینه آینده', amount: 1000, expense_date: '2031-01-01' }, 422],
    [
      '/entities/visitors',
      {
        full_name: 'مهمان',
        purpose: 'تست',
        entry_time: '12:00',
        exit_time: '09:00',
        visit_date: today(),
      },
      422,
    ],
    [
      '/entities/grades',
      {
        title: 'نمره نامعتبر',
        student_id: studentRow.id,
        subject_id: f.db.get('SELECT id FROM subjects LIMIT 1').id,
        score: 25,
        max_score: 20,
        coefficient: 1,
      },
      422,
    ],
    [
      '/entities/payroll',
      {
        teacher_id: teacher.user.teacher_id,
        month: '۱۴۰۵/۰۷',
        gross: 1000,
        deductions: 2000,
      },
      422,
    ],
    ['/entities/classes', { ...cls, capacity: 1, name: cls.name, revision: cls.revision }, 409],
    [
      '/entities/schedules',
      (() => {
        const existing = f.db.get('SELECT * FROM schedules ORDER BY id LIMIT 1');
        return {
          title: existing.title,
          class_id: existing.class_id,
          subject_id: existing.subject_id,
          teacher_id: existing.teacher_id,
          day: existing.day,
          start_time: existing.start_time,
          end_time: existing.end_time,
        };
      })(),
      409,
    ],
  ];
  for (const [route, body, expected] of cases) {
    const method = route === '/entities/classes' ? 'PATCH' : 'POST';
    const target = method === 'PATCH' ? `${route}/${cls.id}` : route;
    const result = await admin.request(target, { method, body });
    assert.equal(
      result.status,
      expected,
      `${route} expected ${expected} got ${result.status}: ${result.data?.error}`,
    );
  }
  const duplicateNational = await admin.request('/entities/students', {
    method: 'POST',
    body: {
      first_name: 'تکراری',
      last_name: 'ملی',
      class_id: studentRow.class_id,
      national_id: studentRow.national_id,
      guardian_name: 'ولی',
      guardian_phone: '09120000001',
      status: 'inactive',
    },
  });
  assert.equal(duplicateNational.status, 409);
});

test('audit4: CSV exports are scoped and formula-safe', async () => {
  const teacherExport = await teacher.request('/entities/students/export', { raw: true });
  assert.equal(teacherExport.status, 200);
  const teacherTotal = (await teacher.request('/entities/students?limit=1')).data.total;
  const body = teacherExport.data.toString();
  assert.equal(
    body
      .replace(/\uFEFF/, '')
      .trim()
      .split('\r\n').length - 1,
    teacherTotal,
  );

  const created = await admin.request('/entities/students', {
    method: 'POST',
    body: {
      first_name: '=cmd|calc',
      last_name: '@SUM(1)',
      class_id: f.db.get('SELECT id FROM classes ORDER BY id LIMIT 1').id,
      guardian_name: 'ولی تست',
      guardian_phone: '09120000000',
      status: 'inactive',
    },
  });
  ok(created, 201);
  const exportAll = await admin.request('/entities/students/export', { raw: true });
  assert.equal(exportAll.status, 200);
  const csvBody = exportAll.data.toString();
  assert.ok(csvBody.includes("'=cmd|calc"), 'formula cells must be neutralised');
  assert.ok(csvBody.includes("'@SUM(1)"));
  await admin.request(`/entities/students/${created.data.row.id}`, {
    method: 'DELETE',
    body: { revision: created.data.row.revision },
  });
});

test('audit4: login throttling and session revocation', async () => {
  const attacker = f.client();
  let limited = 0;
  for (let attempt = 0; attempt < 14; attempt++) {
    const result = await attacker.request('/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: `wrong-${attempt}` },
    });
    if (result.status === 429) limited++;
  }
  assert.ok(limited > 0, 'rate limiter must engage');
  assert.ok(
    f.db.get("SELECT COUNT(*) n FROM audit WHERE action='auth.login_failed'").n > 0,
    'failed logins must be recorded for the principal',
  );

  ok(await admin.request('/settings/accounts'));
  const teacherUser = f.db.get('SELECT * FROM users WHERE teacher_id=?', [teacher.user.teacher_id]);
  ok(
    await admin.request(`/settings/accounts/${teacherUser.id}`, {
      method: 'PATCH',
      body: { active: false },
    }),
  );
  assert.equal((await teacher.request('/entities/students')).status, 401);
  ok(
    await admin.request(`/settings/accounts/${teacherUser.id}`, {
      method: 'PATCH',
      body: { active: true },
    }),
  );
});

test('installation: token, demo data and repeat-install protection', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'madresehyar-install-'));
  const token = 'a'.repeat(32);
  const db = await openDatabase({ dataDir: dir, memory: true });
  const server = createApp(db, { demo: false, installToken: token }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const client = makeClient(url);
  try {
    const before = client();
    const status = await before.request('/setup');
    ok(status);
    assert.equal(status.data.installed, false);
    assert.ok(status.data.features >= 100);

    const denied = await before.request('/setup', {
      method: 'POST',
      body: {
        token: 'b'.repeat(32),
        school: { name: 'دبیرستان آزمون', principal: 'مدیر آزمون', academic_year: '۱۴۰۵–۱۴۰۶' },
        admin: { username: 'admin', password: 'VeryStrongPass!2345' },
      },
    });
    assert.equal(denied.status, 403);

    const weak = await before.request('/setup', {
      method: 'POST',
      body: {
        token,
        school: { name: 'دبیرستان آزمون', principal: 'مدیر آزمون', academic_year: '۱۴۰۵–۱۴۰۶' },
        admin: { username: 'admin', password: 'short' },
      },
    });
    assert.equal(weak.status, 422);

    const installed = await before.request('/setup', {
      method: 'POST',
      body: {
        token,
        school: { name: 'دبیرستان آزمون', principal: 'مدیر آزمون', academic_year: '۱۴۰۵–۱۴۰۶' },
        admin: { username: 'admin', password: 'VeryStrongPass!2345' },
        demo_data: true,
      },
    });
    ok(installed, 201);
    assert.equal(installed.data.installed, true);
    assert.ok(db.setting('installed'));
    assert.ok(db.get("SELECT id FROM users WHERE username='admin'"));
    const demoUsers = db.all("SELECT * FROM users WHERE role!='admin'");
    assert.ok(demoUsers.length > 0, 'demo data expected');
    assert.ok(
      demoUsers.every((u) => !u.active),
      'demo accounts must be disabled in production',
    );

    const again = await client().request('/setup', {
      method: 'POST',
      body: {
        token,
        school: { name: 'دبیرستان دیگر', principal: 'مدیر دیگر', academic_year: '۱۴۰۶–۱۴۰۷' },
        admin: { username: 'admin2', password: 'VeryStrongPass!2345' },
      },
    });
    assert.equal(again.status, 409);

    const login = await client().request('/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'VeryStrongPass!2345' },
    });
    ok(login);
    assert.equal(login.data.user.role, 'admin');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
