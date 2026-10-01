import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { resourceDefs, moduleDefs, featureDefs } from '../shared/catalog.js';
const require = createRequire(import.meta.url);

export async function openDatabase({
  dataDir = process.env.DATA_DIR || './data',
  memory = false,
} = {}) {
  const dir = path.resolve(dataDir);
  if (!memory) fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true, mode: 0o700 });
  const filename = path.join(dir, 'school.sqlite');
  const lockfile = path.join(dir, 'school.lock');
  let ownsLock = false;
  if (!memory) {
    if (fs.existsSync(lockfile)) {
      let owner;
      try {
        owner = JSON.parse(fs.readFileSync(lockfile, 'utf8'));
      } catch {
        throw new Error(
          'Invalid database lock. Stop all app instances before removing data/school.lock.',
        );
      }
      let running = true;
      try {
        process.kill(owner.pid, 0);
      } catch (error) {
        running = error.code !== 'ESRCH';
      }
      if (running)
        throw new Error(
          'Another process owns this database. Configure Passenger for ONE instance per app, or use a separate DATA_DIR.',
        );
      fs.unlinkSync(lockfile);
    }
    const lock = fs.openSync(lockfile, 'wx', 0o600);
    fs.writeFileSync(
      lock,
      JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }),
    );
    fs.closeSync(lock);
    ownsLock = true;
  }
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(path.dirname(require.resolve('sql.js')), file),
  });
  const raw = new SQL.Database(
    !memory && fs.existsSync(filename) ? fs.readFileSync(filename) : undefined,
  );
  raw.run('PRAGMA foreign_keys = ON;');
  let depth = 0;
  const db = {
    raw,
    dir,
    filename,
    all(sql, params = []) {
      const stmt = raw.prepare(sql);
      try {
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    },
    get(sql, params = []) {
      return this.all(sql, params)[0];
    },
    run(sql, params = []) {
      raw.run(sql, params);
      const result = {
        changes: raw.getRowsModified(),
        id: this.get('SELECT last_insert_rowid() AS id').id,
      };
      if (!depth) this.persist();
      return result;
    },
    transaction(fn) {
      if (depth) return fn();
      depth++;
      raw.run('BEGIN IMMEDIATE');
      let result;
      try {
        result = fn();
        raw.run('COMMIT');
      } catch (error) {
        raw.run('ROLLBACK');
        throw error;
      } finally {
        depth--;
      }
      this.persist();
      return result;
    },
    export() {
      // SQL.js export closes/reopens SQLite; connection-local PRAGMAs must be restored.
      const bytes = raw.export();
      raw.run('PRAGMA foreign_keys = ON;');
      return bytes;
    },
    persist() {
      if (memory) return;
      const temp = `${filename}.tmp`;
      const bytes = this.export();
      const fd = fs.openSync(temp, 'w', 0o600);
      try {
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temp, filename);
    },
    setting(key, fallback = null) {
      const row = this.get('SELECT value FROM settings WHERE key = ?', [key]);
      return row ? JSON.parse(row.value) : fallback;
    },
    setSetting(key, value) {
      this.run(
        'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        [key, JSON.stringify(value)],
      );
    },
    insert(table, values) {
      const keys = Object.keys(values);
      return this.run(
        `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        Object.values(values),
      ).id;
    },
    close() {
      try {
        this.persist();
      } finally {
        raw.close();
        if (ownsLock && fs.existsSync(lockfile)) {
          fs.unlinkSync(lockfile);
          ownsLock = false;
        }
      }
    },
  };
  db.transaction(() => {
    raw.run(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, full_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','teacher','student','parent')), email TEXT, phone TEXT, student_id INTEGER, teacher_id INTEGER, active INTEGER NOT NULL DEFAULT 1, must_change_password INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS modules (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS features (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), original_name TEXT NOT NULL, stored_name TEXT NOT NULL UNIQUE, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES users(id), action TEXT NOT NULL, entity TEXT, record_id INTEGER, detail TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE INDEX IF NOT EXISTS idx_audit_date ON audit(created_at);
      CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, body TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'info', link TEXT, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,is_read);
    `);
    for (const [key, def] of Object.entries(resourceDefs)) {
      const columns = [...def.fields, ...(def.computed || [])].map((f) => {
        const type = ['number', 'reference', 'file'].includes(f.type)
          ? f.type === 'number' && !f.integer
            ? 'REAL'
            : 'INTEGER'
          : 'TEXT';
        const fk =
          f.type === 'reference'
            ? ` REFERENCES "${f.resource}"(id) ON DELETE RESTRICT`
            : f.type === 'file'
              ? ' REFERENCES files(id) ON DELETE RESTRICT'
              : '';
        return `"${f.name}" ${type}${f.required ? ' NOT NULL' : ''}${f.unique ? ' UNIQUE' : ''}${fk}`;
      });
      if (key === 'students')
        columns.push(
          'user_id INTEGER REFERENCES users(id)',
          'guardian_user_id INTEGER REFERENCES users(id)',
        );
      if (key === 'teachers') columns.push('user_id INTEGER REFERENCES users(id)');
      raw.run(
        `CREATE TABLE IF NOT EXISTS "${key}" (id INTEGER PRIMARY KEY, ${columns.join(',')}, author_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
      );
      // Additive, idempotent migrations retain databases installed with earlier registries.
      const existingColumns = new Set(
        db.all(`PRAGMA table_info("${key}")`).map((column) => column.name),
      );
      if (!existingColumns.has('revision'))
        raw.run(`ALTER TABLE "${key}" ADD COLUMN revision INTEGER NOT NULL DEFAULT 1`);
      for (const [index, field] of [...def.fields, ...(def.computed || [])].entries()) {
        if (!existingColumns.has(field.name)) {
          const definition = columns[index].replace(' NOT NULL', '').replace(' UNIQUE', '');
          raw.run(`ALTER TABLE "${key}" ADD COLUMN ${definition}`);
        }
        if (field.default !== undefined)
          db.run(`UPDATE "${key}" SET "${field.name}"=? WHERE "${field.name}" IS NULL`, [
            field.default,
          ]);
      }
      for (const f of def.fields.filter(
        (f) => ['reference', 'date'].includes(f.type) || f.name === 'status',
      ))
        raw.run(`CREATE INDEX IF NOT EXISTS "idx_${key}_${f.name}" ON "${key}"("${f.name}")`);
      for (const f of def.fields.filter((f) => f.unique))
        raw.run(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_${key}_${f.name}" ON "${key}"("${f.name}")`);
    }
    raw.run(`
      CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE RESTRICT, date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('present','absent','late','excused')), note TEXT, recorded_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(student_id,date));
      CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance(class_id,date);
      CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY, sender_id INTEGER NOT NULL REFERENCES users(id), recipient_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general', priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')), status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed')), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE INDEX IF NOT EXISTS idx_tickets_sender ON tickets(sender_id,status);
      CREATE INDEX IF NOT EXISTS idx_tickets_recipient ON tickets(recipient_id,status);
      CREATE TABLE IF NOT EXISTS ticket_messages (id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, sender_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, file_id INTEGER REFERENCES files(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, body TEXT NOT NULL, file_id INTEGER REFERENCES files(id), score REAL, feedback TEXT, submitted_at TEXT NOT NULL DEFAULT (datetime('now')), reviewed_at TEXT, UNIQUE(assignment_id,student_id));
    `);
    for (const mod of moduleDefs)
      db.run('INSERT OR IGNORE INTO modules(id,enabled) VALUES (?,1)', [mod.id]);
    for (const f of featureDefs)
      db.run('INSERT OR IGNORE INTO features(id,enabled) VALUES (?,1)', [f.id]);
    const submissionColumns = new Set(
      db.all('PRAGMA table_info(submissions)').map((column) => column.name),
    );
    if (!submissionColumns.has('revision'))
      raw.run('ALTER TABLE submissions ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
    if (!submissionColumns.has('allow_resubmit'))
      raw.run('ALTER TABLE submissions ADD COLUMN allow_resubmit INTEGER NOT NULL DEFAULT 0');
    const notificationColumns = new Set(
      db.all('PRAGMA table_info(notifications)').map((column) => column.name),
    );
    if (!notificationColumns.has('source_feature'))
      raw.run('ALTER TABLE notifications ADD COLUMN source_feature TEXT');
    const fileColumns = new Set(db.all('PRAGMA table_info(files)').map((column) => column.name));
    if (!fileColumns.has('context'))
      raw.run("ALTER TABLE files ADD COLUMN context TEXT NOT NULL DEFAULT 'legacy'");
    const announcementColumns = new Set(
      db.all('PRAGMA table_info(announcements)').map((column) => column.name),
    );
    if (!announcementColumns.has('notified_at')) {
      raw.run('ALTER TABLE announcements ADD COLUMN notified_at TEXT');
      // Do not resend notices previously delivered by version one.
      raw.run("UPDATE announcements SET notified_at=created_at WHERE publish_date<=date('now')");
    }
    raw.run(`UPDATE grades SET class_id=COALESCE((SELECT class_id FROM exams WHERE exams.id=grades.exam_id),
      (SELECT class_id FROM students WHERE students.id=grades.student_id)) WHERE class_id IS NULL`);
    // Recover a context for legacy files already attached to exactly one kind of activity.
    raw.run(`UPDATE files SET context=CASE
      WHEN EXISTS(SELECT 1 FROM ticket_messages WHERE file_id=files.id) THEN 'tickets'
      WHEN EXISTS(SELECT 1 FROM documents WHERE file_id=files.id) THEN 'documents'
      WHEN EXISTS(SELECT 1 FROM assignments WHERE file_id=files.id) THEN 'assignments'
      WHEN EXISTS(SELECT 1 FROM submissions WHERE file_id=files.id) THEN 'submission'
      ELSE 'legacy' END WHERE context='legacy' AND
      ((EXISTS(SELECT 1 FROM ticket_messages WHERE file_id=files.id)) +
       (EXISTS(SELECT 1 FROM documents WHERE file_id=files.id)) +
       (EXISTS(SELECT 1 FROM assignments WHERE file_id=files.id)) +
       (EXISTS(SELECT 1 FROM submissions WHERE file_id=files.id)))=1`);
    db.setSetting('schema_version', 2);
  });
  return db;
}
