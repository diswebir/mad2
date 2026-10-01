import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { zipSync } from 'fflate';
const root = process.cwd();
// بستهٔ دمو: همان برنامه، ولی با فایلی که مراحل راه‌اندازی دمو روی cPanel را
// کنار خودش دارد تا مشتری/همکار بدون خواندن مستندات هم بتواند بالا بیاورد.
const demo = process.argv.includes('--demo');
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
if (demo) {
  entries['START-HERE-DEMO.txt'] = [
    Buffer.from(
      [
        'مدرسه‌یار — بستهٔ نمایشی برای cPanel',
        '=====================================',
        '',
        '۱) پوشهٔ خصوصی مثل /home/CPANEL_USER/madresehyar بسازید (خارج از public_html) و همین ZIP را آنجا Extract کنید.',
        '۲) در Setup Node.js App:  Application root = madresehyar  ·  Application URL = دامنه یا /school',
        '   Startup file = app.cjs  ·  Node.js 20.19+  ·  سپس Run NPM Install',
        '۳) متغیرهای محیطی زیر را وارد کنید و Restart بزنید:',
        '',
        '   NODE_ENV=development',
        '   DEMO_MODE=true',
        '   DATA_DIR=/home/CPANEL_USER/madresehyar-demo-data',
        '   BASE_PATH=            (خالی برای دامنه؛ برای زیرپوشه مثل /school بگذارید)',
        '   TRUST_PROXY=1',
        '',
        '۴) پس از Restart، صفحهٔ ورود باز است و دادهٔ نمایشی ساخته می‌شود.',
        '   ورود مدیر: admin   ·   رمز: School@1405   (معلم teacher، دانش‌آموز student، ولی parent)',
        '',
        '۵) برای شروع تازه: پوشهٔ DATA_DIR را پاک کنید و Restart بزنید؛ دادهٔ دمو از نو ساخته می‌شود.',
        '',
        'هشدارها:',
        '  · DEMO_MODE در NODE_ENV=production اجرا نمی‌شود؛ این نصب فقط برای نمایش است.',
        '  · هرگز دادهٔ واقعی مدرسه را روی نصب دمو وارد نکنید؛ برای مدرسهٔ واقعی بستهٔ اصلی',
        '    madresehyar-cpanel.zip را با DEMO_MODE=false و NODE_ENV=production نصب کنید.',
        '  · راهنمای کامل: docs/CPANEL-INSTALL.md',
        '',
      ].join('\n'),
      'utf8',
    ),
    { mtime: new Date('2026-01-01T00:00:00Z') },
  ];
}
// کلید عمومی فروشنده به‌طور خودکار داخل بستهٔ فروشی قرار می‌گیرد تا مشتری
// فقط لایسنسش را کنار داده بگذارد و هیچ فایل کدی را دست نزند.
const publicKeyFile = 'license-keys/license-public.pem';
let keyEmbedded = false;
if (fs.existsSync(publicKeyFile) && entries['shared/license.js']) {
  const pem = fs.readFileSync(publicKeyFile, 'utf8').trim();
  const original = entries['shared/license.js'][0].toString('utf8');
  const patched = original.replace(
    "export const VENDOR_PUBLIC_KEY = '';",
    `export const VENDOR_PUBLIC_KEY = \`${pem}\`;`,
  );
  if (patched !== original) {
    entries['shared/license.js'] = [Buffer.from(patched, 'utf8'), entries['shared/license.js'][1]];
    keyEmbedded = true;
  }
}
const output = demo ? 'artifacts/madresehyar-demo-cpanel.zip' : 'artifacts/madresehyar-cpanel.zip';
fs.mkdirSync('artifacts', { recursive: true });
const bytes = zipSync(entries, { level: 8 });
fs.writeFileSync(output, bytes);
const digest = crypto.createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(`${output}.sha256`, `${digest}  ${path.basename(output)}\n`);
console.log(
  `Ready: ${output} (${(bytes.length / 1024 / 1024).toFixed(2)} MB)${demo ? '  [demo build]' : ''}`,
);
console.log(
  'Private database, uploads, install keys, sessions, .env, .git and node_modules are NOT included.',
);
