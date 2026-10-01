import { accountUsable, notify, teacherClasses, today } from './security.js';

// Passenger may sleep between requests; due notices are delivered on the next request,
// with a transactional marker so polling, edits and restarts never duplicate delivery.
export function deliverAnnouncements(db, security) {
  if (!security.enabled('announcements.view')) return;
  const due = db.all(
    `SELECT * FROM announcements WHERE notified_at IS NULL AND publish_date<=?
    AND (expires_at IS NULL OR expires_at>=?)`,
    [today(), today()],
  );
  if (!due.length) return;
  db.transaction(() => {
    const users = db
      .all('SELECT * FROM users WHERE active=1')
      .filter((user) => accountUsable(db, user));
    for (const row of due) {
      for (const user of users) {
        if (user.role !== 'admin' && row.audience !== 'all' && row.audience !== user.role) continue;
        if (row.class_id && user.role !== 'admin') {
          const related =
            user.role === 'teacher'
              ? teacherClasses(db, user).includes(row.class_id)
              : db.get('SELECT class_id FROM students WHERE id=?', [user.student_id || -1])
                  ?.class_id === row.class_id;
          if (!related) continue;
        }
        notify(db, user.id, row.title, row.body.slice(0, 180), '/announcements', 'announcement');
      }
      db.run(
        "UPDATE announcements SET notified_at=datetime('now') WHERE id=? AND notified_at IS NULL",
        [row.id],
      );
    }
  });
}
