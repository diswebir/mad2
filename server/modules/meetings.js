// Parent–teacher meeting slots: the school publishes time windows, families book a seat.
import { Router } from 'express';
import { z } from 'zod';
import { assert, parse, log, notify, today, positiveId } from '../security.js';

export function meetingsRouter(db, security) {
  const router = Router();
  router.use(security.auth);
  const visibleSlots = (user) => {
    if (user.role === 'admin') return { sql: '1=1', params: [] };
    if (user.role === 'teacher') return { sql: 's.teacher_id=?', params: [user.teacher_id || -1] };
    return {
      sql: 's.class_id IN (SELECT class_id FROM students WHERE id=?)',
      params: [user.student_id || -1],
    };
  };
  const bookingsOf = (slotId) =>
    db.get("SELECT COUNT(*) n FROM meeting_bookings WHERE slot_id=? AND status!='cancelled'", [
      slotId,
    ]).n;

  router.get('/slots', security.feature('meeting_slots.view'), (req, res) => {
    const s = visibleSlots(req.user);
    const rows = db.all(
      `SELECT s.*,t.first_name||' '||t.last_name teacher_name,c.name class_name,
        (SELECT COUNT(*) FROM meeting_bookings b WHERE b.slot_id=s.id AND b.status!='cancelled') booked
       FROM meeting_slots s JOIN teachers t ON t.id=s.teacher_id JOIN classes c ON c.id=s.class_id
       WHERE (${s.sql}) ORDER BY s.event_date, s.start_time LIMIT 500`,
      s.params,
    );
    const mine =
      ['student', 'parent'].includes(req.user.role) && req.user.student_id
        ? db.all('SELECT * FROM meeting_bookings WHERE student_id=? ORDER BY id DESC', [
            req.user.student_id,
          ])
        : [];
    res.json({
      rows: rows.map((row) => ({ ...row, seats_left: Math.max(0, row.capacity - row.booked) })),
      bookings: mine,
      upcoming: rows.filter((row) => row.event_date >= today()).length,
    });
  });

  router.post('/slots', security.feature('meetings.manage'), (req, res) => {
    const data = parse(
      z.object({
        title: z.string().trim().min(2).max(120).default('جلسه اولیا و مربیان'),
        event_date: z.string(),
        start_time: z.string(),
        end_time: z.string(),
        teacher_id: z.number().int().positive(),
        class_id: z.number().int().positive(),
        capacity: z.number().int().min(1).max(60).default(8),
        location: z.string().max(120).optional().default(''),
        notes: z.string().max(1000).optional().default(''),
      }),
      req.body,
    );
    assert(/^\d{4}-\d{2}-\d{2}$/.test(data.event_date), 422, 'تاریخ معتبر نیست.');
    assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(data.start_time), 422, 'ساعت شروع معتبر نیست.');
    assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(data.end_time), 422, 'ساعت پایان معتبر نیست.');
    assert(data.end_time > data.start_time, 422, 'ساعت پایان باید بعد از شروع باشد.');
    const cls = db.get('SELECT * FROM classes WHERE id=?', [data.class_id]);
    assert(cls, 422, 'کلاس انتخاب‌شده وجود ندارد.');
    assert(
      db.get('SELECT id FROM teachers WHERE id=?', [data.teacher_id]),
      422,
      'معلم انتخاب‌شده وجود ندارد.',
    );
    if (req.user.role === 'teacher')
      assert(data.teacher_id === req.user.teacher_id, 403, 'فقط برای خودتان بازه می‌سازید.');
    assert(
      !db.get(
        'SELECT id FROM meeting_slots WHERE teacher_id=? AND event_date=? AND start_time<? AND end_time>?',
        [data.teacher_id, data.event_date, data.end_time, data.start_time],
      ),
      409,
      'این بازه با بازهٔ دیگری از همان معلم تداخل دارد.',
    );
    let id;
    db.transaction(() => {
      id = db.insert('meeting_slots', { ...data, author_id: req.user.id });
      log(db, req.user, 'meetings.slot_create', 'meeting_slots', id, {
        teacher_id: data.teacher_id,
      });
    });
    res.status(201).json({ id });
  });

  router.delete('/slots/:id', security.feature('meetings.manage'), (req, res) => {
    const slot = db.get('SELECT * FROM meeting_slots WHERE id=?', [positiveId(req.params.id)]);
    assert(slot, 404, 'بازهٔ ملاقات پیدا نشد.');
    if (req.user.role === 'teacher')
      assert(slot.teacher_id === req.user.teacher_id, 403, 'دسترسی ندارید.');
    assert(bookingsOf(slot.id) === 0, 409, 'این بازه نوبت فعال دارد؛ ابتدا نوبت‌ها را لغو کنید.');
    db.transaction(() => {
      db.run('DELETE FROM meeting_slots WHERE id=?', [slot.id]);
      log(db, req.user, 'meetings.slot_delete', 'meeting_slots', slot.id);
    });
    res.json({ ok: true });
  });

  router.post('/book', security.feature('meetings.book'), (req, res) => {
    const data = parse(
      z.object({
        slot_id: z.number().int().positive(),
        student_id: z.number().int().positive().optional(),
        question: z.string().max(1000).optional().default(''),
      }),
      req.body,
    );
    const slot = db.get('SELECT * FROM meeting_slots WHERE id=?', [data.slot_id]);
    assert(slot, 404, 'بازهٔ ملاقات پیدا نشد.');
    const studentId = ['student', 'parent'].includes(req.user.role)
      ? req.user.student_id
      : data.student_id || 0;
    const student = db.get(
      'SELECT s.*,u.phone guardian_phone FROM students s LEFT JOIN users u ON u.id=s.guardian_user_id WHERE s.id=?',
      [studentId],
    );
    assert(student, 422, 'دانش‌آموز مشخص نیست.');
    if (['student', 'parent'].includes(req.user.role))
      assert(student.id === req.user.student_id, 403, 'فقط برای فرزند خودتان نوبت می‌گیرید.');
    assert(student.class_id === slot.class_id, 403, 'این بازه برای کلاس دیگری است.');
    assert(slot.event_date >= today(), 409, 'این جلسه گذشته است.');
    assert(
      !db.get(
        "SELECT id FROM meeting_bookings WHERE slot_id=? AND student_id=? AND status!='cancelled'",
        [slot.id, student.id],
      ),
      409,
      'برای این بازه قبلاً نوبت گرفته‌اید.',
    );
    assert(
      !db.get(
        "SELECT b.id FROM meeting_bookings b JOIN meeting_slots s ON s.id=b.slot_id WHERE b.student_id=? AND b.status!='cancelled' AND s.event_date=? AND s.start_time<? AND s.end_time>?",
        [student.id, slot.event_date, slot.end_time, slot.start_time],
      ),
      409,
      'در همین ساعت نوبت دیگری دارید.',
    );
    assert(bookingsOf(slot.id) < slot.capacity, 409, 'ظرفیت این بازه تکمیل است.');
    let id;
    db.transaction(() => {
      id = db.insert('meeting_bookings', {
        slot_id: slot.id,
        student_id: student.id,
        parent_name: req.user.full_name,
        phone: req.user.phone || student.guardian_phone || null,
        status: 'booked',
        question: data.question,
      });
      const teacher = db.get('SELECT u.id FROM users u WHERE u.teacher_id=?', [slot.teacher_id]);
      notify(
        db,
        teacher?.id,
        'نوبت ملاقات جدید',
        `${student.first_name} ${student.last_name} — ${slot.event_date} ${slot.start_time}`,
        '/meetings',
        'info',
        'meeting_slots.view',
      );
      log(db, req.user, 'meetings.book', 'meeting_bookings', id, { slot_id: slot.id });
    });
    res.status(201).json({ id, seats_left: Math.max(0, slot.capacity - bookingsOf(slot.id)) });
  });

  router.patch('/bookings/:id', security.feature('meetings.book'), (req, res) => {
    const booking = db.get(
      'SELECT b.*,s.teacher_id,s.event_date,s.start_time FROM meeting_bookings b JOIN meeting_slots s ON s.id=b.slot_id WHERE b.id=?',
      [positiveId(req.params.id)],
    );
    assert(booking, 404, 'نوبت پیدا نشد.');
    const data = parse(
      z.object({ status: z.enum(['cancelled', 'attended', 'missed', 'booked']) }),
      req.body,
    );
    const family = ['student', 'parent'].includes(req.user.role);
    if (family) {
      assert(
        booking.student_id === req.user.student_id && data.status === 'cancelled',
        403,
        'خانواده فقط می‌تواند نوبت خود را لغو کند.',
      );
    } else if (req.user.role === 'teacher') {
      assert(booking.teacher_id === req.user.teacher_id, 403, 'این نوبت برای شما نیست.');
    }
    db.transaction(() => {
      db.run(
        "UPDATE meeting_bookings SET status=?,revision=revision+1,updated_at=datetime('now') WHERE id=?",
        [data.status, booking.id],
      );
      notify(
        db,
        db.get('SELECT user_id FROM students WHERE id=?', [booking.student_id])?.user_id,
        'وضعیت نوبت ملاقات تغییر کرد',
        `${booking.event_date} ${booking.start_time}`,
        '/meetings',
        'info',
        'meeting_slots.view',
      );
      log(db, req.user, 'meetings.booking_update', 'meeting_bookings', booking.id, data);
    });
    res.json({ ok: true });
  });

  router.get('/bookings', security.feature('meeting_slots.view'), (req, res) => {
    const clauses = [];
    const params = [];
    if (req.user.role === 'teacher') {
      clauses.push('s.teacher_id=?');
      params.push(req.user.teacher_id || -1);
    } else if (!['admin'].includes(req.user.role)) {
      const classes = teacherClasses(db, req.user);
      void classes;
      clauses.push('b.student_id=?');
      params.push(req.user.student_id || -1);
    }
    const rows = db.all(
      `SELECT b.*,st.first_name,st.last_name,s.event_date,s.start_time,s.end_time,s.title,s.location,t.first_name||' '||t.last_name teacher_name
       FROM meeting_bookings b JOIN meeting_slots s ON s.id=b.slot_id JOIN students st ON st.id=b.student_id
       JOIN teachers t ON t.id=s.teacher_id
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY s.event_date, s.start_time LIMIT 500`,
      params,
    );
    res.json(rows);
  });
  return router;
}
