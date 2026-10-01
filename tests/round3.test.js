import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { auditFixture } from './helpers.js';
import { addDateDays } from '../shared/dates.js';
import { buildXlsx, sheetsFromRows } from '../shared/xlsx.js';
import {
  formatJalali,
  toJalali,
  toGregorian,
  daysInMonth,
  isLeapJalaali,
  jalaliWeekdayIndex,
} from '../shared/jalali.js';

let f;
let admin;
let teacher;
let parent;
let student;
before(async () => {
  f = await auditFixture();
  admin = await f.client().login('admin');
  teacher = await f.client().login('teacher');
  parent = await f.client().login('parent');
  student = await f.client().login('student');
});
after(async () => f.close());
beforeEach(() => {
  // Every scenario starts from an unfiltered, fully enabled installation.
  return admin.request('/settings/features/exports.xlsx', {
    method: 'PATCH',
    body: { enabled: true },
  });
});

const today = () => new Date().toISOString().slice(0, 10);

test('jalali: conversion round-trips across four thousand days', () => {
  const start = Date.parse('2020-01-01');
  for (let i = 0; i < 4000; i += 1) {
    const iso = new Date(start + i * 86400000).toISOString().slice(0, 10);
    const { jy, jm, jd } = toJalali(iso);
    assert.equal(toGregorian(jy, jm, jd), iso, `round-trip failed for ${iso}`);
  }
  assert.deepEqual(toJalali('2026-03-21'), { jy: 1405, jm: 1, jd: 1 });
  assert.equal(isLeapJalaali(1403), true);
  assert.equal(isLeapJalaali(1408), true);
  assert.equal(daysInMonth(1403, 12), 30);
  assert.equal(daysInMonth(1404, 12), 29);
  assert.match(formatJalali('2026-03-21'), /1405/);
  assert.equal(jalaliWeekdayIndex('2026-03-21'), 0, 'شنبه ابتدای هفته ایرانی است');
});

test('xlsx: exports are real zip workbooks with Persian headers', () => {
  const buffer = buildXlsx(
    sheetsFromRows(
      [
        { key: 'name', label: 'نام' },
        { key: 'score', label: 'نمره' },
      ],
      [
        { name: 'آراد', score: 19.5 },
        { name: '=HYPERLINK("http://x")', score: 20 },
      ],
      'کارنامه',
    ),
  );
  const files = unzipSync(new Uint8Array(buffer));
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /نام/);
  assert.match(sheet, /19\.5/);
  // Formula injection is neutralised instead of executed by the spreadsheet app.
  assert.doesNotMatch(sheet, /<f>HYPERLINK/);
});

test('finance: discounts, installments, late fees and the debtor report add up', async () => {
  const created = await admin.request('/entities/invoices', {
    method: 'POST',
    body: {
      title: 'شهریه آزمایشی',
      student_id: 1,
      amount: 12000000,
      discount: 2000000,
      discount_reason: 'تخفیف آزمایشی',
      due_date: addDateDays(today(), -40),
      term: '۱۴۰۵–۱۴۰۶',
      status: 'unpaid',
      paid_amount: 0,
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const invoice = created.data.row;
  assert.equal(invoice.net_amount, 10000000, 'قابل پرداخت باید پس از تخفیف محاسبه شود');
  assert.equal(invoice.remaining, 10000000);

  const finance = await admin.request('/finance/settings', {
    method: 'PATCH',
    body: { grace_days: 30, late_fee_percent: 2 },
  });
  assert.equal(finance.status, 200, JSON.stringify(finance.data));
  const late = await admin.request(`/finance/invoices/${invoice.id}/late-fee`, {
    method: 'POST',
    body: {},
  });
  assert.equal(late.status, 200, JSON.stringify(late.data));
  assert.equal(late.data.amount, 200000, '۲٪ مانده به‌عنوان جریمه دیرکرد');
  const reread = await admin.request(`/entities/invoices/${invoice.id}`);
  assert.equal(reread.data.net_amount, 10200000);
  assert.equal(reread.data.remaining, 10200000);

  const split = await admin.request('/finance/installments', {
    method: 'POST',
    body: {
      student_id: 2,
      title: 'شهریه اقساطی',
      amount: 9000000,
      count: 3,
      first_due: today(),
      interval_days: 30,
    },
  });
  assert.equal(split.status, 201, JSON.stringify(split.data));
  assert.equal(split.data.invoices.length, 3);
  assert.equal(
    split.data.invoices.reduce((sum, row) => sum + row.amount, 0),
    9000000,
  );

  const debtors = await admin.request('/finance/debtors');
  assert.equal(debtors.status, 200, JSON.stringify(debtors.data));
  assert.ok(debtors.data.rows.some((row) => row.student_id === 1));
  assert.ok(debtors.data.totals.remaining > 0);
  const xlsx = await admin.request('/finance/debtors?format=xlsx', { raw: true });
  assert.equal(xlsx.status, 200);
  assert.equal(xlsx.data.subarray(0, 2).toString(), 'PK');
});

test('leaves: a family request is approved and written into attendance', async () => {
  // Pick an eligible day that has no attendance record yet for this student.
  const from = addDateDays(today(), -21);
  assert.equal(
    f.db.get('SELECT id FROM attendance WHERE student_id=1 AND date=?', [from]),
    undefined,
  );
  const submit = await parent.request('/leaves', {
    method: 'POST',
    body: { type: 'sick', from_date: from, to_date: from, reason: 'مراجعه به پزشک متخصص' },
  });
  assert.equal(submit.status, 201, JSON.stringify(submit.data));
  const duplicate = await parent.request('/leaves', {
    method: 'POST',
    body: { type: 'sick', from_date: from, to_date: from, reason: 'تکرار همان بازه' },
  });
  assert.equal(duplicate.status, 409, 'درخواست تکراری بازه نباید ثبت شود');

  const pending = await admin.request('/leaves?status=pending');
  assert.ok(pending.data.rows.some((row) => row.id === submit.data.id));
  const decision = await admin.request(`/leaves/${submit.data.id}/decision`, {
    method: 'PATCH',
    body: { status: 'approved', decision_note: 'تأیید شد' },
  });
  assert.equal(decision.status, 200, JSON.stringify(decision.data));
  const attendance = f.db.get(
    "SELECT * FROM attendance WHERE student_id=1 AND date=? AND status='excused'",
    [from],
  );
  assert.ok(attendance, 'تأیید مرخصی باید حضور موجه ثبت کند');
  assert.equal(decision.data.marked_days, 1);
  // Students only ever see their own requests.
  const own = await student.request('/leaves');
  assert.ok(own.data.rows.every((row) => row.student_id === 1));
});

test('meetings: slot booking respects capacity and isolates other classes', async () => {
  const slot = await admin.request('/meetings/slots', {
    method: 'POST',
    body: {
      title: 'جلسه آزمایشی',
      event_date: addDateDays(today(), 7),
      start_time: '16:00',
      end_time: '17:00',
      teacher_id: 1,
      class_id: 1,
      capacity: 1,
    },
  });
  assert.equal(slot.status, 201, JSON.stringify(slot.data));
  const slotId = slot.data.id;
  const booking = await admin.request('/meetings/book', {
    method: 'POST',
    body: { slot_id: slotId, student_id: 1, parent_name: 'ولی نمونه', question: 'وضعیت درسی' },
  });
  assert.equal(booking.status, 201, JSON.stringify(booking.data));
  const full = await admin.request('/meetings/book', {
    method: 'POST',
    body: { slot_id: slotId, student_id: 2, parent_name: 'ولی دوم' },
  });
  assert.equal(full.status, 409, 'ظرفیت تکمیل‌شده نباید نوبت جدید بگیرد');
  const outsider = await admin.request('/meetings/book', {
    method: 'POST',
    body: { slot_id: slotId, student_id: 21, parent_name: 'کلاس دیگر' },
  });
  assert.equal(outsider.status, 403, 'دانش‌آموز خارج از کلاس این بازه پذیرفته نشود');
  const cancel = await admin.request(`/meetings/bookings/${booking.data.id}`, {
    method: 'PATCH',
    body: { status: 'cancelled' },
  });
  assert.equal(cancel.status, 200);
  const list = await teacher.request('/meetings/bookings');
  assert.equal(list.status, 200);
});

test('library: renewals are blocked by the reservation queue and returns charge fines', async () => {
  const config = await admin
    .request('/library/settings', {
      method: 'PATCH',
      body: { daily_fine: 2000, due_days: 14, max_renewals: 1 },
    })
    .catch(() => null);
  if (config) assert.ok([200, 404].includes(config.status));

  const loan = f.db.get(
    "SELECT * FROM loans WHERE return_date IS NULL AND book_id NOT IN (SELECT book_id FROM reservations WHERE status IN ('waiting','ready')) ORDER BY id LIMIT 1",
  );
  assert.ok(loan, 'برای سناریوی تمدید به امانت بدون نوبت نیاز است');
  f.db.run('UPDATE loans SET due_date=?, renewals=0 WHERE id=?', [
    addDateDays(today(), -10),
    loan.id,
  ]);
  const overdue = await admin.request('/library/overdue');
  assert.equal(overdue.status, 200, JSON.stringify(overdue.data));
  assert.ok(overdue.data.rows.some((row) => row.id === loan.id));

  const first = await admin.request(`/library/loans/${loan.id}/renew`, { method: 'POST' });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.renewals, 1);
  const second = await admin.request(`/library/loans/${loan.id}/renew`, { method: 'POST' });
  assert.equal(second.status, 409, 'سقف تمدید باید رعایت شود');

  const reserved = f.db.get(
    'SELECT * FROM loans WHERE return_date IS NULL ORDER BY id DESC LIMIT 1',
  );
  await admin.request('/library/reservations', {
    method: 'POST',
    body: { book_id: reserved.book_id, student_id: reserved.student_id === 1 ? 2 : 1 },
  });
  const blocked = await admin.request(`/library/loans/${reserved.id}/renew`, { method: 'POST' });
  assert.equal(blocked.status, 409, 'با وجود نوبت‌دهنده، تمدید مجاز نیست');

  f.db.run('UPDATE loans SET due_date=? WHERE id=?', [addDateDays(today(), -10), loan.id]);
  const returned = await admin.request(`/library/loans/${loan.id}/return`, {
    method: 'POST',
    body: { fine_paid: false },
  });
  assert.equal(returned.status, 200, JSON.stringify(returned.data));
  assert.ok(returned.data.fine > 0, 'بازگشت با تأخیر باید جریمه داشته باشد');
  const settle = await admin.request(`/library/loans/${loan.id}/fine`, {
    method: 'POST',
    body: { paid: true },
  });
  assert.equal(settle.status, 200);
});

test('analysis: report card, trend, ministerial export and promotion archive', async () => {
  const card = await admin.request('/analysis/report-card/1');
  assert.equal(card.status, 200, JSON.stringify(card.data));
  assert.ok(Array.isArray(card.data.subjects));
  assert.ok(card.data.student.name);
  const trend = await admin.request('/analysis/trend/1');
  assert.equal(trend.status, 200, JSON.stringify(trend.data));
  assert.ok(Array.isArray(trend.data.trend));
  const csv = await admin.request('/analysis/ministerial?type=students&format=csv', { raw: true });
  assert.equal(csv.status, 200);
  assert.match(csv.data.toString('utf8'), /کد ملی/);
  const xlsx = await admin.request('/analysis/ministerial?type=grades&format=xlsx', { raw: true });
  assert.equal(xlsx.data.subarray(0, 2).toString(), 'PK');

  const preview = await admin.request('/analysis/promotion/preview');
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.ok(preview.data.classes.length > 0);
  const studentRow = f.db.get(
    "SELECT * FROM students WHERE class_id=1 AND status='active' LIMIT 1",
  );
  const apply = await admin.request('/analysis/promotion/apply', {
    method: 'POST',
    body: {
      term: '۱۴۰۵–۱۴۰۶',
      decisions: [{ student_id: studentRow.id, action: 'promoted' }],
    },
  });
  assert.equal(apply.status, 200, JSON.stringify(apply.data));
  assert.equal(apply.data.summary.promoted, 1);
  const archived = f.db.get('SELECT * FROM student_years WHERE student_id=?', [studentRow.id]);
  assert.equal(archived.status, 'promoted');
  assert.notEqual(
    f.db.get('SELECT class_id FROM students WHERE id=?', [studentRow.id]).class_id,
    studentRow.class_id,
    'ارتقا باید دانش‌آموز را به پایه بعد ببرد',
  );
});

test('bulk: grades and row operations are applied per record with a failure report', async () => {
  const students = f.db.all("SELECT id FROM students WHERE class_id=1 AND status='active' LIMIT 5");
  const graded = await teacher.request('/assignments/grades/bulk', {
    method: 'POST',
    body: {
      class_id: 1,
      subject_id: 1,
      title: 'ارزشیابی گروهی آزمایشی',
      max_score: 20,
      coefficient: 1,
      scores: students.map((row, index) => ({ student_id: row.id, score: 15 + index })),
    },
  });
  assert.equal(graded.status, 201, JSON.stringify(graded.data));
  assert.ok(graded.data.created + graded.data.updated === students.length);

  const existing = f.db.all('SELECT id,title FROM events ORDER BY id LIMIT 2');
  const bulk = await admin.request('/entities/events/bulk', {
    method: 'POST',
    body: { action: 'update', ids: existing.map((row) => row.id), patch: { location: 'سالن ۲' } },
  });
  assert.equal(bulk.status, 200, JSON.stringify(bulk.data));
  assert.equal(bulk.data.ok.length, 2);
  const missing = await admin.request('/entities/events/bulk', {
    method: 'POST',
    body: { action: 'delete', ids: [999999] },
  });
  assert.equal(missing.status, 200);
  assert.equal(missing.data.failed.length, 1);
});

test('sorting and xlsx export work for every listed resource', async () => {
  const sorted = await admin.request('/entities/students?sort=last_name&dir=desc&page=1');
  assert.equal(sorted.status, 200);
  const names = sorted.data.rows.map((row) => row.last_name);
  assert.deepEqual([...names].sort().reverse().slice(0, names.length), names);
  const bad = await admin.request('/entities/students?sort=password_hash');
  assert.equal(bad.status, 422, 'ستون ناشناخته نباید به SQL راه یابد');

  const csv = await admin.request('/entities/students/export?format=csv', { raw: true });
  assert.equal(csv.status, 200);
  const xlsx = await admin.request('/entities/students/export?format=xlsx', { raw: true });
  assert.equal(xlsx.status, 200);
  assert.equal(xlsx.data.subarray(0, 2).toString(), 'PK');
  assert.match(
    xlsx.headers.get('content-disposition') || '',
    /\.xlsx/,
    'نام فایل خروجی باید xlsx باشد',
  );
});

test('my-day tells the principal which classes still owe attendance', async () => {
  const day = await admin.request('/analysis/my-day');
  assert.equal(day.status, 200, JSON.stringify(day.data));
  assert.equal(day.data.classes.length, 12);
  assert.ok(day.data.admin && typeof day.data.admin.missing_attendance === 'number');
  const target = day.data.classes[0];
  assert.ok(target.students > 0);
  const roster = f.db.all("SELECT id FROM students WHERE class_id=? AND status='active'", [
    target.class_id,
  ]);
  const batch = await teacher.request('/attendance', {
    method: 'POST',
    body: {
      class_id: target.class_id,
      date: today(),
      records: roster.map((row) => ({ student_id: row.id, status: 'present' })),
    },
  });
  assert.ok([200, 201].includes(batch.status), JSON.stringify(batch.data));
  const after = await admin.request('/analysis/my-day');
  const updated = after.data.classes.find((row) => row.class_id === target.class_id);
  assert.ok(updated.recorded >= roster.length, 'همهٔ دانش‌آموزان کلاس ثبت شده‌اند');
  assert.equal(updated.missing, false);
});

test('support: anyone can report a fault, only the principal reads the queue', async () => {
  const anonymous = f.client();
  const report = await anonymous.request('/support/report', {
    method: 'POST',
    body: { message: 'دکمه ثبت نمره پاسخ نمی‌دهد', url: '/education', stack: 'TypeError: x' },
  });
  assert.equal(report.status, 201, JSON.stringify(report.data));
  assert.match(report.data.code, /^ER-[A-Z0-9]{6}$/);
  const queue = await admin.request('/support/reports?status=new');
  assert.equal(queue.status, 200);
  assert.ok(queue.data.rows.some((row) => row.code === report.data.code));
  const denied = await student.request('/support/reports');
  assert.equal(denied.status, 403, 'دانش‌آموز نباید گزارش‌های خطا را ببیند');
  const reportId = f.db.get('SELECT id FROM error_reports WHERE code=?', [report.data.code]).id;
  const resolved = await admin.request(`/support/reports/${reportId}`, {
    method: 'PATCH',
    body: { status: 'resolved', note: 'بررسی و اصلاح شد' },
  });
  assert.equal(resolved.status, 200);
});

test('status page and messaging bridge queue real SMS/email copies', async () => {
  const status = await admin.request('/status');
  assert.equal(status.status, 200, JSON.stringify(status.data));
  assert.ok(status.data.capabilities >= 100);
  assert.ok(status.data.checks.length >= 4);
  assert.ok(status.data.checks.every((check) => check.ok === true));

  const messaging = await admin.request('/settings/messaging');
  assert.equal(messaging.status, 200);
  const saved = await admin.request('/settings/messaging', {
    method: 'PATCH',
    body: {
      ...messaging.data,
      enabled: true,
      sms: { ...messaging.data.sms, enabled: true, provider: 'console' },
      events: { ...messaging.data.events, absence: true, invoice: true },
    },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const test = await admin.request('/settings/messaging/test', {
    method: 'POST',
    body: { channel: 'sms' },
  });
  assert.equal(test.status, 200, JSON.stringify(test.data));

  const before = f.db.get("SELECT COUNT(*) n FROM outbox WHERE channel='sms'").n;
  const roster = f.db.all("SELECT id FROM students WHERE class_id=2 AND status='active' LIMIT 3");
  const batch = await admin.request('/attendance', {
    method: 'POST',
    body: {
      class_id: 2,
      date: today(),
      records: roster.map((row, index) => ({
        student_id: row.id,
        status: index === 0 ? 'absent' : 'present',
      })),
    },
  });
  assert.ok([200, 201].includes(batch.status), JSON.stringify(batch.data));
  const after = f.db.get("SELECT COUNT(*) n FROM outbox WHERE channel='sms'").n;
  assert.ok(after > before, 'غیبت باید برای خانواده پیامک در صف بگذارد');
  const outbox = await admin.request('/settings/outbox');
  assert.equal(outbox.status, 200);
  assert.ok(outbox.data.rows.length > 0);

  const flush = await admin
    .request('/settings/outbox/deliver', { method: 'POST' })
    .catch(() => null);
  if (flush) assert.ok([200, 404].includes(flush.status));
});

test('restore: a valid backup is accepted, a foreign file is rejected, safety copy is kept', async () => {
  const backup = await admin.request('/settings/backup', { raw: true });
  assert.equal(backup.status, 200);
  assert.equal(backup.data.subarray(0, 15).toString(), 'SQLite format 3');

  const wrongPassword = new FormData();
  wrongPassword.append('file', new Blob([backup.data]), 'backup.sqlite');
  wrongPassword.append('password', 'definitely-wrong');
  const refused = await admin.request('/settings/backup/restore', {
    method: 'POST',
    body: wrongPassword,
  });
  assert.equal(refused.status, 422);

  const junk = new FormData();
  junk.append('file', new Blob([Buffer.from('not a database at all')]), 'junk.sqlite');
  junk.append('password', 'School@1405');
  const notSqlite = await admin.request('/settings/backup/restore', { method: 'POST', body: junk });
  assert.equal(notSqlite.status, 422);

  const good = new FormData();
  good.append('file', new Blob([backup.data]), 'backup.sqlite');
  good.append('password', 'School@1405');
  const restored = await admin.request('/settings/backup/restore', { method: 'POST', body: good });
  assert.equal(restored.status, 200, JSON.stringify(restored.data));
  assert.match(restored.data.safety_copy, /^pre-restore-.*\.sqlite$/);
  assert.ok(restored.data.students >= 200);
  // Restoring replaces the session table, so the principal signs in again.
  admin = await f.client().login('admin');
  const history = await admin.request('/settings/restore/history');
  assert.equal(history.status, 200);
  assert.ok(history.data.files.some((file) => file.name === restored.data.safety_copy));
});
