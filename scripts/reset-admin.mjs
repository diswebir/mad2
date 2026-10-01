import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { openDatabase } from '../server/database.js';
import { log, randomPassword } from '../server/security.js';
// Local recovery only; stop Passenger/the application before using this script.
let db;
try {
  db = await openDatabase();
  const username = process.argv[2] || 'admin';
  const user = db.get("SELECT * FROM users WHERE username=? AND role='admin'", [username]);
  if (!user) throw new Error('Administrator not found. Provide the existing admin username.');
  const password = randomPassword();
  db.transaction(() => {
    db.run('UPDATE users SET password_hash=?,active=1,must_change_password=1 WHERE id=?', [
      bcrypt.hashSync(password, 10),
      user.id,
    ]);
    db.run('DELETE FROM sessions WHERE user_id=?', [user.id]);
    log(db, null, 'cli.admin_reset', 'users', user.id);
  });
  console.log(
    `Username: ${user.username}\nTemporary password: ${password}\nChange this password on the next login. Do not share or retain this output in public logs.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  db?.close();
}
