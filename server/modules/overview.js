import { Router } from 'express';
import { resourceDefs, resourceLabel } from '../../shared/catalog.js';
import {
  assert,
  scope,
  assertScope,
  today,
  validDate,
  csv,
  teacherClasses,
  positiveId,
  pageNumber,
  recordPermissions,
  notificationFeature,
} from '../security.js';
import { addDateDays } from '../../shared/dates.js';
import { deliverAnnouncements } from '../announcements.js';
const dateAt = (offset = 0) => addDateDays(today(), offset);
export function overviewRouter(db, security) {
  const router = Router();
  router.use(security.auth);
  router.use((req, _res, next) => {
    if (req.method === 'GET') deliverAnnouncements(db, security);
    next();
  });
  const canRead = (resource, user) =>
    security.enabled(`${resource}.view`) && resourceDefs[resource].read.includes(user.role);
  const scopedRows = (resource, user, suffix = '', params = []) => {
    const s = scope(db, resource, user);
    return db.all(`SELECT r.* FROM "${resource}" r WHERE (${s.sql}) ${suffix}`, [
      ...s.params,
      ...params,
    ]);
  };
  const attendanceScope = (user) => {
    if (user.role === 'teacher') {
      const classes = teacherClasses(db, user);
      return {
        sql: `a.class_id IN (${(classes.length ? classes : [-1]).map(() => '?').join(',')})`,
        params: classes.length ? classes : [-1],
      };
    }
    const s = scope(db, 'students', user, 'st');
    return { sql: s.sql, params: s.params };
  };
  const chart = (user, period = 'current') => {
    const s = attendanceScope(user),
      points = [];
    const end = period === 'previous' ? -7 : 0;
    for (let offset = end - 6; offset <= end; offset++) {
      const date = dateAt(offset);
      if (new Date(date).getUTCDay() === 5) continue;
      const row = db.get(
        `SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END),0) present,COALESCE(SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END),0) absent,COALESCE(SUM(CASE WHEN a.status='excused' THEN 1 ELSE 0 END),0) excused FROM attendance a JOIN students st ON st.id=a.student_id WHERE a.date=? AND (${s.sql})`,
        [date, ...s.params],
      );
      points.push({
        date,
        ...row,
        rate: row.total ? Math.round((row.present / row.total) * 1000) / 10 : 0,
      });
    }
    return points;
  };
  router.get('/config', (req, res) => res.json(security.config()));
  router.get('/lookups', (req, res) => {
    const result = {};
    for (const [resource, def] of Object.entries(resourceDefs)) {
      // Only labels and non-sensitive relationship metadata are returned, not complete records.
      if (!canRead(resource, req.user)) continue;
      result[resource] = scopedRows(resource, req.user, 'ORDER BY r.id LIMIT 2000').map((r) => ({
        id: r.id,
        label: resourceLabel(resource, r),
        ...(resource === 'classes'
          ? { grade: r.grade, teacher_id: r.teacher_id, capacity: r.capacity }
          : {}),
        ...(resource === 'students' ? { class_id: r.class_id, status: r.status } : {}),
        ...(resource === 'subjects' ? { grade: r.grade } : {}),
        ...(['schedules', 'assignments', 'exams'].includes(resource)
          ? {
              class_id: r.class_id,
              subject_id: r.subject_id,
              teacher_id: r.teacher_id,
              max_score: r.max_score,
            }
          : {}),
        ...(resource === 'teachers' ? { status: r.status } : {}),
        ...(resource === 'invoices'
          ? { student_id: r.student_id, amount: r.amount, paid_amount: r.paid_amount }
          : {}),
      }));
    }
    if (
      req.user.role !== 'admin' &&
      security.enabled('teachers.view') &&
      (security.enabled('classes.view') || security.enabled('schedules.view'))
    ) {
      // Related teacher names are safe labels, not access to their private staff files.
      const cs = scope(db, 'classes', req.user, 'c');
      result.teachers = db.all(
        `SELECT t.id,t.first_name||' '||t.last_name label FROM teachers t WHERE t.id=? OR t.id IN (SELECT c.teacher_id FROM classes c WHERE (${cs.sql})) OR t.id IN (SELECT s.teacher_id FROM schedules s JOIN classes c ON c.id=s.class_id WHERE (${cs.sql})) ORDER BY t.id`,
        [req.user.teacher_id || 0, ...cs.params, ...cs.params],
      );
    }
    res.json(result);
  });
  router.get('/dashboard', security.feature('dashboard.view'), (req, res) => {
    const s = attendanceScope(req.user);
    const attendance = db.get(
      `SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END),0) present,COALESCE(SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END),0) absent FROM attendance a JOIN students st ON st.id=a.student_id WHERE a.date=? AND (${s.sql})`,
      [today(), ...s.params],
    );
    const count = (resource) => {
      const c = scope(db, resource, req.user);
      return db.get(`SELECT COUNT(*) n FROM "${resource}" r WHERE ${c.sql}`, c.params).n;
    };
    const classes = (canRead('classes', req.user) ? scopedRows('classes', req.user) : []).map(
      (r) => ({
        ...r,
        student_count: db.get(
          "SELECT COUNT(*) n FROM students WHERE class_id=? AND status='active'",
          [r.id],
        ).n,
      }),
    );
    let teacherCount = canRead('teachers', req.user) ? count('teachers') : null;
    if (['student', 'parent'].includes(req.user.role) && security.enabled('teachers.view'))
      teacherCount = new Set([
        ...classes.map((c) => c.teacher_id),
        ...(canRead('schedules', req.user)
          ? scopedRows('schedules', req.user).map((s) => s.teacher_id)
          : []),
      ]).size;
    const stats = security.enabled('dashboard.statistics')
      ? {
          students: canRead('students', req.user) ? count('students') : null,
          teachers: teacherCount,
          classes: canRead('classes', req.user) ? classes.length : null,
          attendance_rate:
            security.enabled('attendance.view') && attendance.total
              ? Math.round((attendance.present / attendance.total) * 1000) / 10
              : null,
          ...(security.enabled('attendance.view')
            ? attendance
            : { total: null, present: null, absent: null }),
        }
      : null;
    const stScope = scope(db, 'students', req.user);
    const students = security.enabled('students.view')
      ? db.all(
          `SELECT r.id,r.first_name,r.last_name,r.class_id,r.status,c.name class_name,a.status attendance_status FROM students r JOIN classes c ON c.id=r.class_id LEFT JOIN attendance a ON a.student_id=r.id AND a.date=? WHERE (${stScope.sql}) ORDER BY r.id LIMIT 5`,
          [today(), ...stScope.params],
        )
      : [];
    const events = security.enabled('events.view')
      ? scopedRows('events', req.user, 'AND r.start_date>=? ORDER BY r.start_date LIMIT 4', [
          today(),
        ])
      : [];
    const announcements = security.enabled('announcements.view')
      ? scopedRows('announcements', req.user, 'AND r.publish_date<=? ORDER BY r.id DESC LIMIT 3', [
          today(),
        ])
      : [];
    const activities = security.enabled('dashboard.activities')
      ? db.all(
          `SELECT a.*,u.full_name FROM audit a LEFT JOIN users u ON u.id=a.actor_id ${req.user.role === 'admin' ? '' : 'WHERE a.actor_id=?'} ORDER BY a.id DESC LIMIT 6`,
          req.user.role === 'admin' ? [] : [req.user.id],
        )
      : [];
    const ticketScope = req.user.role === 'admin' ? '' : 'AND (sender_id=? OR recipient_id=?)';
    const open_tickets = security.enabled('tickets.view')
      ? db.get(
          `SELECT COUNT(*) n FROM tickets WHERE status IN ('open','in_progress') ${ticketScope}`,
          req.user.role === 'admin' ? [] : [req.user.id, req.user.id],
        ).n
      : 0;
    res.json({
      stats,
      chart:
        security.enabled('dashboard.chart') && security.enabled('attendance.view')
          ? chart(req.user, req.query.period)
          : [],
      students,
      events,
      announcements,
      activities,
      classes,
      open_tickets,
      date: today(),
    });
  });
  router.get('/calendar', security.feature('events.view'), (req, res) => {
    const from = String(req.query.from || today()),
      to = String(req.query.to || dateAt(60));
    assert(
      validDate(from) &&
        validDate(to) &&
        from <= to &&
        Date.parse(to) - Date.parse(from) <= 366 * 86400000,
      422,
      'بازه تقویم معتبر نیست.',
    );
    res.json(
      scopedRows(
        'events',
        req.user,
        'AND r.start_date<=? AND COALESCE(r.end_date,r.start_date)>=? ORDER BY r.start_date LIMIT 1000',
        [to, from],
      ).map((row) => ({
        ...row,
        permissions: recordPermissions(db, security, 'events', row, req.user),
      })),
    );
  });
  router.get('/students/:id/profile', security.feature('students.profile'), (req, res) => {
    const student = db.get('SELECT * FROM students WHERE id=?', [positiveId(req.params.id)]);
    assert(student, 404, 'پرونده پیدا نشد.');
    assertScope(db, 'students', student, req.user);
    const cls = canRead('classes', req.user)
      ? db.get('SELECT * FROM classes WHERE id=?', [student.class_id])
      : null;
    const teacher =
      cls && security.enabled('teachers.view')
        ? db.get(
            `SELECT first_name,last_name,specialty${req.user.role === 'admin' || req.user.teacher_id === cls.teacher_id ? ',phone,email' : ''} FROM teachers WHERE id=?`,
            [cls.teacher_id],
          )
        : null;
    const result = {
      student: {
        ...student,
        permissions: recordPermissions(db, security, 'students', student, req.user),
      },
      class: cls,
      teacher,
      username:
        req.user.role === 'admin'
          ? db.get('SELECT username FROM users WHERE id=?', [student.user_id || -1])?.username
          : undefined,
    };
    if (security.enabled('attendance.history'))
      result.attendance = db.all(
        'SELECT * FROM attendance WHERE student_id=? ORDER BY date DESC LIMIT 60',
        [student.id],
      );
    for (const resource of ['grades', 'documents', 'discipline', 'health', 'counseling'])
      if (
        security.enabled(`${resource}.view`) &&
        resourceDefs[resource].read.includes(req.user.role)
      )
        result[resource] = scopedRows(
          resource,
          req.user,
          'AND r.student_id=? ORDER BY r.id DESC LIMIT 100',
          [student.id],
        ).map((row) => ({
          ...row,
          permissions: recordPermissions(db, security, resource, row, req.user),
        }));
    res.json(result);
  });
  router.get('/classes/:id/roster', security.feature('classes.roster'), (req, res) => {
    const cls = db.get('SELECT * FROM classes WHERE id=?', [positiveId(req.params.id)]);
    assert(cls, 404, 'کلاس پیدا نشد.');
    assertScope(db, 'classes', cls, req.user);
    const s = scope(db, 'students', req.user);
    res.json(
      db.all(
        `SELECT r.id,r.first_name,r.last_name,r.status FROM students r WHERE r.class_id=? AND (${s.sql}) ORDER BY r.last_name`,
        [cls.id, ...s.params],
      ),
    );
  });
  router.get('/search', (req, res) => {
    const q = String(req.query.q || '')
      .trim()
      .slice(0, 100);
    if (q.length < 2) return res.json([]);
    const results = [];
    const paths = {
      students: '/students',
      teachers: '/teachers',
      classes: '/classes',
      events: '/calendar',
    };
    for (const resource of Object.keys(paths)) {
      const def = resourceDefs[resource];
      if (!security.enabled(`${resource}.view`) || !def.read.includes(req.user.role)) continue;
      const s = scope(db, resource, req.user);
      const search = def.display.map((k) => `COALESCE(r."${k}",'')`).join(" || ' ' || ");
      const rows = db.all(
        `SELECT r.* FROM "${resource}" r WHERE (${s.sql}) AND (${search}) LIKE ? LIMIT 5`,
        [...s.params, `%${q}%`],
      );
      results.push(
        ...rows.map((r) => ({
          id: `${resource}-${r.id}`,
          title: resourceLabel(resource, r),
          category: def.singular,
          link: `${paths[resource]}?id=${r.id}`,
        })),
      );
    }
    if (security.enabled('tickets.view')) {
      const own = req.user.role === 'admin' ? '' : 'AND (sender_id=? OR recipient_id=?)';
      const tickets = db.all(`SELECT id,title FROM tickets WHERE title LIKE ? ${own} LIMIT 5`, [
        `%${q}%`,
        ...(req.user.role === 'admin' ? [] : [req.user.id, req.user.id]),
      ]);
      results.push(
        ...tickets.map((t) => ({
          id: `ticket-${t.id}`,
          title: t.title,
          category: 'تیکت',
          link: `/tickets?id=${t.id}`,
        })),
      );
    }
    res.json(results);
  });
  const visibleNotifications = (user) =>
    db
      .all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC', [user.id])
      .filter((row) => {
        const source = notificationFeature(row);
        return !source || security.enabled(source);
      });
  router.get('/notifications', security.feature('notifications.view'), (req, res) => {
    const rows = visibleNotifications(req.user);
    if (req.query.paginated !== '1') return res.json(rows.slice(0, 30));
    const page = pageNumber(req.query.page),
      limit = pageNumber(req.query.limit, 30, 100);
    res.json({
      rows: rows.slice((page - 1) * limit, page * limit),
      total: rows.length,
      unread: rows.filter((row) => !row.is_read).length,
      page,
      pages: Math.ceil(rows.length / limit),
    });
  });
  router.patch('/notifications/read', security.feature('notifications.read'), (req, res) => {
    const id = req.body?.id === undefined ? null : positiveId(req.body.id);
    const visible = visibleNotifications(req.user);
    if (id)
      assert(
        visible.some((row) => row.id === id),
        404,
        'اعلان پیدا نشد.',
      );
    db.transaction(() => {
      for (const row of visible)
        if ((!id || row.id === id) && !row.is_read)
          db.run('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [
            row.id,
            req.user.id,
          ]);
    });
    res.json({ ok: true });
  });

  const reports = (user) => {
    const ss = scope(db, 'students', user, 'st'),
      cs = scope(db, 'classes', user, 'c'),
      gs = scope(db, 'grades', user, 'g');
    const gradeOn = canRead('grades', user),
      attendanceOn = security.enabled('attendance.view');
    const weighted = gradeOn
      ? db.get(
          `SELECT SUM(g.score/g.max_score*20*g.coefficient)/NULLIF(SUM(g.coefficient),0) average,
      COUNT(*) count FROM grades g WHERE (${gs.sql})`,
          gs.params,
        )
      : null;
    const classes = canRead('classes', user)
      ? db
          .all(
            `SELECT c.id,c.name,c.grade FROM classes c WHERE (${cs.sql}) ORDER BY c.id`,
            cs.params,
          )
          .map((cls) => {
            const mean = gradeOn
              ? db.get(
                  `SELECT SUM(g.score/g.max_score*20*g.coefficient)/NULLIF(SUM(g.coefficient),0) average FROM grades g
        WHERE g.class_id=? AND (${gs.sql})`,
                  [cls.id, ...gs.params],
                )?.average
              : null;
            const attScope = attendanceScope(user);
            const att = attendanceOn
              ? db.get(
                  `SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END),0) present
        FROM attendance a JOIN students st ON st.id=a.student_id WHERE a.class_id=? AND a.date BETWEEN ? AND ? AND (${attScope.sql})`,
                  [cls.id, dateAt(-29), today(), ...attScope.params],
                )
              : null;
            return {
              ...cls,
              teacher: security.enabled('teachers.view')
                ? db.get(
                    "SELECT t.first_name||' '||t.last_name name FROM teachers t JOIN classes c ON c.teacher_id=t.id WHERE c.id=?",
                    [cls.id],
                  )?.name
                : null,
              students: canRead('students', user)
                ? db.get(
                    `SELECT COUNT(*) n FROM students st WHERE st.class_id=? AND st.status='active' AND (${ss.sql})`,
                    [cls.id, ...ss.params],
                  ).n
                : null,
              average: mean === null || mean === undefined ? null : Math.round(mean * 100) / 100,
              attendance: att?.total ? Math.round((att.present / att.total) * 1000) / 10 : null,
            };
          })
      : [];
    let finance = null;
    if (canRead('invoices', user)) {
      const is = scope(db, 'invoices', user);
      finance = db.get(
        `SELECT COALESCE(SUM(r.amount),0) billed,COALESCE(SUM(r.paid_amount),0) collected,
        COALESCE(SUM(r.amount-r.paid_amount),0) remaining,COUNT(*) invoices FROM invoices r WHERE (${is.sql})`,
        is.params,
      );
      if (!canRead('payments', user)) {
        finance.collected = null;
        finance.remaining = null;
      }
    }
    return {
      average:
        weighted?.average === null || weighted?.average === undefined
          ? null
          : Math.round(weighted.average * 100) / 100,
      grade_count: weighted?.count ?? null,
      classes,
      chart: attendanceOn ? chart(user) : [],
      finance,
      students: canRead('students', user)
        ? db.get(`SELECT COUNT(*) n FROM students st WHERE (${ss.sql})`, ss.params).n
        : null,
    };
  };
  router.get('/reports', security.feature('reports.view'), (req, res) =>
    res.json(reports(req.user)),
  );
  router.get('/reports/export', security.feature('reports.export'), (req, res) => {
    const report = reports(req.user);
    res.setHeader('Content-Disposition', `attachment; filename="school-report-${today()}.csv"`);
    res.type('text/csv; charset=utf-8').send(
      csv(report.classes, [
        { key: 'name', label: 'کلاس' },
        { key: 'teacher', label: 'معلم راهنما' },
        { key: 'students', label: 'دانش‌آموز' },
        { key: 'average', label: 'میانگین از ۲۰' },
        { key: 'attendance', label: 'درصد حضور ۳۰ روز' },
      ]),
    );
  });
  return router;
}
