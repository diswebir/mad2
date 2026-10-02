// تست‌های بستهٔ نصب: ZIP باید «همان‌طور که مشتری روی cPanel نصب می‌کند» بالا بیاید.
// این تست‌ها دقیقاً همان مسیری را بازسازی می‌کنند که خطای ۵۰۳ / ERR_MODULE_NOT_FOUND
// (نبود fflate در نصب production) را ساخت — پس هرگز نباید ضعیف شوند.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { unzipSync } from 'fflate';

const repoRoot = process.cwd();
let workDir;
let unpacked;

const unzipPackage = (zipPath, dest) => {
  const files = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
  for (const [name, bytes] of Object.entries(files)) {
    const target = path.join(dest, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
};

const bootUnpacked = async (cwd, extraEnv = {}) => {
  const port = 4600 + Math.floor(Math.random() * 260);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madresehyar-pack-data-'));
  const child = spawn(process.execPath, ['app.cjs'], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DEMO_MODE: 'true',
      DATA_DIR: dataDir,
      PORT: String(port),
      LICENSE_MODE: 'off',
      INSTALL_TOKEN: '',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (chunk) => (log += chunk));
  child.stderr.on('data', (chunk) => (log += chunk));
  let health = null;
  for (let attempt = 0; attempt < 90 && !health; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) health = await response.json();
    } catch {
      /* هنوز بالا نیامده */
    }
    if (!health) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return {
    health,
    log,
    async stop() {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
};

before(() => {
  if (!fs.existsSync(path.join(repoRoot, 'dist/index.html'))) {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  }
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madresehyar-pack-'));
  const zipPath = path.join(workDir, 'demo.zip');
  execFileSync(process.execPath, ['scripts/package.mjs', '--demo', '--out', zipPath], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, NODE_ENV: '' },
  });
  unpacked = path.join(workDir, 'unpacked');
  fs.mkdirSync(unpacked, { recursive: true });
  unzipPackage(zipPath, unpacked);
});
after(() => {
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
});

test('pack: runtime dependencies (fflate, express, sql.js) ship inside the ZIP', () => {
  for (const pkg of ['fflate', 'express', 'sql.js', 'bcryptjs', 'zod']) {
    assert.ok(
      fs.existsSync(path.join(unpacked, 'node_modules', pkg)),
      `node_modules/${pkg} must be bundled — users must not need NPM install`,
    );
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(unpacked, 'package.json'), 'utf8'));
  assert.ok(manifest.dependencies.fflate, 'fflate must be a production dependency');
  assert.ok(!manifest.devDependencies?.fflate, 'fflate must not live in devDependencies');
});

test('pack: boots out of the box on cPanel/Passenger (NODE_ENV=production, no NPM install)', async () => {
  const boot = await bootUnpacked(unpacked);
  try {
    assert.ok(boot.health, `demo ZIP did not boot without NPM install; log: ${boot.log}`);
    assert.equal(boot.health.status, 'ok');
    assert.equal(boot.health.installed, true);
    assert.ok(boot.log.includes('demo mode'), `expected demo mode in log: ${boot.log}`);
  } finally {
    await boot.stop();
  }
});

test('pack: "Run NPM Install" fallback (production npm install) also boots', async () => {
  // دقیقاً همان کاری که دکمهٔ Run NPM Install در حالت production انجام می‌دهد؛
  // اگر وابستگیِ اجرا در devDependencies گم شده باشد، همین تست خطا می‌دهد.
  const fallback = path.join(workDir, 'fallback');
  fs.mkdirSync(fallback, { recursive: true });
  unzipPackage(path.join(workDir, 'demo.zip'), fallback);
  fs.rmSync(path.join(fallback, 'node_modules'), { recursive: true, force: true });
  execFileSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--no-audit', '--no-fund'],
    {
      cwd: fallback,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, NODE_ENV: 'production' },
    },
  );
  const boot = await bootUnpacked(fallback);
  try {
    assert.ok(boot.health, `fallback NPM install did not boot; log: ${boot.log}`);
    assert.equal(boot.health.status, 'ok');
  } finally {
    await boot.stop();
  }
});
