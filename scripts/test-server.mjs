import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/database.js';
import { seedDemo } from '../server/seed.js';
import { createApp } from '../server/app.js';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'madresehyar-browser-test-'));
const db = await openDatabase({ dataDir: dir });
seedDemo(db);
const server = createApp(db, { demo: true }).listen(3100, '0.0.0.0', () =>
  console.log('Isolated browser test server ready on 3100'),
);
const stop = () =>
  server.close(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  });
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
