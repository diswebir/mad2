// فروش ماژولار: امضا، اعتبارسنجی و اعمال لایسنس روی ماژول‌ها.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { auditFixture } from './helpers.js';
import {
  ALL_MODULES,
  BASE_MODULES,
  resolveEntitlement,
  signLicense,
  verifyLicense,
  loadEntitlement,
  stableSerialize,
} from '../shared/license.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' });
const OTHER_PEM = crypto.generateKeyPairSync('ed25519').publicKey.export({
  type: 'spki',
  format: 'pem',
});

const paidLicense = (modules, extra = {}) =>
  resolveEntitlement({
    mode: 'on',
    doc: signLicense(
      {
        id: 'TEST-0001',
        customer: 'دبستان آزمایشی',
        edition: 'custom',
        modules,
        issued: '2026-10-01',
        ...extra,
      },
      PRIVATE_PEM,
    ),
    publicKey: PUBLIC_PEM,
  });

test('license: signature round-trips and any payload change is rejected', () => {
  const payload = { id: 'X-1', customer: 'مدرسه', modules: ['finance'], issued: '2026-10-01' };
  const doc = signLicense(payload, PRIVATE_PEM);
  assert.equal(verifyLicense(doc, PUBLIC_PEM).valid, true);
  assert.equal(verifyLicense(doc, OTHER_PEM).valid, false);
  assert.equal(verifyLicense(doc, OTHER_PEM).reason, 'LICENSE_SIGNATURE');
  const tampered = {
    ...doc,
    payload: { ...doc.payload, modules: [...doc.payload.modules, 'library'] },
  };
  assert.equal(verifyLicense(tampered, PUBLIC_PEM).valid, false);
  const repriced = { ...doc, payload: { ...doc.payload, customer: 'مدرسه دیگر' } };
  assert.equal(verifyLicense(repriced, PUBLIC_PEM).valid, false);
  assert.equal(verifyLicense({ payload, signature: '' }, PUBLIC_PEM).reason, 'LICENSE_MALFORMED');
});

test('license: open mode keeps every module available and needs no key', () => {
  const open = loadEntitlement({ env: {} });
  assert.equal(open.enforced, false);
  assert.equal(open.modules.length, ALL_MODULES.length);
  const missing = resolveEntitlement({ mode: 'on', doc: null, publicKey: PUBLIC_PEM });
  assert.equal(missing.valid, false);
  assert.equal(missing.reason, 'LICENSE_MISSING');
  assert.deepEqual(missing.modules, BASE_MODULES);
});

test('license: expiry, unknown modules and empty payloads are handled', () => {
  const expired = paidLicense(['finance'], { expires: '2020-01-01' });
  assert.equal(expired.valid, false);
  assert.equal(expired.reason, 'LICENSE_EXPIRED');
  assert.deepEqual(expired.modules, BASE_MODULES);
  const lifetime = paidLicense(['finance']);
  assert.equal(lifetime.valid, true);
  assert.equal(lifetime.reason, 'OK');
  const weird = paidLicense(['finance', 'nope-not-a-module']);
  assert.equal(weird.modules.includes('finance'), true);
  assert.equal(weird.modules.includes('nope-not-a-module'), false);
  const empty = resolveEntitlement({
    mode: 'on',
    doc: signLicense({ id: 'E', customer: 'x', modules: ['nope'] }, PRIVATE_PEM),
    publicKey: PUBLIC_PEM,
  });
  assert.equal(empty.reason, 'LICENSE_EMPTY');
  assert.ok(stableSerialize({ b: 1, a: [{ d: 2, c: 3 }] }).indexOf('"a"') === 1);
});

test('license: enforced server restricts APIs, base modules keep working', async () => {
  // گزارش بدهکاران داخل ماژول «گزارش‌ها» است، پس همان ماژول هم خریده می‌شود.
  const license = paidLicense([...BASE_MODULES, 'finance', 'reports']);
  const f = await auditFixture({ license });
  try {
    const admin = await f.client().login('admin');
    const config = await admin.request('/config');
    assert.equal(config.status, 200);
    assert.equal(config.data.license.mode, 'on');
    assert.equal(config.data.license.valid, true);
    assert.equal(config.data.license.customer, 'دبستان آزمایشی');
    const finance = config.data.modules.find((m) => m.id === 'finance');
    const library = config.data.modules.find((m) => m.id === 'library');
    assert.equal(finance.entitled, true);
    assert.equal(library.entitled, false);
    assert.equal(config.data.features.find((f) => f.id === 'reports.debtors').entitled, true);
    assert.equal(config.data.features.find((f) => f.id === 'library.reserve').entitled, false);
    assert.ok(config.data.entitled_count < config.data.feature_count);

    const paid = await admin.request('/finance/debtors');
    assert.equal(paid.status, 200, JSON.stringify(paid.data));
    const unpaid = await admin.request('/library/reservations');
    assert.equal(unpaid.status, 403);
    assert.equal(unpaid.data.code, 'LICENSE_REQUIRED');
    const base = await admin.request('/entities/students?limit=1');
    assert.equal(base.status, 200);
    // فهرست CRUD ماژول نخریده هم باید بسته باشد، نه فقط API اختصاصی آن.
    const blockedList = await admin.request('/entities/visitors?limit=1');
    assert.equal(blockedList.status, 403);
    assert.equal(blockedList.data.code, 'LICENSE_REQUIRED');
    const blockedExport = await admin.request('/entities/books/export');
    assert.equal(blockedExport.status, 403);

    const enable = await admin.request('/settings/modules/library', {
      method: 'PATCH',
      body: { enabled: true },
    });
    assert.equal(enable.status, 403);
    assert.equal(enable.data.code, 'LICENSE_REQUIRED');
    const toggleFeature = await admin.request('/settings/features/library.reserve', {
      method: 'PATCH',
      body: { enabled: true },
    });
    assert.equal(toggleFeature.status, 403);

    const status = await admin.request('/status');
    assert.equal(status.status, 200);
    assert.equal(status.data.license.valid, true);
    assert.equal(status.data.license.license_id, 'TEST-0001');
    assert.equal(status.data.license.modules.includes('finance'), true);
  } finally {
    await f.close();
  }
});

test('license: an invalid license downgrades to base modules and says why', async () => {
  const foreign = resolveEntitlement({
    mode: 'on',
    doc: signLicense({ id: 'F-1', customer: 'دیگر', modules: ALL_MODULES }, PRIVATE_PEM),
    publicKey: OTHER_PEM,
  });
  assert.equal(foreign.reason, 'LICENSE_SIGNATURE');
  const f = await auditFixture({ license: foreign });
  try {
    const admin = await f.client().login('admin');
    const config = await admin.request('/config');
    assert.equal(config.data.license.valid, false);
    assert.deepEqual(config.data.license.modules, BASE_MODULES);
    const blocked = await admin.request('/finance/debtors');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.code, 'LICENSE_REQUIRED');
    const allowed = await admin.request('/analysis/my-day');
    assert.equal(allowed.status, 200, JSON.stringify(allowed.data));
  } finally {
    await f.close();
  }
});

test('license: the issue CLI writes a file the server accepts end to end', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'madresehyar-license-'));
  try {
    execFileSync('node', ['scripts/license.mjs', 'keygen', '--out', path.join(dir, 'keys')], {
      cwd: process.cwd(),
    });
    const privateFile = path.join(dir, 'keys', 'license-private.pem');
    const publicFile = path.join(dir, 'keys', 'license-public.pem');
    assert.ok(fs.existsSync(privateFile));
    const out = path.join(dir, 'school.json');
    const printed = execFileSync(
      'node',
      [
        'scripts/license.mjs',
        'issue',
        '--customer',
        'دبیرستان نمونه',
        '--edition',
        'standard',
        '--modules',
        'meetings',
        '--key',
        privateFile,
        '--out',
        out,
        '--quiet',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    ).trim();
    assert.equal(printed, out);
    const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.ok(doc.payload.modules.includes('finance'));
    assert.ok(doc.payload.modules.includes('meetings'));
    assert.equal(verifyLicense(doc, fs.readFileSync(publicFile, 'utf8')).valid, true);

    const dataDir = path.join(dir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.copyFileSync(out, path.join(dataDir, 'license.json'));
    const loaded = loadEntitlement({
      dir: dataDir,
      env: { LICENSE_MODE: 'on', LICENSE_PUBLIC_KEY_PATH: publicFile },
    });
    assert.equal(loaded.valid, true);
    assert.deepEqual(loaded.modules, doc.payload.modules);
    assert.equal(loaded.payload.customer, 'دبیرستان نمونه');

    // بدون کلید عمومی روی هاست، لایسنس نمی‌تواند تأیید شود و سامانه پایین‌می‌آید.
    const noKey = loadEntitlement({ dir: dataDir, env: { LICENSE_MODE: 'on' } });
    assert.equal(noKey.valid, false);
    assert.deepEqual(noKey.modules, BASE_MODULES);

    const inspected = execFileSync(
      'node',
      ['scripts/license.mjs', 'inspect', '--license', out, '--key', publicFile],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    assert.match(inspected, /معتبر/);
    assert.match(inspected, /دبیرستان نمونه/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('license: base modules always stay available next to the purchased ones', () => {
  const license = paidLicense(['finance']);
  for (const id of BASE_MODULES) assert.equal(license.modules.includes(id), true, id);
  assert.equal(license.modules.includes('finance'), true);
  assert.equal(license.modules.includes('library'), false);
  const fromEnv = loadEntitlement({
    env: {
      LICENSE_MODE: 'on',
      LICENSE_KEY: JSON.stringify(
        signLicense({ id: 'N', customer: 'x', modules: ['finance'] }, PRIVATE_PEM),
      ),
      LICENSE_PUBLIC_KEY: PUBLIC_PEM,
    },
  });
  assert.equal(fromEnv.valid, true);
  assert.equal(fromEnv.modules.includes('finance'), true);
  assert.equal(fromEnv.modules.includes('meetings'), false);
});

test('license: the simple wizard creates keys and a verifiable license by itself', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'madresehyar-wizard-'));
  const script = path.resolve('scripts/license-wizard.mjs');
  try {
    // پاسخ‌ها به همان ترتیبی که جادوگر می‌پرسد: نام مدرسه، سریال خودکار، بستهٔ ۲ (استاندارد)،
    // یادداشت خالی، و مادام‌العمر بودن.
    const output = execFileSync('node', [script], {
      cwd: dir,
      encoding: 'utf8',
      input: 'دبستان آزمایشی جادوگر\n\n2\n\nبله\n',
    });
    const privateFile = path.join(dir, 'license-keys', 'license-private.pem');
    const publicFile = path.join(dir, 'license-keys', 'license-public.pem');
    assert.ok(fs.existsSync(privateFile));
    assert.ok(fs.existsSync(publicFile));
    assert.match(output, /لایسنس ساخته شد/);
    assert.match(output, /دبستان آزمایشی جادوگر/);
    const issued = fs
      .readdirSync(path.join(dir, 'license-keys'))
      .filter((name) => name.startsWith('MY-'));
    assert.equal(issued.length, 1);
    const doc = JSON.parse(fs.readFileSync(path.join(dir, 'license-keys', issued[0]), 'utf8'));
    assert.equal(doc.payload.customer, 'دبستان آزمایشی جادوگر');
    assert.equal(verifyLicense(doc, fs.readFileSync(publicFile, 'utf8')).valid, true);
    for (const id of ['finance', 'library', 'reports']) assert.ok(doc.payload.modules.includes(id));
    assert.equal(doc.payload.expires, '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
