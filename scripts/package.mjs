import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { zipSync } from 'fflate';
const root = process.cwd();
const entries = {};
function add(relative) {
  const absolute = path.join(root, relative);
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(absolute).sort()) add(`${relative}/${name}`);
  } else {
    entries[relative] = [fs.readFileSync(absolute), { mtime: new Date('2026-01-01T00:00:00Z') }];
  }
}
if (!fs.existsSync('dist/index.html')) throw new Error('Run npm run build before packaging.');
for (const name of [
  'dist',
  'server',
  'shared',
  'src',
  'public',
  'docs',
  'tests',
  'scripts',
  'package.json',
  'package-lock.json',
  'app.cjs',
  'README.md',
  '.env.example',
  'vite.config.js',
  'playwright.config.js',
  'index.html',
  '.prettierrc.json',
  '.prettierignore',
  '.gitignore',
  'data/.gitkeep',
])
  add(name);
const output = 'artifacts/madresehyar-cpanel.zip';
fs.mkdirSync('artifacts', { recursive: true });
const bytes = zipSync(entries, { level: 8 });
fs.writeFileSync(output, bytes);
const digest = crypto.createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(`${output}.sha256`, `${digest}  madresehyar-cpanel.zip\n`);
console.log(`Ready: ${output} (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`);
console.log(
  'Private database, uploads, install keys, sessions, .env, .git and node_modules are NOT included.',
);
