#!/usr/bin/env node
// جادوگر سادهٔ ساخت لایسنس: بدون حفظ‌کردن دستور و گزینه، فقط به سؤال‌ها جواب می‌دهید.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { signLicense, verifyLicense, EDITION_PRESETS, BASE_MODULES } from '../shared/license.js';
import { moduleDefs, featureDefs } from '../shared/catalog.js';

const KEYS_DIR = 'license-keys';
const PRIVATE_FILE = path.join(KEYS_DIR, 'license-private.pem');
const PUBLIC_FILE = path.join(KEYS_DIR, 'license-public.pem');
const CAPS = (id) => featureDefs.filter((f) => f.module === id).length;
const MODULES = moduleDefs.map((m) => ({ ...m, caps: CAPS(m.id) }));
const EXTRA = [...BASE_MODULES, 'finance', 'library', 'meetings', 'services', 'reports'];

// در حالت تعاملی (ترمینال) سؤال پرسیده می‌شود؛ اگر ورودی از فایل/پایپ بیاید،
// پاسخ‌ها خط‌به‌خط خوانده می‌شوند تا آزمون خودکار هم ممکن باشد.
const interactive = !!process.stdin.isTTY;
const pipedAnswers = interactive ? [] : fs.readFileSync(0, 'utf8').split('\n');
let pipedIndex = 0;
const rl = interactive
  ? readline.createInterface({ input: process.stdin, output: process.stdout })
  : { close: () => {} };
const ask = async (question, fallback = '') => {
  if (!interactive) {
    const answer = (pipedAnswers[pipedIndex++] ?? '').trim();
    console.log(`${question}${answer || `(خالی → ${fallback || '—'})`}`);
    return answer || fallback;
  }
  const answer = (await rl.question(question)).trim();
  return answer || fallback;
};
const askYes = async (question) => {
  const raw = await ask(`${question} (بله/خیر) `);
  return ['بله', 'ب', 'y', 'yes', 'آره', 'اره', 'بلی'].includes(String(raw).toLowerCase());
};

function makeKeys() {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(PRIVATE_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
    mode: 0o600,
  });
  fs.writeFileSync(PUBLIC_FILE, publicKey.export({ type: 'spki', format: 'pem' }));
}

function printModuleMenu() {
  console.log('\n📦 ماژول‌های افزودنی موجود (پایه همیشه همراه همه است):\n');
  MODULES.filter((m) => !BASE_MODULES.includes(m.id)).forEach((m, index) => {
    console.log(`  ${index + 1}) ${m.name}  —  ${m.caps} قابلیت`);
  });
  console.log('');
}

function moduleByNumber(number) {
  return MODULES.filter((m) => !BASE_MODULES.includes(m.id))[Number(number) - 1];
}

async function main() {
  console.log('\n====================================================');
  console.log('  ابزار سادهٔ ساخت لایسنس مدرسه‌یار (نسخهٔ فروشنده)');
  console.log('====================================================\n');

  if (!fs.existsSync(PRIVATE_FILE)) {
    console.log(
      'اولین بار است که این ابزار را اجرا می‌کنید؛ پس اول «کلیدهای فروشنده» ساخته می‌شوند.',
    );
    console.log('این کلیدها دست شما را در ساخت لایسنس امضاشده نشان می‌دهند.\n');
    makeKeys();
    console.log(
      `✅ کلید خصوصی ساخته شد: ${PRIVATE_FILE}   ← این فایل را مثل کلید خانه پیش خودتان نگه دارید.`,
    );
    console.log(`✅ کلید عمومی ساخته شد: ${PUBLIC_FILE}\n`);
    console.log('مهم: فایل کلید خصوصی را به هیچ‌کس ندهید و در اینترنت نگذارید.');
    console.log(
      'قبل از بسته‌بندی برای فروش، دستور «npm run package:cpanel» کلید عمومی را خودش داخل بسته می‌گذارد.\n',
    );
  }

  const school = await ask('۱) نام مدرسه (همان که روی لایسنس چاپ می‌شود): ');
  if (!school) {
    console.log('نام مدرسه لازم است. دوباره اجرا کنید.');
    rl.close();
    process.exit(1);
  }
  const year = new Date().toLocaleDateString('fa-IR-u-nu-latn', { year: 'numeric' }).slice(0, 4);
  const serial = await ask(
    `۲) شمارهٔ سریال (خالی بگذارید تا خودم بسازم): `,
    `MY-${year}-${crypto.randomInt(1000, 9999)}`,
  );

  console.log('\n۳) کدام بسته را فروختید؟');
  console.log('   ۱) پایه            (۱۲ ماژول هستهٔ مدرسه)');
  console.log('   ۲) استاندارد       (پایه + مالی + کتابخانه + گزارش‌ها)');
  console.log('   ۳) کامل            (همهٔ ۱۷ ماژول)');
  console.log('   ۴) دلخواه          (خودم ماژول‌ها را انتخاب می‌کنم)');
  const choice = await ask('   شماره را بنویسید (۱ تا ۴): ', '۲');

  let modules = [];
  if (choice === '1') modules = [...EDITION_PRESETS.base.modules];
  else if (choice === '2') modules = [...EDITION_PRESETS.standard.modules];
  else if (choice === '3') modules = [...EDITION_PRESETS.complete.modules];
  else {
    printModuleMenu();
    const picked = await ask('   شمارهٔ ماژول‌ها را با کاما بنویسید، مثلاً 1,3 : ');
    modules = picked
      .split(',')
      .map((item) => moduleByNumber(item.trim()))
      .filter(Boolean)
      .map((m) => m.id);
    if (!modules.length) {
      console.log('چیزی انتخاب نشد؛ پس بستهٔ پایه ساخته می‌شود.');
      modules = [...EDITION_PRESETS.base.modules];
    }
  }

  const edition =
    choice === '1' || choice === '2' || choice === '3'
      ? ['base', 'standard', 'complete'][Number(choice) - 1]
      : 'custom';
  const note = await ask('۴) یادداشت قرارداد (اختیاری، مثلاً «شعبهٔ مرکزی»): ');
  const lifetime = await askYes('۵) لایسنس مادام‌العمر باشد؟');
  let expires = '';
  if (!lifetime)
    expires = await ask('   تاریخ پایان (مثل 1407/06/31 یا بگذارید خالی تا مهم نباشد): ');

  const payload = {
    v: '1.1.0',
    id: serial,
    customer: school,
    school,
    edition,
    modules,
    features: [],
    issued: new Date().toISOString().slice(0, 10),
    expires,
    note,
  };
  const doc = signLicense(payload, fs.readFileSync(PRIVATE_FILE, 'utf8'));
  const out = path.join(KEYS_DIR, `${serial}.json`);
  fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  const check = verifyLicense(doc, fs.readFileSync(PUBLIC_FILE, 'utf8'));

  const minusBase = modules.filter((id) => !BASE_MODULES.includes(id));
  console.log('\n====================================================');
  console.log('✅ لایسنس ساخته شد');
  console.log('====================================================');
  console.log(`   فایل لایسنس : ${out}`);
  console.log(`   مدرسه       : ${school}`);
  console.log(`   سریال        : ${serial}`);
  console.log(`   بسته         : ${edition}  (${modules.length} ماژول)`);
  if (minusBase.length)
    console.log(
      `   ماژول‌های افزودنی: ${minusBase.map((id) => MODULES.find((m) => m.id === id)?.name).join('، ')}`,
    );
  console.log(`   انقضا        : ${expires || 'مادام‌العمر'}`);
  console.log(`   کنترل امضا   : ${check.valid ? 'معتبر ✅' : 'مشکل دارد ❌'}`);
  console.log('\n----------------------------------------------------');
  console.log('این متن را برای مدرسه بفرستید (همراه فایل لایسنس):');
  console.log('----------------------------------------------------');
  console.log(`سلام. فایل «${serial}.json» لایسنس مدرسهٔ «${school}» است.`);
  console.log('برای فعال‌سازی فقط سه کار لازم است:');
  console.log('  ۱) این فایل را در پوشهٔ دادهٔ سامانه با نام دقیق «license.json» بگذارید.');
  console.log('  ۲) در فایل تنظیمات (env) یک خط اضافه کنید:  LICENSE_MODE=on');
  console.log('  ۳) از پنل هاست، برنامه را Restart کنید.');
  console.log(
    'بعد از Restart، در «تنظیمات ← وضعیت سرویس» باید نام مدرسه و تعداد ماژول‌های خریداری‌شده را ببینید.',
  );
  console.log(
    'اگر ماژولی را نخریده باشید، در صفحهٔ «ماژول‌ها» با برچسب «خریدنی» نشان داده می‌شود.',
  );
  console.log(
    '\nیادآوری فروشنده: پیش از ارسال بسته، دستور «npm run package:cpanel» را اجرا کنید تا کلید عمومی',
  );
  console.log('به‌طور خودکار داخل بسته قرار بگیرد. کلید خصوصی را هرگز نفرستید.\n');
  rl.close();
}

main().catch((error) => {
  console.error('\n✖ خطا:', error.message);
  rl.close();
  process.exit(1);
});
