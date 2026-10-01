import { Router } from 'express';
import { z } from 'zod';
import {
  assert,
  parse,
  log,
  notify,
  teacherClasses,
  ownClass,
  assertFileContext,
  positiveId,
} from '../security.js';
export function ticketsRouter(db, security) {
  const router = Router();
  router.use(security.auth);
  const getTicket = (req) => {
    const ticket = db.get(
      'SELECT t.*,s.full_name sender_name,r.full_name recipient_name FROM tickets t JOIN users s ON s.id=t.sender_id JOIN users r ON r.id=t.recipient_id WHERE t.id=?',
      [positiveId(req.params.id)],
    );
    assert(ticket, 404, 'تیکت پیدا نشد.');
    assert(
      req.user.role === 'admin' || [ticket.sender_id, ticket.recipient_id].includes(req.user.id),
      403,
      'این گفت‌وگو خصوصی است.',
    );
    return ticket;
  };
  const recipients = (user) => {
    if (user.role === 'admin')
      return db.all(
        'SELECT id,full_name,role FROM users WHERE active=1 AND id!=? ORDER BY role,full_name LIMIT 500',
        [user.id],
      );
    const admins = db.all("SELECT id,full_name,role FROM users WHERE role='admin' AND active=1");
    if (user.role === 'teacher') {
      const classes = teacherClasses(db, user);
      return [
        ...admins,
        ...db.all(
          `SELECT id,full_name,role FROM users WHERE active=1 AND student_id IN (SELECT id FROM students WHERE class_id IN (${(classes.length ? classes : [-1]).map(() => '?').join(',')}))`,
          classes.length ? classes : [-1],
        ),
      ];
    }
    const classId = ownClass(db, user) || -1;
    return [
      ...admins,
      ...db.all(
        'SELECT id,full_name,role FROM users WHERE active=1 AND teacher_id IN (SELECT teacher_id FROM classes WHERE id=? UNION SELECT teacher_id FROM schedules WHERE class_id=?)',
        [classId, classId],
      ),
    ];
  };
  const checkFile = (req, fileId) => {
    if (!fileId) return;
    assert(security.enabled('tickets.attachments'), 403, 'پیوست فایل در تیکت غیرفعال است.');
    assert(
      db.get('SELECT owner_id FROM files WHERE id=?', [fileId])?.owner_id === req.user.id,
      403,
      'فایل پیوست متعلق به شما نیست.',
    );
    assertFileContext(db, fileId, req.user, 'tickets');
  };
  router.get('/recipients', security.feature('tickets.create'), (req, res) =>
    res.json(recipients(req.user)),
  );
  router.get('/', security.feature('tickets.view'), (req, res) => {
    const clauses = [],
      params = [];
    if (req.user.role !== 'admin') {
      clauses.push('(t.sender_id=? OR t.recipient_id=?)');
      params.push(req.user.id, req.user.id);
    }
    if (req.query.status) {
      clauses.push('t.status=?');
      params.push(String(req.query.status));
    }
    if (req.query.q) {
      clauses.push('t.title LIKE ?');
      params.push(`%${String(req.query.q).slice(0, 200)}%`);
    }
    const rows = db.all(
      `SELECT t.*,s.full_name sender_name,s.role sender_role,r.full_name recipient_name,(SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id=t.id) message_count FROM tickets t JOIN users s ON s.id=t.sender_id JOIN users r ON r.id=t.recipient_id ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY t.updated_at DESC LIMIT 200`,
      params,
    );
    res.json(rows);
  });
  router.get('/:id', security.feature('tickets.view'), (req, res) => {
    const ticket = getTicket(req);
    const messages = db.all(
      'SELECT m.*,u.full_name,u.role,f.original_name file_name FROM ticket_messages m JOIN users u ON u.id=m.sender_id LEFT JOIN files f ON f.id=m.file_id WHERE m.ticket_id=? ORDER BY m.id',
      [ticket.id],
    );
    res.json({ ticket, messages });
  });
  router.post('/', security.feature('tickets.create'), (req, res) => {
    const data = parse(
      z.object({
        title: z.string().trim().min(3, 'عنوان حداقل ۳ کاراکتر باشد.').max(200),
        recipient_id: z.number().int().positive(),
        category: z
          .enum(['general', 'education', 'administrative', 'finance', 'services'])
          .default('general'),
        priority: z.enum(['low', 'normal', 'high']).default('normal'),
        body: z.string().trim().min(3, 'متن پیام را وارد کنید.').max(10000),
        file_id: z.number().int().positive().nullable().optional(),
      }),
      req.body,
    );
    assert(
      recipients(req.user).some((u) => u.id === data.recipient_id),
      403,
      'امکان ارسال پیام به این کاربر وجود ندارد.',
    );
    checkFile(req, data.file_id);
    let id;
    db.transaction(() => {
      id = db.insert('tickets', {
        sender_id: req.user.id,
        recipient_id: data.recipient_id,
        title: data.title,
        category: data.category,
        priority: data.priority,
      });
      db.insert('ticket_messages', {
        ticket_id: id,
        sender_id: req.user.id,
        body: data.body,
        file_id: data.file_id || null,
      });
      notify(
        db,
        data.recipient_id,
        'تیکت جدید',
        `${req.user.full_name}: ${data.title}`,
        `/tickets?id=${id}`,
        'ticket',
      );
      log(db, req.user, 'tickets.create', 'tickets', id, data.title);
    });
    res.status(201).json({ id });
  });
  router.post('/:id/messages', security.feature('tickets.reply'), (req, res) => {
    const ticket = getTicket(req);
    assert(ticket.status !== 'closed', 409, 'این تیکت بسته است؛ گیرنده می‌تواند آن را باز کند.');
    const data = parse(
      z.object({
        body: z.string().trim().min(1, 'متن پاسخ را بنویسید.').max(10000),
        file_id: z.number().int().positive().nullable().optional(),
      }),
      req.body,
    );
    checkFile(req, data.file_id);
    db.transaction(() => {
      db.insert('ticket_messages', {
        ticket_id: ticket.id,
        sender_id: req.user.id,
        body: data.body,
        file_id: data.file_id || null,
      });
      db.run("UPDATE tickets SET updated_at=datetime('now'),status=? WHERE id=?", [
        ticket.recipient_id === req.user.id || req.user.role === 'admin' ? 'in_progress' : 'open',
        ticket.id,
      ]);
      notify(
        db,
        req.user.id === ticket.sender_id ? ticket.recipient_id : ticket.sender_id,
        'پاسخ جدید به تیکت',
        ticket.title,
        `/tickets?id=${ticket.id}`,
        'ticket',
      );
      log(db, req.user, 'tickets.reply', 'tickets', ticket.id);
    });
    res.status(201).json({ ok: true });
  });
  router.patch('/:id', security.feature('tickets.manage'), (req, res) => {
    const ticket = getTicket(req);
    assert(
      req.user.role === 'admin' || req.user.id === ticket.recipient_id,
      403,
      'فقط گیرنده یا مدیر می‌تواند وضعیت را تغییر دهد.',
    );
    const data = parse(
      z.object({
        status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
        priority: z.enum(['low', 'normal', 'high']).optional(),
      }),
      req.body,
    );
    db.transaction(() => {
      db.run("UPDATE tickets SET status=?,priority=?,updated_at=datetime('now') WHERE id=?", [
        data.status,
        data.priority || ticket.priority,
        ticket.id,
      ]);
      notify(
        db,
        ticket.sender_id,
        'وضعیت تیکت تغییر کرد',
        ticket.title,
        `/tickets?id=${ticket.id}`,
        'ticket',
      );
      log(db, req.user, 'tickets.manage', 'tickets', ticket.id, data);
    });
    res.json({ ok: true });
  });
  return router;
}
