import http from 'node:http';
import { supportedNode } from '../server/runtime.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/database.js';
import { seedDemo } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { featureDefs, moduleDefs, resourceDefs } from '../shared/catalog.js';
import { today, csv } from '../server/security.js';

async function fixture({ seed = true, demo = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'madresehyar-test-'));
  const db = await openDatabase({ dataDir: dir, memory: true });
  if (seed) seedDemo(db);
  const token = 'installer-only-test-token-1234567890';
  const server = createApp(db, { demo, installToken: token }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  function client() {
    return {
      cookie: '',
      csrf: '',
      async request(route, { method = 'GET', body, headers = {}, raw = false } = {}) {
        const isForm = body instanceof FormData;
        const response = await fetch(`${url}/api${route}`, {
          method,
          headers: {
            ...(this.cookie ? { Cookie: this.cookie } : {}),
            ...(this.csrf ? { 'X-CSRF-Token': this.csrf } : {}),
            ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
          },
          ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}),
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) this.cookie = setCookie.split(';')[0];
        const data = raw
          ? Buffer.from(await response.arrayBuffer())
          : await response.json().catch(() => null);
        if (data?.csrf) this.csrf = data.csrf;
        return { status: response.status, data, headers: response.headers };
      },
      async demo(role) {
        const result = await this.request('/auth/demo', { method: 'POST', body: { role } });
        assert.equal(result.status, 200);
        return this;
      },
    };
  }
  return {
    db,
    token,
    dir,
    server,
    client,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
let f, admin, teacher, student, parent;
before(async () => {
  f = await fixture();
  [admin, teacher, student, parent] = await Promise.all(
    ['admin', 'teacher', 'student', 'parent'].map((role) => f.client().demo(role)),
  );
});
after(async () => {
  await f.close();
});

test('registry exposes unique, implemented capabilities across every module', () => {
  assert.ok(featureDefs.length >= 100, 'the registry promises at least 100 capabilities');
  assert.equal(new Set(featureDefs.map((f) => f.id)).size, featureDefs.length);
  assert.ok(moduleDefs.length >= 16);
  assert.ok(Object.keys(resourceDefs).length >= 25);
  for (const def of Object.values(resourceDefs)) assert(def.fields.length > 0);
});

test('authentication is required and session cookies are HttpOnly', async () => {
  assert.equal((await f.client().request('/entities/students')).status, 401);
  const result = await f
    .client()
    .request('/auth/login', { method: 'POST', body: { username: 'missing', password: 'wrong' } });
  assert.equal(result.status, 401);
  const secure = await f.client().request('/auth/demo', {
    method: 'POST',
    body: { role: 'admin' },
    headers: { 'X-Forwarded-Proto': 'https' },
  });
  assert.match(secure.headers.get('set-cookie'), /HttpOnly/);
  assert.match(secure.headers.get('set-cookie'), /SameSite=Lax/);
  assert.match(secure.headers.get('set-cookie'), /Secure/);
});

test('demo dashboard contains live seeded data', async () => {
  const r = await admin.request('/dashboard');
  assert.equal(r.status, 200);
  assert.equal(r.data.stats.students, 240);
  assert.equal(r.data.stats.teachers, 18);
  assert.equal(r.data.stats.classes, 12);
  assert(r.data.chart.length >= 5);
  assert.equal(r.data.events.length, 4);
  assert.equal(r.data.students.length, 5);
});

test('teacher, student and parent scopes cannot expose other student records', async () => {
  assert.equal((await teacher.request('/entities/students')).data.total, 20);
  assert.equal((await student.request('/entities/students')).data.total, 1);
  assert.equal((await parent.request('/entities/students')).data.rows[0].id, 1);
  assert.equal((await student.request('/entities/students/2')).status, 403);
  assert.equal((await teacher.request('/students/21/profile')).status, 403);
  assert.equal((await parent.request('/attendance/student/2')).status, 403);
  assert.equal((await teacher.request('/entities/payroll')).data.total, 1);
  assert.equal((await student.request('/entities/expenses')).status, 403);
});

test('CSRF tokens and request origins are enforced on mutations', async () => {
  const clone = f.client();
  clone.cookie = admin.cookie;
  assert.equal(
    (await clone.request('/settings/school', { method: 'PATCH', body: {} })).status,
    403,
  );
  assert.equal(
    (
      await admin.request('/settings/school', {
        method: 'PATCH',
        body: {},
        headers: { Origin: 'https://attacker.example' },
      })
    ).status,
    403,
  );
});

test('roles cannot bypass write permissions or assigned-class restrictions', async () => {
  assert.equal(
    (
      await student.request('/entities/students/1', {
        method: 'PATCH',
        body: { first_name: 'ناامن' },
      })
    ).status,
    403,
  );
  assert.equal((await parent.request('/attendance', { method: 'POST', body: {} })).status, 403);
  const exam = { title: 'آزمون تست', class_id: 2, subject_id: 1, exam_date: today() };
  assert.equal(
    (await teacher.request('/entities/exams', { method: 'POST', body: exam })).status,
    403,
  );
  assert.equal((await student.request('/settings/accounts')).status, 403);
});

test('all 100 registry CRUD capabilities perform real list/create/edit/delete operations', async (t) => {
  // Disable automatic account generation for these isolated CRUD fixtures only.
  for (const id of ['students.account', 'teachers.account'])
    assert.equal(
      (
        await admin.request(`/settings/features/${id}`, {
          method: 'PATCH',
          body: { enabled: false },
        })
      ).status,
      200,
    );
  for (const [resource, def] of Object.entries(resourceDefs)) {
    await t.test(resource, async () => {
      const list = await admin.request(`/entities/${resource}`);
      assert.equal(list.status, 200);
      const sample = f.db.get(`SELECT * FROM "${resource}" ORDER BY id LIMIT 1`);
      const body = Object.fromEntries(def.fields.map((field) => [field.name, sample[field.name]]));
      for (const field of def.fields.filter((f) => f.unique))
        if (body[field.name])
          body[field.name] =
            field.pattern === 'national'
              ? resource === 'students'
                ? '1999999999'
                : '3999999999'
              : `TEST-${resource}-${field.name}`;
      if (resource === 'schedules')
        Object.assign(body, { day: '5', start_time: '14:00', end_time: '15:00', teacher_id: 18 });
      if (resource === 'payments')
        Object.assign(body, { invoice_id: 3, amount: 100000, reference: 'TEST-PAYMENT' });
      if (resource === 'terms') body.status = 'planned';
      const create = await admin.request(`/entities/${resource}`, { method: 'POST', body });
      assert.equal(create.status, 201, JSON.stringify(create.data));
      const id = create.data.row.id;
      const editable = def.fields.find(
        (f) => ['text', 'textarea'].includes(f.type) && !f.unique && f.name !== 'national_id',
      );
      const editBody = { [editable.name]: 'ویرایش آزمایشی' };
      const edit = await admin.request(`/entities/${resource}/${id}`, {
        method: 'PATCH',
        body: editBody,
      });
      assert.equal(edit.status, 200, JSON.stringify(edit.data));
      assert.equal(edit.data.row[editable.name], editBody[editable.name]);
      const remove = await admin.request(`/entities/${resource}/${id}`, {
        method: 'DELETE',
        body: {},
      });
      assert.equal(remove.status, 200, JSON.stringify(remove.data));
      assert.equal((await admin.request(`/entities/${resource}/${id}`)).status, 404);
    });
  }
  for (const id of ['students.account', 'teachers.account'])
    await admin.request(`/settings/features/${id}`, { method: 'PATCH', body: { enabled: true } });
});

test('module and feature switches block APIs without deleting data', async () => {
  await admin.request('/settings/features/students.create', {
    method: 'PATCH',
    body: { enabled: false },
  });
  assert.equal(
    (await admin.request('/entities/students', { method: 'POST', body: {} })).status,
    403,
  );
  assert.equal((await admin.request('/entities/students')).data.total, 240);
  await admin.request('/settings/features/students.create', {
    method: 'PATCH',
    body: { enabled: true },
  });
  await admin.request('/settings/modules/education', { method: 'PATCH', body: { enabled: false } });
  assert.equal((await student.request('/entities/grades')).status, 403);
  assert.equal(
    (await student.request('/assignments/1/submit', { method: 'POST', body: {} })).status,
    403,
  );
  await admin.request('/settings/modules/education', { method: 'PATCH', body: { enabled: true } });
  assert.equal((await student.request('/entities/grades')).data.total, 5);
  assert.equal(
    (
      await admin.request('/settings/modules/settings', {
        method: 'PATCH',
        body: { enabled: false },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await admin.request('/settings/features/settings.modules', {
        method: 'PATCH',
        body: { enabled: false },
      })
    ).status,
    409,
  );
});

test('validation rejects impossible dates, scores, capacity and duplicate identifiers', async () => {
  assert.equal(
    (
      await admin.request('/entities/students/1', {
        method: 'PATCH',
        body: { birth_date: '2026-02-31' },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await admin.request('/entities/grades/1', {
        method: 'PATCH',
        body: { score: 21, max_score: 20 },
      })
    ).status,
    422,
  );
  assert.equal(
    (await admin.request('/entities/classes/1', { method: 'PATCH', body: { capacity: 19 } }))
      .status,
    409,
  );
  assert.equal(
    (
      await admin.request('/entities/students/1', {
        method: 'PATCH',
        body: { national_id: '1000000001' },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await admin.request('/entities/students/1', {
        method: 'PATCH',
        body: { guardian_phone: '123' },
      })
    ).status,
    422,
  );
  assert.equal(
    (await admin.request('/entities/classes/1', { method: 'DELETE', body: {} })).status,
    409,
  );
  assert.equal(
    (
      await admin.request('/entities/schedules', {
        method: 'POST',
        body: {
          title: 'تداخل',
          class_id: 1,
          subject_id: 1,
          teacher_id: 1,
          day: '0',
          start_time: '08:15',
          end_time: '09:15',
        },
      })
    ).status,
    409,
  );
});

test('attendance batches are atomic, scoped, and notify student and parent', async () => {
  const old = f.db.get('SELECT * FROM attendance WHERE student_id=1 AND date=?', [today()]);
  const wrong = await teacher.request('/attendance', {
    method: 'POST',
    body: {
      class_id: 1,
      date: today(),
      records: [
        { student_id: 1, status: 'absent' },
        { student_id: 21, status: 'present' },
      ],
    },
  });
  assert.equal(wrong.status, 409);
  assert.equal(
    f.db.get('SELECT status FROM attendance WHERE student_id=1 AND date=?', [today()]).status,
    old.status,
  );
  const saved = await teacher.request('/attendance', {
    method: 'POST',
    body: {
      class_id: 1,
      date: today(),
      records: [{ student_id: 1, status: 'absent', note: 'تست اطلاع‌رسانی' }],
    },
  });
  assert.equal(saved.status, 200);
  assert.equal((await student.request('/attendance')).data.rows[0].status, 'absent');
  assert((await parent.request('/notifications')).data.some((n) => n.title === 'غیبت ثبت شد'));
  await admin.request('/settings/features/attendance.bulk', {
    method: 'PATCH',
    body: { enabled: false },
  });
  assert.equal(
    (
      await teacher.request('/attendance', {
        method: 'POST',
        body: {
          class_id: 1,
          date: today(),
          records: [
            { student_id: 1, status: 'present' },
            { student_id: 2, status: 'present' },
          ],
        },
      })
    ).status,
    403,
  );
  await admin.request('/settings/features/attendance.bulk', {
    method: 'PATCH',
    body: { enabled: true },
  });
  await teacher.request('/attendance', {
    method: 'POST',
    body: {
      class_id: 1,
      date: today(),
      records: [{ student_id: 1, status: old.status, note: old.note || '' }],
    },
  });
});

test('ticket recipients are restricted and private conversations stay private', async () => {
  const recipients = (await student.request('/tickets/recipients')).data;
  assert.equal(recipients.length, 2);
  const teacherId = teacher ? f.db.get("SELECT id FROM users WHERE username='teacher'").id : null;
  assert(recipients.some((r) => r.id === teacherId));
  const peer = f.db.get("SELECT id FROM users WHERE username='student2'").id;
  assert.equal(
    (
      await student.request('/tickets', {
        method: 'POST',
        body: { title: 'پیام غیرمجاز', recipient_id: peer, body: 'نباید ارسال شود' },
      })
    ).status,
    403,
  );
  const created = await student.request('/tickets', {
    method: 'POST',
    body: {
      title: 'پیگیری آموزشی تست',
      recipient_id: teacherId,
      body: 'سلام، لطفاً راهنمایی کنید.',
    },
  });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal((await parent.request(`/tickets/${id}`)).status, 403);
  assert.equal(
    (await student.request(`/tickets/${id}`, { method: 'PATCH', body: { status: 'resolved' } }))
      .status,
    403,
  );
  assert.equal(
    (
      await teacher.request(`/tickets/${id}/messages`, {
        method: 'POST',
        body: { body: 'حتماً، در کلاس بررسی می‌کنیم.' },
      })
    ).status,
    201,
  );
  assert.equal((await student.request(`/tickets/${id}`)).data.messages.length, 2);
  assert.equal(
    (await teacher.request(`/tickets/${id}`, { method: 'PATCH', body: { status: 'closed' } }))
      .status,
    200,
  );
  assert.equal(
    (
      await student.request(`/tickets/${id}/messages`, {
        method: 'POST',
        body: { body: 'پیام جدید' },
      })
    ).status,
    409,
  );
});

test('uploads validate types and are authorized at download time', async () => {
  const form = new FormData();
  form.append('file', new Blob(['private student note']), 'note.txt');
  const uploaded = await student.request('/files?context=tickets', { method: 'POST', body: form });
  assert.equal(uploaded.status, 201);
  const id = uploaded.data.id;
  assert.equal((await teacher.request(`/files/${id}`, { raw: true })).status, 403);
  const recipient = f.db.get("SELECT id FROM users WHERE username='teacher'").id;
  const ticket = await student.request('/tickets', {
    method: 'POST',
    body: {
      title: 'تیکت دارای پیوست',
      recipient_id: recipient,
      body: 'فایل خصوصی پیوست شده است.',
      file_id: id,
    },
  });
  assert.equal(ticket.status, 201);
  assert.equal((await teacher.request(`/files/${id}`, { raw: true })).status, 200);
  assert.equal((await parent.request(`/files/${id}`, { raw: true })).status, 403);
  const fake = new FormData();
  fake.append('file', new Blob(['not a pdf']), 'fake.pdf');
  assert.equal(
    (await student.request('/files?context=tickets', { method: 'POST', body: fake })).status,
    422,
  );
  const script = new FormData();
  script.append('file', new Blob(['alert(1)']), 'script.js');
  assert.equal(
    (await student.request('/files?context=tickets', { method: 'POST', body: script })).status,
    422,
  );
  const huge = new FormData();
  huge.append('file', new Blob([Buffer.alloc(6 * 1024 * 1024, 65)]), 'huge.txt');
  assert.equal(
    (await student.request('/files?context=tickets', { method: 'POST', body: huge })).status,
    413,
  );
});

test('assignment submission and review use scoped identities', async () => {
  assert.equal(
    (await student.request('/assignments/2/submit', { method: 'POST', body: { body: 'پاسخ' } }))
      .status,
    403,
  );
  assert.equal(
    (
      await student.request('/assignments/1/submit', {
        method: 'POST',
        body: { body: 'پاسخ جدید به تمرین' },
      })
    ).status,
    200,
  );
  const rows = (await teacher.request('/assignments/1/submissions')).data;
  const submission = rows.find((r) => r.student_id === 1);
  assert(submission);
  assert.equal(
    (
      await student.request(`/assignments/1/submissions/${submission.id}`, {
        method: 'PATCH',
        body: { score: 20 },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await teacher.request(`/assignments/1/submissions/${submission.id}`, {
        method: 'PATCH',
        body: { score: 19, feedback: 'آفرین!' },
      })
    ).status,
    200,
  );
  assert.equal((await student.request('/assignments/1/submissions')).data[0].score, 19);
});

test('financial receipts recalculate balances and reject overpayment', async () => {
  const before = f.db.get('SELECT * FROM invoices WHERE id=3');
  const payment = await admin.request('/entities/payments', {
    method: 'POST',
    body: {
      invoice_id: 3,
      amount: 500000,
      payment_date: today(),
      method: 'transfer',
      reference: 'FINANCE-TEST',
    },
  });
  assert.equal(payment.status, 201);
  const invoice = (await admin.request('/entities/invoices/3')).data;
  assert.equal(invoice.paid_amount, before.paid_amount + 500000);
  assert.equal(invoice.status, 'partial');
  assert.equal(
    (
      await admin.request('/entities/payments', {
        method: 'POST',
        body: {
          invoice_id: 3,
          amount: 15000000,
          payment_date: today(),
          method: 'cash',
          reference: 'OVERPAY',
        },
      })
    ).status,
    422,
  );
  assert.equal(
    (await admin.request('/entities/invoices/3', { method: 'PATCH', body: { amount: 100 } }))
      .status,
    422,
  );
  assert.equal((await student.request(`/entities/payments/${payment.data.row.id}`)).status, 403);
  await admin.request(`/entities/payments/${payment.data.row.id}`, { method: 'DELETE', body: {} });
  assert.equal((await admin.request('/entities/invoices/3')).data.paid_amount, before.paid_amount);
});

test('library inventory and returns enforce available copies', async () => {
  const active = f.db.get('SELECT COUNT(*) n FROM loans WHERE book_id=2 AND return_date IS NULL').n;
  assert.equal(
    (
      await admin.request('/entities/books/2', {
        method: 'PATCH',
        body: { copies: Math.max(1, active - 1) },
      })
    ).status,
    409,
  );
  const loan = f.db.get('SELECT * FROM loans WHERE book_id=2 AND return_date IS NULL LIMIT 1');
  assert.equal(
    (
      await admin.request(`/entities/loans/${loan.id}`, {
        method: 'PATCH',
        body: { return_date: '2000-01-01' },
      })
    ).status,
    422,
  );
});

test('CSV import is atomic and CSV export escapes spreadsheet formulas', async () => {
  const count = f.db.get('SELECT COUNT(*) n FROM students').n;
  const bad = new FormData();
  bad.append(
    'file',
    new Blob([
      'first_name,last_name,class_id,guardian_name,guardian_phone\r\nسینا,تست,1,ولی,09129999999\r\nسینا,تست,99999,ولی,09129999999',
    ]),
    'bad.csv',
  );
  assert.equal(
    (await admin.request('/entities/students/import', { method: 'POST', body: bad })).status,
    422,
  );
  assert.equal(f.db.get('SELECT COUNT(*) n FROM students').n, count);
  const text = csv(
    [{ a: '=HYPERLINK("malicious")', b: '@SUM(1)', c: 'normal' }],
    [
      { key: 'a', label: 'نام' },
      { key: 'b', label: 'کد' },
      { key: 'c', label: 'سالم' },
    ],
  );
  assert(text.includes("'=HYPERLINK"));
  assert(text.includes("'@SUM"));
  assert(text.startsWith('\uFEFF'));
  const exportFile = await admin.request('/entities/students/export', { raw: true });
  assert.equal(exportFile.status, 200);
  assert.match(exportFile.headers.get('content-type'), /text\/csv/);
  assert(exportFile.data.length > 1000);
});

test('new student accounts require password rotation; old sessions are revoked', async () => {
  const created = await admin.request('/entities/students', {
    method: 'POST',
    body: {
      first_name: 'سینا',
      last_name: 'تست حساب',
      national_id: '1987654321',
      class_id: 1,
      guardian_name: 'ولی تست',
      guardian_phone: '09129999999',
    },
  });
  assert.equal(created.status, 201);
  assert(created.data.account.temporary_password.length >= 10);
  const account = created.data.account,
    newcomer = f.client();
  const login = await newcomer.request('/auth/login', {
    method: 'POST',
    body: { username: account.username, password: account.temporary_password },
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.must_change_password, true);
  assert.equal((await newcomer.request('/entities/students')).status, 428);
  const oldCookie = newcomer.cookie;
  const changed = await newcomer.request('/auth/password', {
    method: 'POST',
    body: { current_password: account.temporary_password, new_password: 'MyNewSecurePass123!' },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.user.must_change_password, false);
  assert.equal((await newcomer.request('/entities/students')).data.total, 1);
  const stale = f.client();
  stale.cookie = oldCookie;
  assert.equal((await stale.request('/entities/students')).status, 401);
  const reset = await admin.request(`/settings/accounts/${changed.data.user.id}/reset-password`, {
    method: 'POST',
    body: {},
  });
  assert.equal(reset.status, 200);
  assert(reset.data.temporary_password);
  assert.equal((await newcomer.request('/entities/students')).status, 401);
});

test('a real parent account is linked to the selected child, not all students', async () => {
  const result = await admin.request('/settings/accounts', {
    method: 'POST',
    body: { username: 'test_parent', full_name: 'ولی آزمایشی', role: 'parent', student_id: 2 },
  });
  assert.equal(result.status, 201);
  const user = f.client();
  await user.request('/auth/login', {
    method: 'POST',
    body: { username: result.data.username, password: result.data.temporary_password },
  });
  assert.equal(
    (
      await user.request('/auth/password', {
        method: 'POST',
        body: {
          current_password: result.data.temporary_password,
          new_password: 'ParentNewSecurePass!',
        },
      })
    ).status,
    200,
  );
  const children = (await user.request('/entities/students')).data;
  assert.equal(children.total, 1);
  assert.equal(children.rows[0].id, 2);
  assert.equal((await user.request('/students/1/profile')).status, 403);
});

test('notifications, reports, calendar and global search return scoped data', async () => {
  const search = await student.request('/search?q=آراد');
  assert(
    search.data.filter((x) => x.id.startsWith('students')).every((x) => x.id === 'students-1'),
  );
  assert.equal((await student.request('/reports')).data.classes.length, 1);
  assert.equal((await teacher.request('/reports')).data.finance, null);
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 60);
  assert.equal(
    (await admin.request(`/calendar?from=${today()}&to=${future.toISOString().slice(0, 10)}`))
      .status,
    200,
  );
  assert.equal((await admin.request('/reports/export', { raw: true })).status, 200);
  assert.equal(
    (await student.request('/notifications/read', { method: 'PATCH', body: {} })).status,
    200,
  );
  assert((await student.request('/notifications')).data.every((x) => x.is_read));
});

test('backup is actual SQLite, admin-only, and preserves foreign-key enforcement', async () => {
  const backup = await admin.request('/settings/backup', { raw: true });
  assert.equal(backup.status, 200);
  assert.equal(backup.data.subarray(0, 15).toString(), 'SQLite format 3');
  assert.equal(f.db.get('PRAGMA foreign_keys').foreign_keys, 1);
  assert.equal((await student.request('/settings/backup', { raw: true })).status, 403);
  assert.equal(
    (await admin.request('/entities/classes/1', { method: 'DELETE', body: {} })).status,
    409,
  );
});

test('initial installation is token-protected, atomic, and one-time', async () => {
  const empty = await fixture({ seed: false, demo: false });
  try {
    const client = empty.client();
    const body = {
      token: 'wrong',
      school: { name: 'مدرسه تست', principal: 'مدیر تست', academic_year: '۱۴۰۵–۱۴۰۶' },
      admin: { username: 'principal', password: 'InstallSecurePass123' },
      demo_data: true,
    };
    assert.equal((await client.request('/setup', { method: 'POST', body })).status, 403);
    assert.equal(empty.db.get('SELECT COUNT(*) n FROM users').n, 0);
    const installed = await client.request('/setup', {
      method: 'POST',
      body: { ...body, token: empty.token },
    });
    assert.equal(installed.status, 201);
    assert.equal(empty.db.setting('school').name, 'مدرسه تست');
    assert.equal(
      empty.db.get("SELECT COUNT(*) n FROM users WHERE role!='admin' AND active=1").n,
      0,
    );
    assert.equal(
      (
        await empty.client().request('/auth/login', {
          method: 'POST',
          body: { username: 'student', password: 'School@1405' },
        })
      ).status,
      401,
    );
    assert.equal(
      (await client.request('/setup', { method: 'POST', body: { ...body, token: empty.token } }))
        .status,
      409,
    );
    assert.equal(
      (await client.request('/auth/demo', { method: 'POST', body: { role: 'admin' } })).status,
      404,
    );
  } finally {
    await empty.close();
  }
});

test('durable storage keeps FK enforcement after export and prevents concurrent writers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'madresehyar-disk-test-'));
  let disk;
  try {
    disk = await openDatabase({ dataDir: dir });
    disk.setSetting('durable', { value: 'محفوظ' });
    assert.equal(disk.get('PRAGMA foreign_keys').foreign_keys, 1);
    await assert.rejects(openDatabase({ dataDir: dir }), /Another process/);
    const bytes = disk.export();
    assert(bytes.length > 1000);
    assert.equal(disk.get('PRAGMA foreign_keys').foreign_keys, 1);
    disk.close();
    disk = await openDatabase({ dataDir: dir });
    assert.equal(disk.setting('durable').value, 'محفوظ');
    disk.transaction(() => {
      disk.setSetting('after_transaction', true);
    });
    assert.equal(disk.get('PRAGMA foreign_keys').foreign_keys, 1);
    assert.throws(() =>
      disk.transaction(() => {
        disk.setSetting('rollback', true);
        throw new Error('rollback');
      }),
    );
    assert.equal(disk.setting('rollback'), null);
  } finally {
    disk?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runtime engine constraint matches Node 20.19 or 22.12+', () => {
  for (const version of ['20.19.0', '20.22.1', '22.12.0', '24.0.0']) assert(supportedNode(version));
  for (const version of ['18.20.0', '20.18.1', '21.7.0', '22.11.0'])
    assert(!supportedNode(version));
});

test('installer safely handles administrator names reserved by sample roles', async () => {
  for (const username of ['TEACHER', 'student', 'parent']) {
    const fresh = await fixture({ seed: false, demo: false });
    try {
      const client = fresh.client();
      const result = await client.request('/setup', {
        method: 'POST',
        body: {
          token: fresh.token,
          school: { name: 'مدرسه آزمون', principal: 'مدیر آزمون', academic_year: '۱۴۰۵–۱۴۰۶' },
          admin: { username, password: 'ReservedSafePass123!' },
          demo_data: true,
        },
      });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      assert.equal(
        fresh.db.get('SELECT role FROM users WHERE username=?', [username]).role,
        'admin',
      );
      assert.equal(
        fresh.db.get("SELECT COUNT(*) n FROM users WHERE role!='admin' AND active=1").n,
        0,
      );
      assert.equal(fresh.db.setting('demo_seeded'), false);
      assert.equal((await client.request('/auth/me')).data.demo, false);
      assert.equal(fresh.db.get('SELECT COUNT(*) n FROM teachers').n, 18);
    } finally {
      await fresh.close();
    }
  }
});

test('unknown resource and demo role prototypes are rejected without 500 errors', async () => {
  assert.equal((await admin.request('/entities/constructor')).status, 404);
  assert.equal((await admin.request('/entities/__proto__')).status, 404);
  assert.equal(
    (await f.client().request('/auth/demo', { method: 'POST', body: { role: '__proto__' } }))
      .status,
    422,
  );
});

test('Persian attachment names survive multipart decoding and private download', async () => {
  const form = new FormData();
  form.append('file', new Blob(['گواهی نمونه'], { type: 'text/plain' }), 'گواهی-آزمایشی.txt');
  const file = await student.request('/files?context=tickets', { method: 'POST', body: form });
  assert.equal(file.status, 201);
  assert.equal(file.data.name, 'گواهی-آزمایشی.txt');
  const get = await student.request(`/files/${file.data.id}`, { raw: true });
  assert.equal(get.data.toString(), 'گواهی نمونه');
  assert.match(get.headers.get('content-disposition'), /filename\*=UTF-8''/i);
});

test('failed login budget is isolated per account on a shared school IP', async () => {
  const client = f.client();
  for (let i = 0; i < 12; i++)
    assert.equal(
      (
        await client.request('/auth/login', {
          method: 'POST',
          body: { username: 'unknown-rate-account', password: 'WrongPassword' },
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await client.request('/auth/login', {
        method: 'POST',
        body: { username: 'unknown-rate-account', password: 'WrongPassword' },
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await client.request('/auth/login', {
        method: 'POST',
        body: { username: 'other-rate-account', password: 'WrongPassword' },
      })
    ).status,
    401,
  );
});

test('HTTPS iframe preview uses partitioned cookies and a matching logout cookie', async () => {
  const previewHost = '3000-test-preview.e2b.app';
  const request = (route, body, extra = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        `http://127.0.0.1:${f.server.address().port}/api${route}`,
        {
          method: 'POST',
          headers: {
            Host: previewHost,
            Origin: `https://${previewHost}`,
            'X-Forwarded-Proto': 'https',
            'Content-Type': 'application/json',
            ...extra,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              cookie: (res.headers['set-cookie'] || []).join(';'),
              data: JSON.parse(data),
            }),
          );
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify(body));
    });
  const result = await request('/auth/demo', { role: 'admin' });
  assert.equal(result.status, 200);
  assert.match(result.cookie, /SameSite=None/);
  assert.match(result.cookie, /Partitioned/);
  assert.match(result.cookie, /Secure/);
  const logout = await request(
    '/auth/logout',
    {},
    { Cookie: result.cookie.split(';')[0], 'X-CSRF-Token': result.data.csrf },
  );
  assert.equal(logout.status, 200);
  assert.match(logout.cookie, /Partitioned/);
  const ordinary = await f
    .client()
    .request('/auth/demo', { method: 'POST', body: { role: 'admin' } });
  assert.match(ordinary.headers.get('set-cookie'), /SameSite=Lax/);
  assert(!ordinary.headers.get('set-cookie').includes('Partitioned'));
});

test('multiple teachers can be assigned through timetable while private staff fields remain scoped', async () => {
  const schedule = await admin.request('/entities/schedules', {
    method: 'POST',
    body: {
      title: 'آزمون تخصیص دبیر دوم',
      class_id: 1,
      subject_id: 2,
      teacher_id: 2,
      day: '0',
      start_time: '14:00',
      end_time: '14:45',
      room: '۱۰۱',
    },
  });
  assert.equal(schedule.status, 201, JSON.stringify(schedule.data));
  const secondTeacher = f.client();
  assert.equal(
    (
      await secondTeacher.request('/auth/login', {
        method: 'POST',
        body: { username: 'teacher2', password: 'School@1405' },
      })
    ).status,
    200,
  );
  assert.equal(
    (await secondTeacher.request('/entities/students')).data.total,
    f.db.get('SELECT COUNT(*) n FROM students WHERE class_id IN (1,2)').n,
  );
  assert.equal((await secondTeacher.request('/entities/teachers')).data.total, 1);
  const lookups = (await parent.request('/lookups')).data;
  assert.deepEqual(
    lookups.teachers.map((t) => t.id),
    [1, 2],
  );
  assert(!lookups.teachers[1].phone);
  assert(!lookups.teachers[1].national_id);
  assert.equal((await parent.request('/entities/teachers/2')).status, 403);
  assert.equal((await parent.request('/dashboard')).data.stats.teachers, 2);
  const recipients = (await student.request('/tickets/recipients')).data;
  assert(recipients.some((u) => u.full_name === lookups.teachers[1].label));
});

test('compiled SPA can be served from a hidden application directory without exposing dotfiles', async () => {
  const staticDir = path.join(f.dir, '.hidden-app', 'dist');
  fs.mkdirSync(staticDir, { recursive: true });
  fs.writeFileSync(
    path.join(staticDir, 'index.html'),
    '<!doctype html><title>Hidden-root school test</title>',
  );
  fs.writeFileSync(path.join(staticDir, '.env'), 'DO_NOT_EXPOSE_THIS_PRIVATE_MARKER');
  const server = createApp(f.db, { staticDir }).listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/', '/students', '/install']) {
      const result = await fetch(base + route);
      assert.equal(result.status, 200);
      assert((await result.text()).includes('Hidden-root school test'));
    }
    const denied = await fetch(base + '/.env');
    assert(!(await denied.text()).includes('DO_NOT_EXPOSE_THIS_PRIVATE_MARKER'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
