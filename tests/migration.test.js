import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/database.js';
import { seedDemo } from '../server/seed.js';

test('an existing version-one database migrates additively without losing data', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'madresehyar-migration-'));
  const first = await openDatabase({ dataDir: dir });
  seedDemo(first);
  const before = {
    students: first.get('SELECT COUNT(*) n FROM students').n,
    grades: first.get('SELECT COUNT(*) n FROM grades').n,
    notifications: first.get('SELECT COUNT(*) n FROM notifications').n,
    archivedGrades: first.get('SELECT COUNT(*) n FROM grades WHERE class_id IS NOT NULL').n,
  };
  const expected = first.get('SELECT class_id FROM grades WHERE student_id=1 AND subject_id=1');
  // Recreate the version-one shape: no new columns and no migration marker.
  first.raw.run('DROP INDEX IF EXISTS idx_grades_class_id');
  first.raw.run('ALTER TABLE grades DROP COLUMN class_id');
  first.raw.run('ALTER TABLE students DROP COLUMN revision');
  first.raw.run('ALTER TABLE files DROP COLUMN context');
  first.raw.run('ALTER TABLE submissions DROP COLUMN revision');
  first.raw.run('ALTER TABLE submissions DROP COLUMN allow_resubmit');
  first.raw.run('ALTER TABLE notifications DROP COLUMN source_feature');
  first.raw.run('ALTER TABLE announcements DROP COLUMN notified_at');
  first.run("DELETE FROM settings WHERE key='schema_version'");
  first.close();

  const upgraded = await openDatabase({ dataDir: dir });
  try {
    assert.equal(upgraded.setting('schema_version'), 3);
    assert.equal(upgraded.get('SELECT COUNT(*) n FROM students').n, before.students);
    assert.equal(upgraded.get('SELECT COUNT(*) n FROM grades').n, before.grades);
    assert.equal(
      upgraded.get('SELECT COUNT(*) n FROM grades WHERE class_id IS NULL').n,
      0,
      'the historical class of every grade is rebuilt',
    );
    assert.equal(
      upgraded.get('SELECT class_id FROM grades WHERE student_id=1 AND subject_id=1').class_id,
      expected.class_id,
    );
    assert.equal(upgraded.get('SELECT COUNT(*) n FROM students WHERE revision IS NULL').n, 0);
    assert.equal(upgraded.get('SELECT COUNT(*) n FROM files WHERE context IS NULL').n, 0);
    assert.equal(
      upgraded.get(
        "SELECT COUNT(*) n FROM files WHERE context NOT IN ('legacy','tickets','documents','assignments','submission')",
      ).n,
      0,
    );
    assert.equal(
      upgraded.get('SELECT COUNT(*) n FROM announcements WHERE notified_at IS NULL').n,
      0,
      'already-published announcements are not re-notified after the upgrade',
    );
    assert.equal(
      upgraded.get('SELECT COUNT(*) n FROM notifications').n >= before.notifications,
      true,
    );
    assert(
      upgraded.get("SELECT context FROM files WHERE original_name LIKE '%.txt' LIMIT 1")?.context,
    );
  } finally {
    upgraded.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
