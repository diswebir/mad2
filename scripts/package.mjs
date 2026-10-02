import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
function addFrom(baseDir, prefix) {
  const walk = (dir, rel) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const abs = path.join(dir, name);
      const stat = fs.lstatSync(abs);
      const relPath = rel ? `${rel}/${name}` : name;
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        if (relPath === '.bin') continue;
        walk(abs, relPath);
      } else {
        entries[prefix + relPath] = [
          fs.readFileSync(abs),
          { mtime: new Date('2026-01-01T00:00:00Z') },
        ];
      }
    }
  };
  walk(baseDir, '');
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
// node_modules زمان اجرا داخل بسته می‌رود تا روی هاستِ cPanel اصلاً نیازی به
// «Run NPM Install» نباشد (مخصوص کاربر غیربرنامه‌نویس). فقط بسته‌های لازمِ اجرا؛
// بسته‌های build (react، vite و…) بیرون می‌مانند چون dist/ از قبل ساخته شده است.
const BUILD_ONLY = new Set([
  '@fontsource-variable/vazirmatn',
  'lucide-react',
  'react',
  'react-dom',
  'react-router-dom',
]);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const runtimeDeps = Object.fromEntries(
  Object.entries(manifest.dependencies || {}).filter(([name]) => !BUILD_ONLY.has(name)),
);
{
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'madresehyar-nm-'));
  fs.writeFileSync(
    path.join(stage, 'package.json'),
    JSON.stringify(
      {
        name: 'madresehyar-runtime',
        version: manifest.version,
        private: true,
        dependencies: runtimeDeps,
      },
      null,
      2,
    ),
  );
  execFileSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock'],
    { cwd: stage, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, NODE_ENV: '' } },
  );
  addFrom(path.join(stage, 'node_modules'), 'node_modules/');
  fs.rmSync(stage, { recursive: true, force: true });
  console.log(`Bundled runtime node_modules (${Object.keys(runtimeDeps).length} direct packages).`);
}
if (demo) {
  entries['START-HERE-DEMO.txt'] = [
    Buffer.from(
      [
        'مدرسه‌یار — بستهٔ نمایشی برای cPanel (نسخهٔ ۱.۲.۱)',
        '=================================================',
        '',
        'این بسته فقط برای نمایش و فروش است؛ هرگز دادهٔ واقعی مدرسه را داخل آن وارد نکنید.',
        '',
        'گام ۱ — پوشهٔ برنامه',
        '  در cPanel → File Manager یک پوشهٔ خصوصی بسازید (خارج از public_html)، مثل:',
        '    /home/CPANEL_USER/madresehyar',
        '  همین ZIP را در آن Upload و Extract کنید. بعد از Extract باید فایل‌های app.cjs و',
        '  package.json مستقیماً داخل madresehyar باشند (نه داخل یک پوشهٔ تو در تو).',
        '',
        'گام ۲ — پوشهٔ داده',
        '  یک پوشهٔ جدا برای دادهٔ دمو بسازید (هر بار که پاک شود، دمو از نو ساخته می‌شود):',
        '    /home/CPANEL_USER/madresehyar-demo-data',
        '',
        'گام ۳ — ساخت اپلیکیشن Node',
        '  cPanel → Setup Node.js App → Create Application:',
        '    Node.js version           = 22.x (یا 20.19+)',
        '    Application root          = madresehyar',
        '    Application URL           = دامنه/زیردامنهٔ دمو (یا مسیری مثل /demo)',
        '    Application startup file  = app.cjs',
        '  نیازی به دکمهٔ Run NPM Install نیست؛ همهٔ وابستگی‌های لازم داخل خود بسته',
        '  (پوشهٔ node_modules) آماده است. فقط اگر بعداً خطای «missing npm packages» گرفتید',
        '  همان دکمه را بزنید یا در ترمینال هاست:  npm install --omit=dev',
        '',
        'گام ۴ — فایل تنظیمات (.env)',
        '  در همان پوشهٔ madresehyar فایلی به نام دقیق .env بسازید و این‌ها را داخل آن بگذارید',
        '  (به‌جای CPANEL_USER نام کاربری هاست خودتان را بنویسید):',
        '',
        '    DEMO_MODE=true',
        '    DATA_DIR=/home/CPANEL_USER/madresehyar-demo-data',
        '    BASE_PATH=',
        '    TRUST_PROXY=1',
        '',
        '  اگر Application URL زیرپوشه است، مثلاً BASE_PATH=/demo را هم بگذارید.',
        '  (می‌توانید همین مقادیر را در بخش Environment variables صفحهٔ اپلیکیشن هم وارد کنید.)',
        '',
        'گام ۵ — اجرا',
        '  دکمهٔ Restart را بزنید و سراغ لاگ برنامه بروید (از همان صفحه یا منوی Errors).',
        '  این دو خط یعنی دمو سالم بالا آمده:',
        '    Vendor: Dis Web Company (شرکت دیس وب) - https://disweb.ir',
        '    MadresehYar is ready on port ... (demo mode)',
        '  بعد صفحهٔ سایت را باز کنید؛ دادهٔ نمایشی در اولین اجرا ساخته می‌شود.',
        '',
        'گام ۶ — ورود',
        '    مدیر      admin     School@1405',
        '    معلم      teacher   School@1405',
        '    دانش‌آموز student   School@1405',
        '    ولی       parent    School@1405',
        '  روی صفحهٔ ورود، دکمه‌های «یک نگاه به پنل‌های نمایشی» هم هست.',
        '',
        'عیب‌یابی سریع:',
        '  · صفحه ۵۰۰ داد → لاگ برنامه را بخوانید؛ معمولاً مسیر DATA_DIR اشتباه است یا',
        '    پوشهٔ داده ساخته نشده. مسیر باید کامل و از /home شروع شود.',
        '  · «Cannot find module» یا «missing npm packages» → در ترمینال هاست داخل پوشهٔ',
        '    برنامه:  npm install --omit=dev  و بعد Restart (یا دکمهٔ Run NPM Install).',
        '  · ۴۰۴ روی زیرپوشه → BASE_PATH را فراموش کرده‌اید.',
        '  · برای دموی تمیز: پوشهٔ DATA_DIR را خالی کنید و Restart بزنید.',
        '',
        'نکتهٔ مهم: نصب دمو روی NODE_ENV=production هم کار می‌کند (Passenger همیشه همین را',
        'می‌خواهد) و نیازی به تغییر آن نیست. این حالت فقط برای نمایش است؛ برای مدرسهٔ واقعی',
        'بستهٔ اصلی madresehyar-cpanel.zip را با DEMO_MODE=false نصب کنید.',
        'راهنمای کامل با تصویر: docs/CPANEL-INSTALL.md  ·  شرکت دیس وب — https://disweb.ir',
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
const outIndex = process.argv.indexOf('--out');
const output =
  outIndex > 0 && process.argv[outIndex + 1]
    ? process.argv[outIndex + 1]
    : demo
      ? 'artifacts/madresehyar-demo-cpanel.zip'
      : 'artifacts/madresehyar-cpanel.zip';
fs.mkdirSync(path.dirname(output), { recursive: true });
const bytes = zipSync(entries, { level: 6 });
fs.writeFileSync(output, bytes);
const digest = crypto.createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(`${output}.sha256`, `${digest}  ${path.basename(output)}\n`);
console.log(
  `Ready: ${output} (${(bytes.length / 1024 / 1024).toFixed(2)} MB)${demo ? '  [demo build]' : ''}`,
);
console.log(
  'Runtime node_modules IS included (no NPM install needed on the host). Private database, uploads, install keys, sessions, .env and .git are NOT included.',
);
