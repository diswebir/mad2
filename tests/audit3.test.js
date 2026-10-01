import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { auditFixture, uploadText } from './helpers.js';
import { today } from '../server/security.js';

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

test('audit3: deleting records that still have history is refused', async () => {
  const invoice = f.db.get('SELECT * FROM invoices ORDER BY id LIMIT 1');
  const payment = f.db.get('SELECT * FROM payments WHERE invoice_id=? LIMIT 1', [invoice.id]);
  assert.ok(payment, 'demo invoice with payment expected');
  const delInvoice = await admin.request(`/entities/invoices/${invoice.id}`, { method: 'DELETE' });
  blocked(delInvoice, 409);
  assert.ok(f.db.get('SELECT id FROM invoices WHERE id=?', [invoice.id]), 'invoice must survive');

  const loan = f.db.get('SELECT * FROM loans ORDER BY id LIMIT 1');
  const bookId = loan.book_id;
  const delBook = await admin.request(`/entities/books/${bookId}`, { method: 'DELETE' });
  blocked(delBook, 409);

  const route = f.db.get('SELECT * FROM routes ORDER BY id LIMIT 1');
  assert.ok(f.db.get('SELECT id FROM students WHERE route_id=? LIMIT 1', [route.id]));
  blocked(await admin.request(`/entities/routes/${route.id}`, { method: 'DELETE' }), 409);

  const grade = f.db.get('SELECT * FROM grades ORDER BY id LIMIT 1');
  assert.ok(grade?.subject_id);
  blocked(await admin.request(`/entities/subjects/${grade.subject_id}`, { method: 'DELETE' }), 409);

  blocked(await admin.request(`/entities/students/${grade.student_id}`, { method: 'DELETE' }), 409);
  blocked(await admin.request(`/entities/exams/${grade.exam_id || 1}`, { method: 'DELETE' }), 409);
});

test('audit3: classes, teachers and schedules with dependents cannot silently disappear', async () => {
  const cls = f.db.get('SELECT * FROM classes ORDER BY id LIMIT 1');
  assert.ok(f.db.get("SELECT id FROM students WHERE class_id=? AND status='active'", [cls.id]));
  blocked(await admin.request(`/entities/classes/${cls.id}`, { method: 'DELETE' }), 409);

  const busy = f.db.get(
    'SELECT t.* FROM teachers t WHERE EXISTS (SELECT 1 FROM classes c WHERE c.teacher_id=t.id) OR EXISTS (SELECT 1 FROM schedules s WHERE s.teacher_id=t.id) LIMIT 1',
  );
  assert.ok(busy, 'busy teacher expected');
  blocked(await admin.request(`/entities/teachers/${busy.id}`, { method: 'DELETE' }), 409);
});

test('audit3: disabling account management blocks direct account creation routes', async () => {
  // Create a student while automatic account creation is off, so the record has no login yet.
  f.db.run('UPDATE features SET enabled=0 WHERE id=?', ['students.account']);
  const fresh = await admin.request('/entities/students', {
    method: 'POST',
    body: {
      first_name: 'بی‌حساب',
      last_name: 'آزمون',
      class_id: f.db.get('SELECT id FROM classes WHERE capacity>=5 ORDER BY id LIMIT 1').id,
      guardian_name: 'ولی آزمون',
      guardian_phone: '09121112233',
      status: 'active',
    },
  });
  f.db.run('UPDATE features SET enabled=1 WHERE id=?', ['students.account']);
  ok(fresh, 201);
  const target = fresh.data.row;
  assert.equal(target.user_id, null);
  f.db.run('UPDATE features SET enabled=0 WHERE id=?', ['settings.accounts']);
  blocked(
    await admin.request(`/settings/accounts/create/students/${target.id}`, { method: 'POST' }),
  );
  f.db.run('UPDATE features SET enabled=1 WHERE id=?', ['settings.accounts']);
  const created = await admin.request(`/settings/accounts/create/students/${target.id}`, {
    method: 'POST',
  });
  ok(created, 201);
  assert.ok(created.data.temporary_password);
  const again = await admin.request(`/settings/accounts/create/students/${target.id}`, {
    method: 'POST',
  });
  assert.equal(again.status, 409, 'a second account for the same record must be refused');
  const linked = f.db.get('SELECT user_id FROM students WHERE id=?', [target.id]);
  assert.ok(linked.user_id);
  assert.equal(
    f.db.get('SELECT COUNT(*) n FROM users WHERE student_id=?', [target.id]).n,
    1,
    'exactly one login per student record',
  );
});

test('audit3: role scoping of record lists stays inside the assigned circle', async () => {
  const teacherStudents = await teacher.request('/entities/students?limit=100');
  ok(teacherStudents);
  const allowed = new Set(
    f.db
      .all(
        'SELECT id FROM students WHERE class_id IN (SELECT id FROM classes WHERE teacher_id=? UNION SELECT class_id FROM schedules WHERE teacher_id=?)',
        [teacher.user.teacher_id, teacher.user.teacher_id],
      )
      .map((r) => r.id),
  );
  assert.ok(teacherStudents.data.rows.length > 0);
  assert.ok(teacherStudents.data.rows.every((row) => allowed.has(row.id)));
  assert.ok(teacherStudents.data.total < 240);

  const studentStudents = await student.request('/entities/students');
  ok(studentStudents);
  assert.equal(studentStudents.data.rows.length, 1);
  assert.equal(studentStudents.data.rows[0].id, student.user.student_id);

  const parentStudents = await parent.request('/entities/students');
  ok(parentStudents);
  assert.equal(parentStudents.data.rows.length, 1);
  assert.equal(parentStudents.data.rows[0].id, parent.user.student_id);

  ok(await student.request('/entities/invoices'));
  const invoiceRows = (await student.request('/entities/invoices')).data.rows;
  assert.ok(invoiceRows.every((row) => row.student_id === student.user.student_id));
  blocked(await student.request('/entities/teachers'));
  blocked(await teacher.request('/entities/invoices'));
  blocked(await teacher.request('/entities/health'));
  const teacherHealth = await teacher.request(`/entities/health`);
  assert.equal(teacherHealth.status, 403);

  const otherStudent = f.db.get('SELECT * FROM students WHERE id!=? AND status=? LIMIT 1', [
    student.user.student_id,
    'active',
  ]);
  blocked(await student.request(`/entities/students/${otherStudent.id}`));
  blocked(await student.request(`/students/${otherStudent.id}/profile`));
  blocked(await student.request(`/attendance/student/${otherStudent.id}`));
  const ownFile = await uploadText(student, 'documents');
  blocked(
    await student.request(`/entities/documents`, {
      method: 'POST',
      body: {
        student_id: otherStudent.id,
        title: 'سند جعلی',
        type: 'other',
        description: 'x',
        file_id: ownFile,
      },
    }),
  );
});

test('audit3: tickets stay private and follow class routing rules', async () => {
  const ticketRows = f.db.all('SELECT * FROM tickets');
  assert.ok(ticketRows.length > 0);
  const foreign = ticketRows.find((t) => ![t.sender_id, t.recipient_id].includes(student.user.id));
  if (foreign) blocked(await student.request(`/tickets/${foreign.id}`));

  const recipients = (await student.request('/tickets/recipients')).data;
  assert.ok(recipients.length > 0);
  assert.ok(recipients.every((r) => ['admin', 'teacher'].includes(r.role)));
  const outsider = f.db.get(
    "SELECT id FROM users WHERE role='teacher' AND teacher_id NOT IN (SELECT teacher_id FROM classes WHERE id=(SELECT class_id FROM students WHERE id=?) UNION SELECT teacher_id FROM schedules WHERE class_id=(SELECT class_id FROM students WHERE id=?)) LIMIT 1",
    [student.user.student_id, student.user.student_id],
  );
  if (outsider)
    blocked(
      await student.request('/tickets', {
        method: 'POST',
        body: {
          title: 'پیام آزمایشی',
          recipient_id: outsider.id,
          body: 'متن پیام آزمایشی',
        },
      }),
    );

  const teacherTarget = recipients.find((r) => r.role === 'teacher');
  const created = await student.request('/tickets', {
    method: 'POST',
    body: { title: 'سؤال درسی', recipient_id: teacherTarget.id, body: 'سلام، یک سؤال دارم.' },
  });
  ok(created, 201);
  const id = created.data.id;
  const teacherRecipients = (await teacher.request('/tickets/recipients')).data;
  assert.ok(
    teacherRecipients.some((r) => r.id === student.user.id),
    'student must be reachable',
  );
  ok(await teacher.request(`/tickets/${id}`));
  const closed = await teacher.request(`/tickets/${id}`, {
    method: 'PATCH',
    body: { status: 'closed' },
  });
  ok(closed);
  blocked(
    await student.request(`/tickets/${id}/messages`, { method: 'POST', body: { body: 'پاسخ' } }),
    409,
  );
  const reopened = await teacher.request(`/tickets/${id}`, {
    method: 'PATCH',
    body: { status: 'open' },
  });
  ok(reopened);
  ok(
    await student.request(`/tickets/${id}/messages`, {
      method: 'POST',
      body: { body: 'ممنون از پاسخ شما.' },
    }),
    201,
  );
  const outsiderClient = await f.client().demo('parent');
  if (![String(student.user.id)].includes(String(outsiderClient.user.id)))
    blocked(await outsiderClient.request(`/tickets/${id}`));
});

test('audit3: assignment and exam rules bind to taught class+subject', async () => {
  const slot = f.db.get('SELECT s.* FROM schedules s WHERE s.teacher_id=? ORDER BY s.id LIMIT 1', [
    teacher.user.teacher_id,
  ]);
  assert.ok(slot, 'teacher schedule expected');
  const foreignTeacher = f.db.get('SELECT * FROM teachers WHERE id!=? LIMIT 1', [
    teacher.user.teacher_id,
  ]);
  const spoofed = await teacher.request('/entities/assignments', {
    method: 'POST',
    body: {
      title: 'تکلیف با معلم جعلی',
      class_id: slot.class_id,
      subject_id: slot.subject_id,
      teacher_id: foreignTeacher.id,
      due_date: today(),
      max_score: 20,
      description: 'تست',
    },
  });
  ok(spoofed, 201);
  assert.equal(spoofed.data.row.teacher_id, teacher.user.teacher_id, 'teacher_id must be forced');
  await admin.request(`/entities/assignments/${spoofed.data.row.id}`, { method: 'DELETE' });

  const foreignClass = f.db.get(
    'SELECT * FROM classes WHERE id NOT IN (SELECT id FROM classes WHERE teacher_id=? UNION SELECT class_id FROM schedules WHERE teacher_id=?) AND id IN (SELECT class_id FROM schedules) LIMIT 1',
    [teacher.user.teacher_id, teacher.user.teacher_id],
  );
  if (foreignClass) {
    const foreignSlot = f.db.get('SELECT * FROM schedules WHERE class_id=? LIMIT 1', [
      foreignClass.id,
    ]);
    blocked(
      await teacher.request('/entities/assignments', {
        method: 'POST',
        body: {
          title: 'تکلیف کلاس دیگر',
          class_id: foreignClass.id,
          subject_id: foreignSlot.subject_id,
          due_date: today(),
          max_score: 20,
          description: 'تست',
        },
      }),
    );
    blocked(
      await teacher.request('/attendance', {
        method: 'POST',
        body: {
          class_id: foreignClass.id,
          date: today(),
          records: [
            {
              student_id: f.db.get('SELECT id FROM students WHERE class_id=? LIMIT 1', [
                foreignClass.id,
              ]).id,
              status: 'present',
            },
          ],
        },
      }),
    );
  }
  const otherSubject = f.db.get(
    `SELECT * FROM subjects WHERE id!=? AND (grade='all' OR grade=(SELECT grade FROM classes WHERE id=?))
     AND id NOT IN (SELECT subject_id FROM schedules WHERE teacher_id=? AND class_id=?) LIMIT 1`,
    [slot.subject_id, slot.class_id, teacher.user.teacher_id, slot.class_id],
  );
  if (otherSubject)
    blocked(
      await teacher.request('/entities/grades', {
        method: 'POST',
        body: {
          title: 'نمره آزمایشی',
          student_id: f.db.get('SELECT id FROM students WHERE class_id=? LIMIT 1', [slot.class_id])
            .id,
          subject_id: otherSubject.id,
          score: 18,
          max_score: 20,
          coefficient: 1,
        },
      }),
    );

  const created = await teacher.request('/entities/assignments', {
    method: 'POST',
    body: {
      title: 'تکلیف سنجش دامنه',
      class_id: slot.class_id,
      subject_id: slot.subject_id,
      due_date: today(),
      max_score: 20,
      description: 'توضیح',
    },
  });
  ok(created, 201);
  assert.equal(created.data.row.teacher_id, teacher.user.teacher_id);
  const assignmentId = created.data.row.id;
  const studentRow = f.db.get('SELECT * FROM students WHERE class_id=? LIMIT 1', [slot.class_id]);
  ok(await teacher.request(`/assignments/${assignmentId}/submissions`));
  const otherTeacher = f.db.get('SELECT * FROM users WHERE role=? AND teacher_id!=? LIMIT 1', [
    'teacher',
    teacher.user.teacher_id,
  ]);
  if (otherTeacher) {
    const otherClient = f.client();
    await otherClient.login(otherTeacher.username, 'School@1405');
    blocked(await otherClient.request(`/assignments/${assignmentId}/submissions`));
  }
  const studentRows = f.db.get('SELECT * FROM students WHERE id=?', [studentRow.id]);
  assert.ok(studentRows);
});
