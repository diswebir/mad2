import { supportedNode } from './runtime.js';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openDatabase } from './database.js';
import { seedDemo } from './seed.js';
import { createApp } from './app.js';
if (!supportedNode()) throw new Error('Node.js 20.19+ or 22.12+ is required.');
const requestedDemo = process.env.DEMO_MODE === 'true';
if (requestedDemo && process.env.NODE_ENV === 'production')
  throw new Error('DEMO_MODE must be false in production.');
const db = await openDatabase();
if (requestedDemo && !db.setting('installed')) seedDemo(db);
const demo = requestedDemo && !!db.setting('demo_seeded');
let installToken = process.env.INSTALL_TOKEN;
if (!db.setting('installed')) {
  const keyFile = path.join(db.dir, 'install.key');
  if (!installToken) {
    if (!fs.existsSync(keyFile))
      fs.writeFileSync(keyFile, crypto.randomBytes(24).toString('hex'), { mode: 0o600 });
    installToken = fs.readFileSync(keyFile, 'utf8').trim();
    console.log(`Installation token is available in ${keyFile}. Keep this file private.`);
  }
  if (installToken.length < 24)
    throw new Error('INSTALL_TOKEN must contain at least 24 characters.');
}
const app = createApp(db, { demo, installToken });
const port = Number(process.env.PORT) || (process.env.NODE_ENV === 'development' ? 3001 : 3000);
const server = app.listen(port, process.env.HOST || '0.0.0.0', () =>
  console.log(`مدرسه‌یار is ready on port ${port}${demo ? ' (demo mode)' : ''}`),
);
const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
