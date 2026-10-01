#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  ALL_MODULES,
  BASE_MODULES,
  EDITION_PRESETS,
  capabilityCount,
  moduleLabel,
  signLicense,
  verifyLicense,
  stableSerialize,
} from '../shared/license.js';
import { moduleDefs } from '../shared/catalog.js';

const HELP = `
ابزار لایسنس مدرسه‌یار — برای فروش ماژولار (مادام‌العمر، بدون اشتراک)

  node scripts/license.mjs list
      فهرست ماژول‌ها، تعداد قابلیت هر ماژول و بسته‌های آمادهٔ فروش.

  node scripts/license.mjs keygen [--out ./license-keys]
      ساخت یک‌بارهٔ جفت‌کلید فروشنده. کلید خصوصی را محرمانه و خارج از مخزن نگه دارید؛
      کلید عمومی را در نسخه‌ای که به مشتری می‌فروشید قرار دهید
      (متغیر LICENSE_PUBLIC_KEY روی هاست یا ثابت VENDOR_PUBLIC_KEY در shared/license.js).

  node scripts/license.mjs issue --customer "دبستان شهید الف" [گزینه‌ها]
      ساخت فایل لایسنس امضاشده برای یک مدرسه.
      گزینه‌ها:
        --customer "نام مدرسه"      (الزامی) نام مشتری روی لایسنس
        --school   "نام نمایشی"     نامی که در پنل دیده می‌شود
        --edition  base|standard|complete|custom   بستهٔ آماده (پیش‌فرض custom)
        --modules  finance,library,meetings        فهرست ماژول‌های فروخته‌شده
        --features exports.xlsx,settings.messaging قابلیت‌های خاص خارج از فهرست ماژول
        --id       MY-1405-0042     شمارهٔ سریال لایسنس (پیش‌فرض خودکار)
        --note     "شعبه مرکزی"     یادداشت قرارداد
        --expires  2027-06-30       فقط اگر لایسنس زمان‌دار فروخته‌اید (پیش‌فرض: مادام‌العمر)
        --key      ./license-keys/license-private.pem
        --out      ./license-keys/school.json
        --quiet                     فقط مسیر فایل خروجی را چاپ کن

  node scripts/license.mjs inspect --license ./license-keys/school.json [--key PUBLIC.pem]
      بررسی اعتبار و نمایش ماژول‌های یک لایسنس (بدون نیاز به کلید خصوصی).
`;

const MODULES = moduleDefs.map((m) => m.id);

const fail = (message) => {
  console.error(`✖ ${message}`);
  process.exit(1);
};

const splitList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function printCatalog() {
  console.log('\nماژول‌های قابل فروش:\n');
  for (const id of MODULES) {
    const mark = BASE_MODULES.includes(id) ? ' · پایه' : '';
    console.log(
      `  ${id.padEnd(16)} ${moduleLabel(id).padEnd(22)} ${capabilityCount(id)} قابلیت${mark}`,
    );
  }
  console.log('\nبسته‌های آماده:');
  for (const [key, preset] of Object.entries(EDITION_PRESETS))
    console.log(
      `  ${key.padEnd(10)} ${preset.label.padEnd(12)} ${preset.modules.length} ماژول: ${preset.modules.join(', ')}`,
    );
  console.log('\nنمونهٔ فروش: پایه + ماژول‌های انتخابی، با سریال اختصاصی هر مدرسه.\n');
}

function keygen(options) {
  const dir = path.resolve(options.out || 'license-keys');
  fs.mkdirSync(dir, { recursive: true });
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privateFile = path.join(dir, 'license-private.pem');
  const publicFile = path.join(dir, 'license-public.pem');
  fs.writeFileSync(privateFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
    mode: 0o600,
  });
  fs.writeFileSync(publicFile, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log(`✔ کلید خصوصی: ${privateFile}  ← این فایل را به هیچ‌کس ندهید و در git نگه ندارید.`);
  console.log(`✔ کلید عمومی: ${publicFile}`);
  console.log('\nکلید عمومی را در نسخهٔ فروشی قرار دهید؛ یکی از دو راه:');
  console.log('  ۱) در فایل .env روی هاست (کلید یک‌خطی با \\n):');
  console.log(`     LICENSE_MODE=on`);
  console.log(
    `     LICENSE_PUBLIC_KEY="${fs.readFileSync(publicFile, 'utf8').replace(/\n/g, '\\n').trim()}"`,
  );
  console.log(
    '  ۲) یا پیش از ساخت بسته، مقدار VENDOR_PUBLIC_KEY را در shared/license.js جای‌گذاری کنید.',
  );
  console.log(
    `\nسپس با کلید خصوصی برای هر مشتری لایسنس بسازید:\n  node scripts/license.mjs issue --customer "نام مدرسه" --edition standard --key ${privateFile}`,
  );
}

function issue(options) {
  const customer = String(options.customer || '').trim();
  if (!customer) fail('نام مشتری لازم است: --customer "نام مدرسه"');
  const keyFile = path.resolve(options.key || 'license-keys/license-private.pem');
  if (!fs.existsSync(keyFile)) fail(`کلید خصوصی پیدا نشد: ${keyFile} (اول keygen را اجرا کنید)`);
  const edition = String(options.edition || 'custom').toLowerCase();
  let modules = splitList(options.modules);
  if (!modules.length && EDITION_PRESETS[edition]) modules = [...EDITION_PRESETS[edition].modules];
  if (edition !== 'custom' && EDITION_PRESETS[edition] && splitList(options.modules).length)
    modules = Array.from(new Set([...EDITION_PRESETS[edition].modules, ...modules]));
  if (!modules.length)
    fail('فهرست ماژول‌ها خالی است: --modules finance,library یا --edition standard');
  // ماژول‌های پایه در قرارداد همهٔ مشتریان هست؛ فایل لایسنس هم همان‌ها را فهرست می‌کند.
  modules = Array.from(new Set([...BASE_MODULES, ...modules]));
  const unknown = modules.filter((id) => !MODULES.includes(id));
  if (unknown.length) fail(`ماژول ناشناس: ${unknown.join(', ')}`);
  const features = splitList(options.features);
  const year = new Date().toLocaleDateString('fa-IR-u-nu-latn', { year: 'numeric' }).slice(0, 4);
  const payload = {
    v: '1.1.0',
    id: String(options.id || `MY-${year}-${crypto.randomInt(1000, 9999)}`).trim(),
    customer,
    school: String(options.school || customer).trim(),
    edition: EDITION_PRESETS[edition] ? edition : 'custom',
    modules,
    features,
    issued: new Date().toISOString().slice(0, 10),
    expires: String(options.expires || '').trim(),
    note: String(options.note || '').trim(),
  };
  const doc = signLicense(payload, fs.readFileSync(keyFile, 'utf8'));
  const outDir = path.resolve(options.out ? path.dirname(options.out) : 'license-keys');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.resolve(options.out || path.join(outDir, `${payload.id}.json`));
  fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  if (options.quiet) {
    console.log(out);
    return;
  }
  const key = Buffer.from(JSON.stringify(doc), 'utf8').toString('base64');
  console.log(`✔ لایسنس ساخته شد: ${out}`);
  console.log(`  مشتری: ${payload.customer} · سریال: ${payload.id}`);
  console.log(`  ماژول‌ها (${modules.length}): ${modules.map(moduleLabel).join('، ')}`);
  if (features.length) console.log(`  قابلیت‌های خاص: ${features.join(', ')}`);
  console.log('\nنصب روی سرور مشتری (یکی از دو راه):');
  console.log(`  ۱) فایل را در پوشهٔ داده بگذارید:  DATA_DIR/license.json`);
  console.log(`  ۲) یا در .env:  LICENSE_KEY="${key}"`);
  console.log('  و روی همان هاست:  LICENSE_MODE=on  ·  سپس برنامه را Restart کنید.');
  console.log('\nبازبینی روی سرور مشتری:  تنظیمات → وضعیت سرویس  (یا /api/status)');
}

function inspect(options) {
  const file = path.resolve(options.license || '');
  if (!file || !fs.existsSync(file))
    fail('مسیر لایسنس را بدهید: --inspect --license ./license-keys/school.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const publicKey = options.key
    ? fs.readFileSync(path.resolve(options.key), 'utf8')
    : fs.existsSync('license-keys/license-public.pem')
      ? fs.readFileSync('license-keys/license-public.pem', 'utf8')
      : '';
  const result = publicKey
    ? verifyLicense(doc, publicKey)
    : { valid: false, reason: 'PUBLIC_KEY_MISSING' };
  console.log(`سریال: ${doc.payload?.id || '—'} · مشتری: ${doc.payload?.customer || '—'}`);
  console.log(
    `بسته: ${doc.payload?.edition || '—'} · صدور: ${doc.payload?.issued || '—'} · انقضا: ${doc.payload?.expires || 'مادام‌العمر'}`,
  );
  console.log(`ماژول‌ها: ${(doc.payload?.modules || []).map(moduleLabel).join('، ')}`);
  if (doc.payload?.features?.length)
    console.log(`قابلیت‌های خاص: ${doc.payload.features.join(', ')}`);
  console.log(`امضا: ${result.valid ? 'معتبر ✔' : `نامعتبر ✖ (${result.reason})`}`);
  console.log(
    `اثر انگشت محتوا: ${crypto.createHash('sha256').update(stableSerialize(doc.payload)).digest('hex').slice(0, 16)}`,
  );
  if (ALL_MODULES.length && !result.valid) process.exitCode = 2;
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    customer: { type: 'string' },
    school: { type: 'string' },
    edition: { type: 'string' },
    modules: { type: 'string' },
    features: { type: 'string' },
    id: { type: 'string' },
    note: { type: 'string' },
    expires: { type: 'string' },
    key: { type: 'string' },
    license: { type: 'string' },
    quiet: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

const command = positionals[0];
if (!command || values.help) {
  console.log(HELP.trim());
  process.exit(command ? 0 : 1);
}
if (command === 'list') printCatalog();
else if (command === 'keygen') keygen(values);
else if (command === 'issue') issue(values);
else if (command === 'inspect') inspect(values);
else fail(`دستور ناشناس: ${command}\n${HELP}`);
