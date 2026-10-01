import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditFixture } from './helpers.js';
import { openDatabase } from '../server/database.js';
import { seedDemo } from '../server/seed.js';
import { createApp, normalizeBasePath } from '../server/app.js';

let fixture;
before(async () => {
  fixture = await auditFixture();
});
after(async () => fixture.close());

const bootUnder = async (basePath) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'madresehyar-base-'));
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
  const db = await openDatabase({ dataDir: dir, memory: true });
  seedDemo(db);
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madresehyar-static-'));
  fs.writeFileSync(
    path.join(staticDir, 'index.html'),
    '<!doctype html><html><body><div id="root">spa-shell</div></body></html>',
  );
  fs.mkdirSync(path.join(staticDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(staticDir, 'assets', 'app.js'), 'console.log(1)');
  const app = createApp(db, { demo: true, basePath, staticDir });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    db,
    url,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(staticDir, { recursive: true, force: true });
    },
  };
};

test('deploy: base path normalisation accepts the shapes cPanel users type', () => {
  assert.equal(normalizeBasePath(undefined), '');
  assert.equal(normalizeBasePath(''), '');
  assert.equal(normalizeBasePath('/'), '');
  assert.equal(normalizeBasePath('/school'), '/school');
  assert.equal(normalizeBasePath('school'), '/school');
  assert.equal(normalizeBasePath('/school/'), '/school');
  assert.equal(normalizeBasePath('//nested//school//'), '/nested/school');
});

test('deploy: the whole app can live in a sub-directory', async () => {
  const instance = await bootUnder('/madrese');
  try {
    const root = await fetch(`${instance.url}/`, { redirect: 'manual' });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/madrese/');

    const noSlash = await fetch(`${instance.url}/madrese`, { redirect: 'manual' });
    assert.equal(noSlash.status, 301);
    assert.equal(noSlash.headers.get('location'), '/madrese/');

    const withSlash = await fetch(`${instance.url}/madrese/`, { redirect: 'manual' });
    assert.equal(withSlash.status, 200, 'the mounted path must not redirect to itself');

    const shell = await fetch(`${instance.url}/madrese/`);
    assert.equal(shell.status, 200);
    assert.ok((await shell.text()).includes('spa-shell'));

    const asset = await fetch(`${instance.url}/madrese/assets/app.js`);
    assert.equal(asset.status, 200);

    const spaRoute = await fetch(`${instance.url}/madrese/reports`, {
      headers: { accept: 'text/html' },
    });
    assert.equal(spaRoute.status, 200);
    assert.ok((await spaRoute.text()).includes('spa-shell'));

    const health = await fetch(`${instance.url}/madrese/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');

    const bareApi = await fetch(`${instance.url}/api/health`);
    assert.equal(bareApi.status, 404, 'API must not answer outside the mount point');

    const login = await fetch(`${instance.url}/madrese/api/auth/demo`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.ok(/Path=\/madrese/i.test(cookie), `cookie path must be scoped, got: ${cookie}`);

    const session = await fetch(`${instance.url}/madrese/api/auth/me`, {
      headers: { cookie: cookie.split(';')[0] },
    });
    const payload = await session.json();
    assert.equal(payload.user.role, 'admin');
  } finally {
    await instance.close();
  }
});

test('deploy: root mounting still behaves exactly like before', async () => {
  const instance = await bootUnder('');
  try {
    const shell = await fetch(`${instance.url}/`);
    assert.equal(shell.status, 200);
    assert.ok((await shell.text()).includes('spa-shell'));
    const health = await fetch(`${instance.url}/api/health`);
    assert.equal(health.status, 200);
    const login = await fetch(`${instance.url}/api/auth/demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'student' }),
    });
    assert.equal(login.status, 200);
    assert.ok(/Path=\//i.test(login.headers.get('set-cookie')));
  } finally {
    await instance.close();
  }
});

test('deploy: production static assets keep their cache and security headers under a base path', async () => {
  const instance = await bootUnder('/school');
  try {
    const asset = await fetch(`${instance.url}/school/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('cache-control') || '', /immutable/);
    const shell = await fetch(`${instance.url}/school/`);
    assert.ok(shell.headers.get('content-security-policy'), 'helmet must stay active');
    const escaped = await fetch(`${instance.url}/school/assets/../index.html`);
    assert.ok([200, 301, 404].includes(escaped.status));
  } finally {
    await instance.close();
  }
});
