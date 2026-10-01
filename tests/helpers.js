import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/database.js';
import { seedDemo } from '../server/seed.js';
import { createApp } from '../server/app.js';

export async function auditFixture({ seed = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'madresehyar-audit-'));
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
  const db = await openDatabase({ dataDir: dir, memory: true });
  if (seed) seedDemo(db);
  const server = createApp(db, { demo: true }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  let index = 1;
  const client = () => ({
    cookie: '',
    csrf: '',
    user: null,
    ip: `10.5.0.${index++}`,
    async request(route, { method = 'GET', body, raw = false, headers = {} } = {}) {
      const isForm = body instanceof FormData;
      const response = await fetch(`${url}/api${route}`, {
        method,
        headers: {
          'X-Forwarded-For': this.ip,
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          ...(this.csrf ? { 'X-CSRF-Token': this.csrf } : {}),
          ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
      });
      const cookie = response.headers.get('set-cookie');
      if (cookie) this.cookie = cookie.split(';')[0];
      const data = raw
        ? Buffer.from(await response.arrayBuffer())
        : await response.json().catch(() => null);
      if (data?.csrf) this.csrf = data.csrf;
      if (data?.user) this.user = data.user;
      return { status: response.status, data, headers: response.headers };
    },
    async demo(role) {
      const response = await this.request('/auth/demo', { method: 'POST', body: { role } });
      assert.equal(response.status, 200, JSON.stringify(response.data));
      return this;
    },
    async login(username, password = 'School@1405') {
      const response = await this.request('/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      assert.equal(response.status, 200, JSON.stringify(response.data));
      return this;
    },
  });
  return {
    db,
    dir,
    url,
    client,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
export const uploadText = async (client, context, content = 'private audit evidence') => {
  const body = new FormData();
  body.append('file', new Blob([content]), 'audit-note.txt');
  const result = await client.request(`/files?context=${context}`, { method: 'POST', body });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.id;
};
