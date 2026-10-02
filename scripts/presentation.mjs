#!/usr/bin/env node
// ---------------------------------------------------------------------------
// سازندهٔ «فایل ارائه» (docs/PRESENTATION.html)
// یک سند HTML کاملاً مستقل برای معرفی و فروش مدرسه‌یار: همهٔ قابلیت‌ها از
// shared/catalog.js خوانده می‌شوند تا همیشه دقیق و به‌روز باشد، فونت وزیرمتن
// به‌صورت base64 داخل فایل می‌رود و هیچ وابستگی خارجی (CDN) وجود ندارد.
//
// اجرا:  node scripts/presentation.mjs
// خروجی: docs/PRESENTATION.html
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleDefs, featureDefs, resourceDefs, roles, moduleGroups } from '../shared/catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontDir = path.join(root, 'node_modules/@fontsource-variable/vazirmatn/files');
const outPath = path.join(root, 'docs/PRESENTATION.html');

const b64 = (file) => {
  const full = path.join(fontDir, file);
  if (!fs.existsSync(full)) throw new Error(`فونت پیدا نشد: ${full} — اول npm ci را اجرا کنید.`);
  return fs.readFileSync(full).toString('base64');
};
const fontArabic = b64('vazirmatn-arabic-wght-normal.woff2');
const fontLatin = b64('vazirmatn-latin-wght-normal.woff2');
const fontLatinExt = b64('vazirmatn-latin-ext-wght-normal.woff2');

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const faNum = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

// --- نقش‌ها و شمارش قابلیت‌ها -------------------------------------------------
const roleIds = Object.keys(roles);
const featuresOf = (moduleId) => featureDefs.filter((f) => f.module === moduleId);
const roleCount = (moduleId, roleId) =>
  featuresOf(moduleId).filter((f) => (f.roles || []).includes(roleId)).length;

// --- آیکون‌های درون‌خطی (بدون هیچ فایل خارجی) ---------------------------------
const paths = {
  school: '<path d="M3 21h18M4 21V9l8-5 8 5v12M9 21v-6h6v6"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  cap: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  wallet:
    '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  shield: '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  heart:
    '<path d="M19 14c1.5-1.5 3-3.4 3-5.5A5.5 5.5 0 0 0 12 5.5 5.5 5.5 0 0 0 2 8.5c0 2.1 1.5 4 3 5.5l7 7Z"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  printer:
    '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  phone:
    '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>',
  database:
    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  sparkle:
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  phoneCall:
    '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/>',
  map: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  layers:
    '<path d="m12 2 10 5-10 5L2 7l10-5Z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
};
const icon = (name, size = 22, cls = '') =>
  `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.star}</svg>`;

const moduleIcon = {
  dashboard: 'chart',
  students: 'cap',
  teachers: 'users',
  classes: 'school',
  attendance: 'clock',
  education: 'book',
  tickets: 'message',
  announcements: 'bell',
  calendar: 'calendar',
  finance: 'wallet',
  meetings: 'users',
  library: 'book',
  services: 'map',
  reports: 'file',
  notifications: 'bell',
  profile: 'shield',
  settings: 'settings',
};

// --- محتوای اختصاصی هر تب ----------------------------------------------------
const personaAdmin = [
  {
    icon: 'chart',
    title: 'فرماندهی مدرسه در یک صفحه',
    text: 'داشبورد زنده با آمار حضور، پرداخت‌ها، کارهای امروز و فعالیت‌ها؛ بدون گشتن بین دفترها و فایل‌های پراکنده.',
  },
  {
    icon: 'wallet',
    title: 'امور مالی شفاف و بی‌حاشیه',
    text: 'شهریه، تخفیف، اقساط، جریمهٔ دیرکرد، صورتحساب و فهرست بدهکاران — محاسبات خودکار و مانده‌حساب دقیق برای هر خانواده.',
  },
  {
    icon: 'shield',
    title: 'کنترل دسترسی و امنیت اطلاعات',
    text: 'نقش‌محور و کلاس‌محور، گزارش کامل رویدادها، پشتیبان‌گیری و بازگردانی با یک کلیک؛ اطلاعات روی هاست خود مدرسه می‌ماند.',
  },
  {
    icon: 'layers',
    title: 'ماژول‌ها دستِ شماست',
    text: 'هر قابلیت را برای هر نقش روشن/خاموش کنید؛ سامانه با نیاز مدرسه شما شکل می‌گیرد، نه برعکس.',
  },
  {
    icon: 'file',
    title: 'کارنامه و گزارش‌های رسمی',
    text: 'کارنامهٔ چاپی، کارنامهٔ ترمیمی، خروجی وزارتی، خروجی Excel و PDF — هر گزارشی که جلسات و اداره می‌خواهد، در چند ثانیه.',
  },
  {
    icon: 'zap',
    title: 'پایان سال بدون دردسر',
    text: 'ارتقا و تکرار پایه، بایگانی سال‌های قبل و انتقال اطلاعات — آنچه معمولاً چند هفته وقت مدرسه را می‌گیرد، اینجا چند دقیقه است.',
  },
];
const personaTeacher = [
  {
    icon: 'clock',
    title: 'حضور و غیاب موبایلی، در چند ثانیه',
    text: 'هر دانش‌آموز یک کارت با دکمه‌های درشت؛ حاضر/غایب/تأخیر/موجه با یک انگشت و نوار «ذخیره» همیشه در دسترس. مناسب حین کلاس.',
  },
  {
    icon: 'book',
    title: 'نمرات و تکالیف بدون کاغذ',
    text: 'ثبت نمره تکی یا گروهی، تکالیف با مهلت و بررسی ارسال‌ها، آزمون‌ها و سوابق هر دانش‌آموز — همه در یک جریان کاری منظم.',
  },
  {
    icon: 'message',
    title: 'ارتباط ساخت‌یافته با خانواده',
    text: 'جلسات اولیا با رزرو وقت، تیکت و پیام خصوصی، اطلاعیه‌های کلاس و اعلان خودکار غیبت — تماس‌های تلفنی تکراری حذف می‌شود.',
  },
  {
    icon: 'calendar',
    title: 'برنامهٔ هفتگی و تقویم مدرسه',
    text: 'برنامهٔ کلاس‌ها، امتحان‌ها و رویدادها جلوی چشم است و «کارهای امروز من» هر صبح مسیر روز را روشن می‌کند.',
  },
  {
    icon: 'chart',
    title: 'روند پیشرفت را ببینید',
    text: 'نمودار روند تحصیلی و حضور هر دانش‌آموز؛ در جلسات اولیا به‌جای حدس، با عدد و نمودار صحبت کنید.',
  },
];
const personaFamily = [
  {
    icon: 'bell',
    title: 'همیشه در جریان، بدون تماس مکرر',
    text: 'اعلان غیبت، نمره، تکلیف و اطلاعیه بلافاصله به دست والدین می‌رسد؛ دیگر لازم نیست برای یک خبر ساده با مدرسه تماس بگیرید.',
  },
  {
    icon: 'check',
    title: 'مرخصی و ملاقات، بدون مراجعهٔ حضوری',
    text: 'درخواست مرخصی با گردش تأیید مدرسه، و رزرو وقت ملاقات با معلم یا مدیر در ساعتی که برای شما مناسب است.',
  },
  {
    icon: 'file',
    title: 'کارنامه و صورتحساب شفاف',
    text: 'کارنامه، نمرات و ماندهٔ شهریه/اقساط آنلاین دیده می‌شود؛ هیچ عددی مبهم نیست و همه‌چیز قابل پیگیری است.',
  },
  {
    icon: 'message',
    title: 'گفت‌وگوی امن با مدرسه',
    text: 'تیکت و پیام خصوصی با معلم یا دفتر مدرسه، همراه سابقهٔ مکالمات؛ درخواست‌ها گم نمی‌شوند.',
  },
  {
    icon: 'shield',
    title: 'دسترسی امن مخصوص خانواده',
    text: 'هر ولی فقط اطلاعات فرزند خود را می‌بیند؛ حریم خصوصی دانش‌آموزان کاملاً رعایت می‌شود.',
  },
];
const whyCards = [
  {
    icon: 'database',
    title: 'مالکیت کامل اطلاعات',
    text: 'سامانه روی هاست خود مدرسه نصب می‌شود؛ داده‌ها مال شماست و در سرور دیگران نیست.',
  },
  {
    icon: 'star',
    title: 'مادام‌العمر، بدون اشتراک',
    text: 'یک‌بار خرید، برای همیشه مال شما. هیچ تمدید اجباری ماهانه یا سالانه وجود ندارد.',
  },
  {
    icon: 'layers',
    title: 'ماژولار و منعطف',
    text: 'فقط بخش‌هایی را بخرید که لازم دارید؛ هر وقت خواستید، ماژول بعدی را اضافه کنید.',
  },
  {
    icon: 'zap',
    title: 'نصب ۱۵ دقیقه‌ای',
    text: 'روی هاست معمولی cPanel نصب می‌شود؛ بدون سرور اختصاصی و بدون تیم فنی.',
  },
  {
    icon: 'heart',
    title: 'واقعاً فارسی و راست‌چین',
    text: 'تاریخ جلالی، فونت وزیرمتن، اعداد و گزارش‌های فارسی — نه ترجمهٔ عجولانهٔ یک نرم‌افزار خارجی.',
  },
  {
    icon: 'shield',
    title: 'ساخته و پشتیبانی‌شده توسط شرکت دیس وب',
    text: 'از نصب تا آموزش و پشتیبانی، یک تیم مشخص پاسخگوی شماست: disweb.ir',
  },
];
const painRows = [
  ['اطلاعات پراکنده بین دفترها و اکسل‌ها', 'همه‌چیز در یک سامانهٔ واحد و قابل جست‌وجو'],
  ['تماس‌های تکراری خانواده‌ها برای یک خبر ساده', 'اعلان خودکار غیبت، نمره، شهریه و اطلاعیه'],
  ['محاسبهٔ دستی شهریه، اقساط و بدهکاران', 'امور مالی خودکار با صورتحساب و فهرست بدهکاران'],
  ['کارنامه‌های دست‌نویس و وقت‌گیر', 'کارنامهٔ استاندارد و خروجی وزارتی در چند ثانیه'],
  ['ترس از گم‌شدن یا خراب‌شدن پرونده‌ها', 'پشتیبان‌گیری و بازگردانی با یک کلیک'],
  ['گم‌شدن درخواست‌ها و پیام‌ها', 'تیکت، درخواست مرخصی و ملاقات با گردش کاری مشخص'],
];

// --- بسته‌های قیمتی ----------------------------------------------------------
const packages = [
  {
    name: 'پایهٔ مدرسه',
    price: '۱۸ تا ۳۵ میلیون تومان',
    note: 'بسته به تعداد دانش‌آموز',
    items: [
      '۱۲ ماژول هسته با ۱۲۹ قابلیت',
      'دانش‌آموزان، معلمان، کلاس‌ها و حضور و غیاب',
      'آموزش و نمرات، پیام و تیکت، اطلاعیه‌ها',
      'تقویم، اعلان‌ها، حساب کاربری و تنظیمات',
      'نصب روی cPanel + راهنمای فارسی',
    ],
    tone: 'plain',
  },
  {
    name: 'مدرسهٔ هوشمند',
    price: '۳۱ تا ۵۲ میلیون تومان',
    note: 'پایه + مالی + گزارش‌ها — پرفروش‌ترین',
    items: [
      'همهٔ امکانات بستهٔ پایه',
      'ماژول مالی: شهریه، تخفیف، اقساط، جریمه، بدهکاران',
      'ماژول گزارش‌ها: کارنامه، روند تحصیلی، خروجی وزارتی',
      'چاپ کارنامه و خروجی Excel / PDF',
      'آموزش حضوری یا مجازی تیم مدرسه',
    ],
    tone: 'best',
  },
  {
    name: 'بستهٔ کامل',
    price: '۳۸ تا ۵۵ میلیون تومان',
    note: 'همهٔ ماژول‌ها — حدود ۲۵٪ تخفیف',
    items: [
      'همهٔ ۱۷ ماژول و ۱۸۸ قابلیت',
      'کتابخانه، ملاقات اولیا، خدمات مدرسه',
      'پل پیامک و ایمیل (جدا از هزینهٔ سرویس‌دهنده)',
      'پشتیبان‌گیری/بازگردانی و وضعیت سرویس',
      'اولویت در پشتیبانی و آموزش کامل',
    ],
    tone: 'plain',
  },
];
const priceTable = [
  ['پایهٔ سامانه (۱۲ ماژول هسته)', '۱۸ تا ۳۵ میلیون', 'تا ۳۰۰ / تا ۶۰۰ / بیش از ۶۰۰ دانش‌آموز'],
  ['ماژول امور مالی', '۸ تا ۱۲ میلیون', 'پرفروش‌ترین افزودنی'],
  ['ماژول گزارش‌ها و کارنامه', '۷ تا ۱۰ میلیون', 'همراه چاپ و خروجی وزارتی'],
  ['ماژول کتابخانه', '۴ تا ۶ میلیون', 'امانت، رزرو، جریمه و سوابق'],
  ['ماژول ملاقات اولیا', '۳ تا ۵ میلیون', 'بازه‌های وقت‌دهی و رزرو آنلاین'],
  ['ماژول خدمات مدرسه', '۳ تا ۵ میلیون', 'سرویس، بوفه و خدمات'],
  ['بستهٔ پیامک و ایمیل', '۴ تا ۶ میلیون', 'جدا از هزینهٔ سرویس‌دهندهٔ پیامک'],
  ['بستهٔ کامل (همهٔ ماژول‌ها)', '۳۸ تا ۵۵ میلیون', 'حدود ۲۵٪ تخفیف نسبت به جمع جزء‌به‌جزء'],
  ['شعب دوم و سوم همان مدرسه', '۳۰٪ قیمت بستهٔ اول', 'هر نصب، لایسنس جدا دارد'],
  [
    'پشتیبانی سال دوم به بعد (اختیاری)',
    '۱۵٪ مبلغ قرارداد، سالانه',
    'کاملاً اختیاری؛ سامانه بدون آن هم کار می‌کند',
  ],
  [
    'ارتقای نسخهٔ بزرگ بعدی (مثلاً ۱.x به ۲.x)',
    '۲۰٪ مبلغ قرارداد',
    'فقط اگر خودتان بخواهید — اشتراک نیست',
  ],
  ['خدمات نصب، آموزش و ورود اطلاعات', '۲ تا ۵ میلیون', 'اختیاری'],
];
const faq = [
  [
    'آیا برای کار با سامانه به اینترنت نیاز است؟',
    'سامانه روی هاست مدرسه نصب می‌شود و کاربران (مدیر، معلم، خانواده) از طریق مرورگر یا موبایل به آن وصل می‌شوند. وابستگی به سرویس‌های خارجی وجود ندارد و اطلاعات از کشور خارج نمی‌شود.',
  ],
  [
    'اطلاعات مدرسه متعلق به کیست؟',
    'کاملاً متعلق به خود مدرسه. پایگاه‌داده و فایل‌ها روی هاست شما ذخیره می‌شود و هر زمان بخواهید می‌توانید نسخهٔ پشتیبان کامل بگیرید. هیچ‌کس جز شما به داده‌ها دسترسی ندارد.',
  ],
  [
    'مجبوریم همهٔ ماژول‌ها را بخریم؟',
    'خیر. مدل فروش ماژولار است: بستهٔ پایه را می‌خرید و هر وقت لازم شد، ماژول‌های دیگر (مالی، گزارش‌ها، کتابخانه، ملاقات، خدمات، پیامک) را اضافه می‌کنید.',
  ],
  [
    '«مادام‌العمر» یعنی چه؟ اشتراک هم دارید؟',
    'یعنی یک‌بار خرید و استفادهٔ دائمی؛ بدون هیچ تمدید اجباری. پشتیبانی سالانه کاملاً اختیاری است و اگر نخواهید، سامانه بدون هیچ محدودیتی کار می‌کند.',
  ],
  [
    'نصب چقدر طول می‌کشد؟ آیا به فنی‌کار نیاز داریم؟',
    'حدود ۱۵ دقیقه روی هاست معمولی cPanel با راهنمای گام‌به‌گام فارسی. همچنین تیم شرکت دیس وب می‌تواند نصب، آموزش و ورود اطلاعات اولیه را برایتان انجام دهد.',
  ],
  [
    'اگر بعداً دانش‌آموزانمان زیاد شد یا شعبهٔ دوم زدیم؟',
    'سامانه مقیاس‌پذیر است؛ برای شعبهٔ دوم و سوم همان مدرسه تنها ۳۰٪ قیمت بستهٔ اول پرداخت می‌کنید و هر نصب، لایسنس رسمی خودش را دارد.',
  ],
  [
    'امنیت و حریم خصوصی دانش‌آموزان چطور تأمین می‌شود؟',
    'دسترسی‌ها نقش‌محور و کلاس‌محور است؛ هر کاربر فقط اطلاعات مجاز خود را می‌بیند. رمزهای عبور رمزنگاری‌شده، فایل‌های خصوصی محافظت‌شده و گزارش کامل رویدادها (چه کسی، چه چیزی، کی) از امکانات پایهٔ امنیتی است.',
  ],
  [
    'می‌توانیم قبل از خرید سامانه را ببینیم؟',
    'بله. نسخهٔ نمایشی کامل با نقش‌های مدیر، معلم، دانش‌آموز و ولی در اختیارتان قرار می‌گیرد تا با خیال راحت همه‌چیز را بسنجید.',
  ],
];

// --- ساخت بخش‌های تکراری -----------------------------------------------------
const featureChips = (moduleId) =>
  featuresOf(moduleId)
    .map((f) => `<li class="chip">${esc(f.name)}</li>`)
    .join('\n');

const resourceOf = (id) => resourceDefs[id] || {};
const moduleAccordion = (m) => {
  const feats = featuresOf(m.id);
  const resources = (moduleGroups[m.id] || []).map((rid) => {
    const r = resourceOf(rid);
    const fields = (r.fields || []).length;
    return `<li class="res-chip">${esc(r.title || rid)}${fields ? ` <small>${faNum(fields)} فیلد</small>` : ''}</li>`;
  });
  return `
  <details class="mod" ${m.id === 'students' ? 'open' : ''}>
    <summary>
      <span class="mod-ic">${icon(moduleIcon[m.id] || 'star', 21)}</span>
      <span class="mod-title">${esc(m.name)}</span>
      <span class="mod-count">${faNum(feats.length)} قابلیت</span>
    </summary>
    <p class="mod-desc">${esc(m.description || '')}</p>
    ${resources.length ? `<div class="res-row"><strong>انواع پرونده:</strong><ul class="res-list">${resources.join('')}</ul></div>` : ''}
    <ul class="chip-grid">${featureChips(m.id)}</ul>
  </details>`;
};

const matrixRows = moduleDefs
  .map((m) => {
    const cells = roleIds
      .map((rid) => {
        const total = featuresOf(m.id).length;
        const n = roleCount(m.id, rid);
        const level = n === 0 ? 'none' : n >= total * 0.7 ? 'full' : 'part';
        return `<td class="mx ${level}"><span>${n === 0 ? '—' : faNum(n)}</span></td>`;
      })
      .join('');
    return `<tr><th scope="row">${esc(m.name)}</th>${cells}</tr>`;
  })
  .join('\n');

const resourcesList = Object.entries(resourceDefs)
  .map(([id, r]) => {
    const fields = (r.fields || []).length;
    return `<li class="res-chip">${esc(r.title || id)}${fields ? ` <small>${faNum(fields)} فیلد</small>` : ''}</li>`;
  })
  .join('');

const tabBtn = (id, label, ic) =>
  `<button class="tab-btn" data-tab="${id}" role="tab">${icon(ic, 17)}<span>${label}</span></button>`;

// --- قالب نهایی ---------------------------------------------------------------
const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>مدرسه‌یار | کاتالوگ کامل سامانهٔ مدیریت مدرسه — شرکت دیس وب</title>
<meta name="description" content="کاتالوگ و راهنمای ارائهٔ سامانهٔ مدرسه‌یار: همهٔ امکانات، دسترسی‌ها و قیمت‌گذاری ماژولار. ساختهٔ شرکت دیس وب — disweb.ir" />
<style>
/* ===== فونت وزیرمتن — جاسازی‌شده، بدون هیچ وابستگی خارجی ===== */
@font-face{font-family:'Vazirmatn';src:url(data:font/woff2;base64,${fontArabic}) format('woff2');font-weight:100 900;font-display:swap;unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF;}
@font-face{font-family:'Vazirmatn';src:url(data:font/woff2;base64,${fontLatin}) format('woff2');font-weight:100 900;font-display:swap;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215;}
@font-face{font-family:'Vazirmatn';src:url(data:font/woff2;base64,${fontLatinExt}) format('woff2');font-weight:100 900;font-display:swap;unicode-range:U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;}
:root{
  --primary:#6d4ade;--primary-dark:#5633c2;--primary-soft:#eee9ff;--tint:#f6f3ff;
  --text:#20243a;--soft:#454b66;--muted:#616a85;--border:#e3e6f2;--bg:#f5f6fc;--card:#ffffff;
  --green:#0b7c4d;--green-soft:#e2f5ec;--red:#c62839;--red-soft:#fdeaec;--orange:#b45c00;--orange-soft:#fff1de;--blue:#1d6fd1;--blue-soft:#e8f0fe;
  --radius:16px;--shadow:0 10px 34px rgba(46,36,92,.08);--shadow-lg:0 22px 60px rgba(46,36,92,.14);
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:'Vazirmatn',Tahoma,sans-serif;color:var(--text);background:var(--bg);line-height:2;font-size:15px;-webkit-font-smoothing:antialiased}
a{color:inherit}
button{font-family:inherit;cursor:pointer;border:0;background:none}
.ic{vertical-align:-.28em;flex:none}
.wrap{max-width:1180px;margin:0 auto;padding:0 22px}

/* ===== سربرگ و ناوبری ===== */
.topbar{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
.topbar-in{display:flex;align-items:center;gap:18px;max-width:1180px;margin:0 auto;padding:13px 22px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:11px;font-weight:800;font-size:19px;color:var(--primary-dark)}
.brand-badge{width:42px;height:42px;border-radius:13px;background:linear-gradient(135deg,#6d4ade,#8b6ef0);color:#fff;display:flex;align-items:center;justify-content:center}
.brand small{display:block;font-size:11px;color:var(--muted);font-weight:500}
.top-cta{margin-inline-start:auto;display:flex;gap:9px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;padding:11px 20px;border-radius:12px;font-weight:700;font-size:14px;transition:transform .15s ease, box-shadow .15s ease}
.btn-primary{background:linear-gradient(135deg,#6d4ade,#7c5ce6);color:#fff;box-shadow:0 8px 22px rgba(109,74,222,.35)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(109,74,222,.45)}
.btn-ghost{border:1.6px solid var(--border);color:var(--soft);background:#fff}
.btn-ghost:hover{border-color:var(--primary);color:var(--primary-dark)}
.tabs{display:flex;gap:6px;overflow-x:auto;padding:10px 22px 0;max-width:1180px;margin:0 auto;scrollbar-width:thin}
.tab-btn{display:inline-flex;align-items:center;gap:7px;padding:10px 15px;border-radius:11px 11px 0 0;color:var(--muted);font-size:13.5px;font-weight:700;white-space:nowrap;border-bottom:3px solid transparent;transition:all .15s}
.tab-btn:hover{color:var(--primary-dark);background:var(--tint)}
.tab-btn.active{color:var(--primary-dark);background:var(--primary-soft);border-bottom-color:var(--primary)}
.tab{display:none;animation:fade .35s ease}
.tab.active{display:block}
@keyframes fade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
html.no-js .tab{display:block;margin-bottom:40px}

/* ===== هیرو ===== */
.hero{background:radial-gradient(1100px 480px at 85% -10%, rgba(139,110,240,.35), transparent 60%), radial-gradient(800px 420px at 8% 110%, rgba(29,111,209,.18), transparent 55%), linear-gradient(135deg,#2c1d68 0%,#4b2fb0 55%,#6d4ade 100%);color:#fff;padding:72px 0 60px}
.hero h1{font-size:clamp(26px,4.4vw,44px);line-height:1.7;font-weight:900;letter-spacing:-.5px}
.hero h1 em{font-style:normal;background:linear-gradient(90deg,#ffd977,#ffb44d);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p.lead{font-size:clamp(15px,2vw,19px);opacity:.94;max-width:820px;margin-top:16px;line-height:2.2}
.hero-actions{display:flex;gap:12px;margin-top:28px;flex-wrap:wrap}
.hero .btn-primary{background:#fff;color:#4b2fb0;box-shadow:0 12px 30px rgba(0,0,0,.22)}
.hero .btn-ghost{border-color:rgba(255,255,255,.45);color:#fff;background:rgba(255,255,255,.08)}
.hero-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);padding:7px 15px;border-radius:999px;font-size:12.5px;font-weight:700;margin-bottom:20px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:42px}
.stat{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:16px 14px;text-align:center;backdrop-filter:blur(4px)}
.stat b{display:block;font-size:23px;font-weight:900}
.stat span{font-size:12px;opacity:.85}
.trust-strip{display:flex;gap:9px;flex-wrap:wrap;justify-content:center;padding:16px 22px;background:#fff;border-bottom:1px solid var(--border)}
.trust-strip span{display:inline-flex;align-items:center;gap:7px;background:var(--green-soft);color:var(--green);font-size:12.5px;font-weight:800;padding:8px 15px;border-radius:999px}

/* ===== بخش‌ها ===== */
.section{padding:54px 0 22px}
.sec-head{max-width:760px;margin-bottom:30px}
.sec-head .kicker{display:inline-flex;align-items:center;gap:7px;color:var(--primary-dark);background:var(--primary-soft);font-size:12.5px;font-weight:800;padding:7px 14px;border-radius:999px;margin-bottom:13px}
.sec-head h2{font-size:clamp(21px,3vw,30px);font-weight:900;line-height:1.8;letter-spacing:-.3px}
.sec-head p{color:var(--soft);margin-top:10px;font-size:15.5px}
.grid-3{display:grid;grid-template-columns:repeat(auto-fit,minmax(275px,1fr));gap:16px}
.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:23px;box-shadow:var(--shadow);transition:transform .18s ease, box-shadow .18s ease}
.card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg)}
.card .ic-wrap{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;margin-bottom:13px}
.card h3{font-size:16.5px;font-weight:800;margin-bottom:7px}
.card p{color:var(--soft);font-size:13.8px;line-height:2.1}
.tone-v .ic-wrap{background:var(--primary-soft);color:var(--primary-dark)}
.tone-g .ic-wrap{background:var(--green-soft);color:var(--green)}
.tone-b .ic-wrap{background:var(--blue-soft);color:var(--blue)}
.tone-o .ic-wrap{background:var(--orange-soft);color:var(--orange)}
.tone-r .ic-wrap{background:var(--red-soft);color:var(--red)}

/* ===== شخصیت‌ها ===== */
.persona{border-radius:22px;padding:30px;color:#fff;position:relative;overflow:hidden}
.persona:before{content:'';position:absolute;inset:0;opacity:.16;background:radial-gradient(400px 220px at 90% 0%, #fff, transparent 60%)}
.persona.admin{background:linear-gradient(140deg,#4b2fb0,#7c5ce6)}
.persona.teacher{background:linear-gradient(140deg,#0b6b43,#18a06b)}
.persona.family{background:linear-gradient(140deg,#1554a6,#2f7fd6)}
.persona h3{font-size:21px;font-weight:900;display:flex;align-items:center;gap:10px}
.persona .tagline{opacity:.92;margin:10px 0 16px;font-size:14.5px}
.persona ul{list-style:none;display:grid;gap:10px}
.persona li{background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:12px 14px;font-size:13.6px;line-height:2;display:flex;gap:9px;align-items:flex-start}
.persona li b{display:block;font-size:14.2px}
.gold-title{font-size:17px;font-weight:900;margin:26px 0 12px;display:flex;align-items:center;gap:9px}
.gold-title .ic{color:#c98a00}

/* ===== درد/درمان ===== */
.pain-table{width:100%;border-collapse:separate;border-spacing:0 9px}
.pain-table td{background:#fff;padding:14px 17px;font-size:13.8px;border-block:1px solid var(--border)}
.pain-table td:first-child{border-radius:0 13px 13px 0;color:var(--red);font-weight:700}
.pain-table td:last-child{border-radius:13px 0 0 13px;color:var(--green);font-weight:700;background:var(--green-soft)}
.pain-table .arrow{border:0;background:transparent;width:44px;text-align:center;color:var(--muted);padding:0}

/* ===== امکانات کامل ===== */
.mod{background:#fff;border:1px solid var(--border);border-radius:15px;margin-bottom:11px;overflow:hidden}
.mod summary{list-style:none;display:flex;align-items:center;gap:12px;padding:17px 19px;cursor:pointer;font-weight:800;font-size:15px;user-select:none}
.mod summary::-webkit-details-marker{display:none}
.mod summary:hover{background:var(--tint)}
.mod-ic{width:40px;height:40px;border-radius:11px;background:var(--primary-soft);color:var(--primary-dark);display:flex;align-items:center;justify-content:center}
.mod-title{flex:1}
.mod-count{background:var(--tint);border:1px solid var(--border);color:var(--primary-dark);font-size:11.5px;font-weight:800;padding:5px 11px;border-radius:999px}
.mod-desc{padding:0 19px 6px;color:var(--soft);font-size:13.5px}
.chip-grid{list-style:none;display:flex;flex-wrap:wrap;gap:7px;padding:13px 19px 20px}
.chip{background:var(--tint);border:1px solid var(--border);border-radius:9px;padding:6px 11px;font-size:12.2px;color:var(--soft);line-height:1.9}
.res-row{padding:6px 19px 0;font-size:13px;color:var(--muted)}
.res-list{list-style:none;display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
.res-chip{background:var(--blue-soft);color:var(--blue);border-radius:9px;padding:6px 11px;font-size:12px;font-weight:700}
.res-chip small{opacity:.75;font-weight:500}

/* ===== ماتریس نقش‌ها ===== */
.matrix-scroll{overflow-x:auto;border:1px solid var(--border);border-radius:16px;background:#fff;box-shadow:var(--shadow)}
.matrix{width:100%;border-collapse:collapse;min-width:640px}
.matrix th,.matrix td{padding:12px 14px;text-align:center;font-size:13px;border-bottom:1px solid var(--border)}
.matrix thead th{background:var(--primary-soft);color:var(--primary-dark);font-size:12.5px;font-weight:900;position:sticky;top:0}
.matrix tbody th{text-align:right;font-weight:800;color:var(--text)}
.matrix .mx span{display:inline-flex;min-width:34px;justify-content:center;padding:4px 9px;border-radius:8px;font-weight:800}
.mx.full span{background:var(--green-soft);color:var(--green)}
.mx.part span{background:var(--orange-soft);color:var(--orange)}
.mx.none span{background:#f1f2f7;color:#9aa1b5}
.legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:12px;font-size:12.5px;color:var(--muted)}
.legend i{width:11px;height:11px;border-radius:4px;display:inline-block;margin-inline-end:5px}

/* ===== قیمت ===== */
.price-hero{background:linear-gradient(135deg,#2c1d68,#6d4ade);border-radius:24px;color:#fff;padding:38px 30px;text-align:center;box-shadow:var(--shadow-lg)}
.price-hero h2{font-size:clamp(21px,3vw,31px);font-weight:900}
.price-hero p{opacity:.92;max-width:640px;margin:11px auto 0}
.price-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(285px,1fr));gap:17px;margin-top:26px}
.price-card{background:#fff;border:1.6px solid var(--border);border-radius:20px;padding:27px;display:flex;flex-direction:column;position:relative}
.price-card.best{border-color:var(--primary);box-shadow:0 18px 50px rgba(109,74,222,.22);transform:scale(1.02)}
.best-ribbon{position:absolute;top:-15px;inset-inline-start:50%;transform:translateX(50%);background:linear-gradient(135deg,#ffb44d,#ff8c2e);color:#fff;font-size:12px;font-weight:900;padding:7px 18px;border-radius:999px;box-shadow:0 8px 18px rgba(255,140,46,.4)}
.price-card h3{font-size:18px;font-weight:900}
.price-card .price{font-size:21px;font-weight:900;color:var(--primary-dark);margin:9px 0 3px}
.price-card .note{font-size:12px;color:var(--muted);margin-bottom:15px}
.price-card ul{list-style:none;display:grid;gap:9px;margin-bottom:20px}
.price-card li{display:flex;gap:8px;align-items:flex-start;font-size:13.3px;color:var(--soft)}
.price-card li .ic{color:var(--green);margin-top:.35em}
.price-card .btn{justify-content:center;margin-top:auto}
.price-table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;box-shadow:var(--shadow)}
.price-table th,.price-table td{padding:13px 15px;font-size:13px;border-bottom:1px solid var(--border);text-align:right}
.price-table thead th{background:var(--primary-soft);color:var(--primary-dark);font-size:12.5px}
.price-table tbody tr:hover{background:var(--tint)}
.price-table td:nth-child(2){font-weight:800;color:var(--primary-dark);white-space:nowrap}
.price-table td:nth-child(3){color:var(--muted);font-size:12px}
.terms{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:11px;margin-top:17px}
.term{background:#fff;border:1px solid var(--border);border-radius:13px;padding:15px;display:flex;gap:10px;font-size:13px;color:var(--soft)}
.term .ic{color:var(--primary-dark);margin-top:.3em}

/* ===== سوالات ===== */
.faq{display:grid;gap:10px}
.faq details{background:#fff;border:1px solid var(--border);border-radius:13px;overflow:hidden}
.faq summary{padding:16px 18px;font-weight:800;font-size:14.2px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:10px}
.faq summary::-webkit-details-marker{display:none}
.faq summary:after{content:'+';font-size:21px;color:var(--primary-dark);font-weight:900}
.faq details[open] summary:after{content:'−'}
.faq details[open] summary{background:var(--tint)}
.faq .ans{padding:0 18px 17px;color:var(--soft);font-size:13.6px}

/* ===== نصب ===== */
.steps{counter-reset:step;display:grid;gap:12px}
.step{background:#fff;border:1px solid var(--border);border-radius:14px;padding:18px 19px;display:flex;gap:14px;align-items:flex-start}
.step:before{counter-increment:step;content:counter(step);width:34px;height:34px;border-radius:11px;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;flex:none}
.step b{display:block;font-size:14.5px}
.step p{color:var(--soft);font-size:13px}

/* ===== پایانی ===== */
.final-cta{background:radial-gradient(700px 300px at 90% 0%, rgba(139,110,240,.4), transparent 60%), linear-gradient(135deg,#2c1d68,#6d4ade);color:#fff;border-radius:24px;padding:44px 32px;text-align:center;margin:46px 0}
.final-cta h2{font-size:clamp(20px,3vw,29px);font-weight:900}
.final-cta p{opacity:.92;max-width:620px;margin:12px auto 21px}
.final-cta .btn-primary{background:#fff;color:#4b2fb0}
footer{background:#1e2338;color:#c9cfe4;padding:34px 0 26px;margin-top:20px}
footer .cols{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;align-items:center}
footer b{color:#fff;font-size:17px}
footer a{color:#b8a8ff;font-weight:700}
footer small{display:block;opacity:.7;margin-top:5px}

/* ===== چاپ ===== */
@media print{
  .topbar,.tabs,.top-cta,.hero-actions,.final-cta{display:none!important}
  .tab{display:block!important;page-break-inside:avoid}
  .hero{background:#4b2fb0!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-size:12px}
}
@media (max-width:760px){
  .persona{padding:22px}
  .price-card.best{transform:none}
  .hero{padding:48px 0 42px}
}
</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-in">
    <div class="brand">
      <span class="brand-badge">${icon('school', 23)}</span>
      <span>مدرسه‌یار<small>سامانهٔ مدیریت مدرسه · شرکت دیس وب</small></span>
    </div>
    <div class="top-cta">
      <a class="btn btn-ghost" href="https://disweb.ir" target="_blank" rel="noreferrer">disweb.ir</a>
      <a class="btn btn-primary" href="#tab-pricing" data-goto="pricing">${icon('wallet', 17)} قیمت ماژول‌ها</a>
    </div>
  </div>
  <nav class="tabs" role="tablist" aria-label="بخش‌های کاتالوگ">
    ${tabBtn('home', 'معرفی و دلایل انتخاب', 'star')}
    ${tabBtn('admin', 'برای مدیران مدرسه', 'shield')}
    ${tabBtn('teacher', 'برای معلمان', 'cap')}
    ${tabBtn('family', 'برای اولیا و دانش‌آموزان', 'heart')}
    ${tabBtn('features', 'همهٔ امکانات', 'layers')}
    ${tabBtn('roles', 'دسترسی نقش‌ها', 'lock')}
    ${tabBtn('pricing', 'قیمت‌گذاری ماژولار', 'wallet')}
    ${tabBtn('install', 'نصب، امنیت و پشتیبانی', 'shield')}
  </nav>
</header>

<main>
<!-- ================= تب ۱: معرفی ================= -->
<section class="tab active" id="tab-home" role="tabpanel">
  <div class="hero">
    <div class="wrap">
      <span class="hero-badge">${icon('award', 16)} نسخهٔ ${faNum('1.2.0')} · ساختهٔ شرکت دیس وب</span>
      <h1>مدرسه‌یار؛ <em>مدیریت کامل مدرسه</em>، ساده، فارسی و متعلق به خودتان</h1>
      <p class="lead">از حضور و غیاب و نمرات گرفته تا شهریه، کارنامه، کتابخانه و ارتباط زنده با خانواده‌ها — همه در یک سامانهٔ حرفه‌ای که روی هاست خود مدرسه نصب می‌شود، <b>یک‌بار خریده می‌شود و برای همیشه مال شماست</b>.</p>
      <div class="hero-actions">
        <button class="btn btn-primary" data-goto="features">${icon('layers', 18)} همهٔ امکانات را ببینید</button>
        <button class="btn btn-ghost" data-goto="pricing">${icon('wallet', 18)} قیمت‌گذاری ماژولار</button>
      </div>
      <div class="stats">
        <div class="stat"><b>${faNum(17)} ماژول</b><span>از داشبورد تا مالی و کتابخانه</span></div>
        <div class="stat"><b>${faNum(188)} قابلیت</b><span>ریز و درشت، پیاده‌سازی‌شده</span></div>
        <div class="stat"><b>${faNum(33)} نوع پرونده</b><span>از دانش‌آموز تا فیش حقوقی</span></div>
        <div class="stat"><b>${faNum(4)} نقش کاربری</b><span>مدیر، معلم، دانش‌آموز، ولی</span></div>
        <div class="stat"><b>نصب ${faNum(15)} دقیقه‌ای</b><span>روی هاست معمولی cPanel</span></div>
        <div class="stat"><b>بدون اشتراک</b><span>خرید مادام‌العمر، مالکیت کامل</span></div>
      </div>
    </div>
  </div>
  <div class="trust-strip">
    <span>${icon('check', 15)} مالکیت کامل داده‌ها روی هاست مدرسه</span>
    <span>${icon('check', 15)} مادام‌العمر بدون هزینهٔ تمدید اجباری</span>
    <span>${icon('check', 15)} خرید ماژول‌به‌ماژول، به اندازهٔ نیاز</span>
    <span>${icon('check', 15)} پشتیبانی فارسی شرکت دیس وب</span>
    <span>${icon('check', 15)} نسخهٔ نمایشی رایگان قبل از خرید</span>
  </div>

  <div class="wrap section">
    <div class="sec-head">
      <span class="kicker">${icon('star', 15)} برای سه گروهی که مدرسه را می‌سازند</span>
      <h2>مهم‌ترین چیزی که هر گروه از مدرسه می‌خواهد — و مدرسه‌یار می‌دهد</h2>
      <p>مدرسه سه رکن دارد: مدیری که باید تصمیم بگیرد، مربی‌ای که باید آموزش دهد و خانواده‌ای که باید آرامش خاطر داشته باشد. مدرسه‌یار برای هر سه، دقیقاً همان چیزی را ساخته است که هر روز به آن نیاز دارند.</p>
    </div>
    <div class="grid-3">
      <div class="persona admin">
        <h3>${icon('shield', 26)} مدیر مدرسه</h3>
        <p class="tagline">«کنترل کامل مدرسه، در یک صفحه و بدون ابهام»</p>
        <ul>
          <li>${icon('check', 17)}<span><b>داشبورد زنده و تصمیم‌ساز</b> آمار حضور، مالی و کارهای امروز، جلوی چشم.</span></li>
          <li>${icon('check', 17)}<span><b>مالی شفاف</b> شهریه، اقساط، تخفیف و بدهکاران — بدون محاسبهٔ دستی.</span></li>
          <li>${icon('check', 17)}<span><b>امنیت و پشتیبان‌گیری</b> دسترسی نقش‌محور، گزارش رویدادها و بازگردانی با یک کلیک.</span></li>
        </ul>
      </div>
      <div class="persona teacher">
        <h3>${icon('cap', 26)} معلم و مربی</h3>
        <p class="tagline">«وقت بیشتر برای تدریس، کاغذ کمتر»</p>
        <ul>
          <li>${icon('check', 17)}<span><b>حضور و غیاب موبایلی</b> با دکمه‌های درشت و ذخیرهٔ سریع، حتی وسط کلاس.</span></li>
          <li>${icon('check', 17)}<span><b>نمرات و تکالیف بدون کاغذ</b> ثبت تکی و گروهی، بررسی ارسال‌ها و سوابق.</span></li>
          <li>${icon('check', 17)}<span><b>ارتباط منظم با خانواده</b> جلسات با رزرو وقت، تیکت و اعلان خودکار.</span></li>
        </ul>
      </div>
      <div class="persona family">
        <h3>${icon('heart', 26)} اولیا و دانش‌آموزان</h3>
        <p class="tagline">«خیال‌تان از مدرسه راحت باشد»</p>
        <ul>
          <li>${icon('check', 17)}<span><b>اعلان لحظه‌ای</b> غیبت، نمره، تکلیف و اطلاعیه، بی‌نیاز از تماس مکرر.</span></li>
          <li>${icon('check', 17)}<span><b>مرخصی و ملاقات آنلاین</b> بدون مراجعهٔ حضوری و انتظار پشت خط.</span></li>
          <li>${icon('check', 17)}<span><b>شفافیت کامل</b> کارنامه، نمرات و شهریه همیشه قابل مشاهده و پیگیری.</span></li>
        </ul>
      </div>
    </div>
  </div>

  <div class="wrap section">
    <div class="sec-head">
      <span class="kicker">${icon('zap', 15)} قبل و بعد از مدرسه‌یار</span>
      <h2>وقتی اطلاعات پراکنده است، مدرسه هر روز وقت از دست می‌دهد</h2>
    </div>
    <table class="pain-table">
      <tbody>
        ${painRows
          .map(
            ([pain, gain]) =>
              `<tr><td>${esc(pain)}</td><td class="arrow">${icon('check', 18)}</td><td>${esc(gain)}</td></tr>`,
          )
          .join('\n')}
      </tbody>
    </table>
  </div>

  <div class="wrap section">
    <div class="sec-head">
      <span class="kicker">${icon('award', 15)} چرا مدرسه‌یار بهترین انتخاب است؟</span>
      <h2>شش دلیلی که مدیران را متقاعد می‌کند</h2>
    </div>
    <div class="grid-3">
      ${whyCards
        .map(
          (c, i) => `<div class="card tone-${['v', 'g', 'b', 'o', 'r', 'v'][i]}">
        <div class="ic-wrap">${icon(c.icon, 23)}</div>
        <h3>${esc(c.title)}</h3><p>${esc(c.text)}</p>
      </div>`,
        )
        .join('\n')}
    </div>
  </div>
</section>

<!-- ================= تب ۲: مدیران ================= -->
<section class="tab" id="tab-admin" role="tabpanel">
  <div class="wrap section">
    <div class="sec-head">
      <span class="kicker">${icon('shield', 15)} ویژگی‌های ویژهٔ مدیر مدرسه</span>
      <h2>مدرسه‌یار برای مدیری که می‌خواهد «همه‌چیز را بداند و همه‌چیز را کنترل کند»</h2>
      <p>این بخش، دقیقاً همان چیزهایی است که یک مدیر موفق هر روز به آن‌ها نیاز دارد — از آمار لحظه‌ای تا مالی، از امنیت تا گزارش‌های رسمی.</p>
    </div>
    <div class="grid-2">
      ${personaAdmin
        .map(
          (c) =>
            `<div class="card tone-v"><div class="ic-wrap">${icon(c.icon, 23)}</div><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></div>`,
        )
        .join('\n')}
    </div>
    <div class="gold-title">${icon('star', 19)} سه موردی که بیش از همه به کار مدیر می‌آید</div>
    <div class="grid-3">
      <div class="card tone-o"><div class="ic-wrap">${icon('wallet', 23)}</div><h3>گزارش بدهکاران و وصول مطالبات</h3><p>فهرست دقیق خانواده‌های بدهکار با ماندهٔ هر کدام، یادآوری اقساط و جریمهٔ دیرکرد — مهم‌ترین دغدغهٔ مالی هر مدرسه، بدون صفحهٔ اکسل.</p></div>
      <div class="card tone-g"><div class="ic-wrap">${icon('file', 23)}</div><h3>کارنامه و خروجی وزارتی</h3><p>کارنامهٔ چاپی استاندارد، نمرات ترم، کارنامهٔ ترمیمی و خروجی‌های رسمی؛ هر وقت اداره یا اولیا خواستند، ظرف چند ثانیه آماده است.</p></div>
      <div class="card tone-b"><div class="ic-wrap">${icon('zap', 23)}</div><h3>مدیریت ماژول‌ها و دسترسی‌ها</h3><p>مشخص کنید هر نقش به چه بخش‌هایی دسترسی داشته باشد؛ حتی بخش‌های سامانه را برای همه روشن/خاموش کنید. مدرسه، تحت کنترل کامل شماست.</p></div>
    </div>
    <div class="gold-title">${icon('layers', 19)} ماژول‌های کلیدی مدیریتی</div>
    <div class="grid-2">
      <div class="card"><h3>${icon('wallet', 20)} امور مالی (۱۴ قابلیت)</h3><p>شهریهٔ دوره‌ای، تخفیف‌های خانوادگی و سهمیه‌ای، اقساط با سررسید، جریمهٔ دیرکرد، صورتحساب و رسید، فهرست بدهکاران، حقوق و فیش کارکنان.</p></div>
      <div class="card"><h3>${icon('file', 20)} گزارش‌ها و کارنامه (۱۳ قابلیت)</h3><p>کارنامهٔ پایان دوره، روند تحصیلی و حضور، گزارش وزارتی، تصمیم ارتقا/تکرار پایه، چاپ کارنامه و خروجی Excel و PDF.</p></div>
      <div class="card"><h3>${icon('settings', 20)} تنظیمات و نگهداری (۱۵ قابلیت)</h3><p>مشخصات مدرسه، حساب‌های کاربری، سال تحصیلی، گزارش رویدادها، پشتیبان‌گیری/بازگردانی، پل پیامک و ایمیل، وضعیت سرویس، ظاهر و پالت رنگی.</p></div>
      <div class="card"><h3>${icon('chart', 20)} داشبورد و تحلیل (۴+ قابلیت)</h3><p>کارت‌های آماری زنده، نمودار روند حضور، فعالیت‌های اخیر، «کارهای امروز من» و تحلیل روند نمرات و حضور هر دانش‌آموز.</p></div>
    </div>
  </div>
</section>

<!-- ================= تب ۳: معلمان ================= -->
<section class="tab" id="tab-teacher" role="tabpanel">
  <div class="wrap section">
    <div class="sec-head">
      <span class="kicker">${icon('cap', 15)} ویژگی‌های ویژهٔ معلمان و مربیان</span>
      <h2>کمترین کار اداری، بیشترین تمرکز بر آموزش</h2>
      <p>مدرسه‌یار کارهای وقت‌گیر معلم را به چند ثانیه تبدیل می‌کند؛ طوری طراحی شده که حتی با گوشی، وسط کلاس هم سریع باشد.</p>
    </div>
    <div class="grid-2">
      ${personaTeacher
        .map(
          (c) =>
            `<div class="card tone-g"><div class="ic-wrap">${icon(c.icon, 23)}</div><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></div>`,
        )
        .join('\n')}
    </div>
    <div class="gold-title">${icon('star', 19)} سه موردی که معلمان بیش از همه دوست دارند</div>
    <div class="grid-3">
      <div class="card tone-g"><div class="ic-wrap">${icon('clock', 23)}</div><h3>حضور و غیاب موبایلی</h3><p>کارت هر دانش‌آموز با چهار دکمهٔ درشت؛ حتی با یک دست و وسط زنگ کلاس. نوار «ذخیرهٔ تغییرات» همیشه پایین صفحه است تا هیچ تغییری جا نماند.</p></div>
      <div class="card tone-b"><div class="ic-wrap">${icon('book', 23)}</div><h3>ثبت گروهی نمرات</h3><p>نمرات یک کلاس را در یک جدول وارد کنید؛ همراه نمرهٔ تکلیف، آزمون و بررسی ارسال‌های دانش‌آموزان — بدون دفتر نمره.</p></div>
      <div class="card tone-o"><div class="ic-wrap">${icon('users', 23)}</div><h3>جلسات اولیا با نظم</h3><p>بازه‌های وقت‌دهی تعریف کنید، خانواده‌ها آنلاین رزرو کنند؛ به‌جای ده‌ها تماس تلفنی، یک برنامهٔ منظم جلوی رویتان است.</p></div>
    </div>
  </div>
</section>

<!-- ================= تب ۴: اولیا ================= -->
<section class="tab" id="tab-family" role="tabpanel">
  <div class="wrap section">
    <div class="sec-head">
      <span class="kicker">${icon('heart', 15)} ویژگی‌های ویژهٔ اولیا و دانش‌آموزان</span>
      <h2>خانواده همیشه در جریان است؛ بدون تماس مکرر و بدون نگرانی</h2>
      <p>وقتی خانواده اطلاعات شفاف و به‌موقع داشته باشد، اعتمادش به مدرسه بیشتر می‌شود و فرزندش آرام‌تر درس می‌خواند. این بخش، پل ارتباطی مدرسه و خانه است.</p>
    </div>
    <div class="grid-2">
      ${personaFamily
        .map(
          (c) =>
            `<div class="card tone-b"><div class="ic-wrap">${icon(c.icon, 23)}</div><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></div>`,
        )
        .join('\n')}
    </div>
    <div class="gold-title">${icon('star', 19)} سه موردی که آرامش خانواده را تضمین می‌کند</div>
    <div class="grid-3">
      <div class="card tone-r"><div class="ic-wrap">${icon('bell', 23)}</div><h3>اعلان خودکار غیبت</h3><p>به‌محض ثبت غیبت، پیام به والدین می‌رسد؛ اگر اشتباهی رخ داده باشد، همان روز قابل پیگیری است — نه آخر ترم.</p></div>
      <div class="card tone-v"><div class="ic-wrap">${icon('calendar', 23)}</div><h3>رزرو وقت ملاقات</h3><p>والدین بدون تماس تلفنی، وقت ملاقات با معلم یا مدیر را رزرو می‌کنند و یادآوری آن را دریافت می‌کنند.</p></div>
      <div class="card tone-g"><div class="ic-wrap">${icon('file', 23)}</div><h3>کارنامه و صورتحساب شفاف</h3><p>نمرات، کارنامه، ماندهٔ شهریه و اقساط همیشه در دسترس است؛ خانواده دقیقاً می‌داند وضعیت مالی و تحصیلی فرزندش چگونه است.</p></div>
    </div>
  </div>
</section>

<!-- ================= تب ۵: همهٔ امکانات ================= -->
<section class="tab" id="tab-features" role="tabpanel">
  <div class="wrap section">
    <div class="sec-head">
      <span class="kicker">${icon('layers', 15)} فهرست کامل و ریزبینانه</span>
      <h2>تمام ${faNum(188)} قابلیت سامانه، ماژول‌به‌ماژول</h2>
      <p>از ریزترین عملیات (ثبت، ویرایش، حذف ایمن و جست‌وجوی هر پرونده) تا بزرگ‌ترین جریان‌های کاری — همه اینجا فهرست شده‌اند. هر ماژول را باز کنید تا جزئیات را ببینید.</p>
    </div>
    ${moduleDefs.map(moduleAccordion).join('\n')}

    <div class="gold-title">${icon('database', 19)} ${faNum(33)} نوع پروندهٔ ساخت‌یافته</div>
    <p style="color:var(--soft);font-size:13.6px;margin-bottom:12px">هر پرونده با فیلدهای تخصصی، جست‌وجو، فیلتر، مرتب‌سازی، عملیات گروهی، خروجی Excel/CSV و چاپ — برای نمونه، تعداد فیلدهای هر نوع در پرانتز آمده است:</p>
    <ul class="res-list" style="margin-bottom:26px">${resourcesList}</ul>

    <div class="gold-title">${icon('sparkle', 19)} قابلیت‌هایی که در سراسر سامانه هستند</div>
    <div class="grid-3">
      <div class="card tone-v"><div class="ic-wrap">${icon('chart', 22)}</div><h3>جست‌وجو، فیلتر و مرتب‌سازی</h3><p>در همهٔ فهرست‌ها؛ فهرست‌های بلند (دانش‌آموز، معلم، کتاب) انتخاب‌گر جست‌وجو‌پذیر دارند.</p></div>
      <div class="card tone-g"><div class="ic-wrap">${icon('check', 22)}</div><h3>عملیات گروهی و ویرایش گروهی</h3><p>انتخاب چند رکورد و تغییر گروهی وضعیت‌ها؛ صرفه‌جویی چشمگیر در وقت.</p></div>
      <div class="card tone-b"><div class="ic-wrap">${icon('download', 22)}</div><h3>خروجی Excel، PDF و CSV</h3><p>از هر فهرست و گزارش؛ مناسب اداره، جلسات و بایگانی.</p></div>
      <div class="card tone-o"><div class="ic-wrap">${icon('printer', 22)}</div><h3>چاپ استاندارد</h3><p>کارنامه، کارت، صورتحساب و گزارش‌ها با قالب چاپی تمیز؛ حتی صفحهٔ چاپ اختصاصی.</p></div>
      <div class="card tone-r"><div class="ic-wrap">${icon('calendar', 22)}</div><h3>تاریخ جلالی واقعی</h3><p>انتخاب‌گر تاریخ شمسی در همهٔ فرم‌ها؛ ذخیرهٔ استاندارد و نمایش فارسی.</p></div>
      <div class="card tone-v"><div class="ic-wrap">${icon('file', 22)}</div><h3>پیوست فایل و آپلود</h3><p>برای تکالیف، مدارک، تیکت‌ها و پرونده‌ها — با کنترل نوع و حجم.</p></div>
      <div class="card tone-g"><div class="ic-wrap">${icon('bell', 22)}</div><h3>اعلان‌های درون‌برنامه‌ای</h3><p>مرکز اعلان‌ها با شمارندهٔ خوانده‌نشده‌ها و پیوند مستقیم به بخش مربوط.</p></div>
      <div class="card tone-b"><div class="ic-wrap">${icon('phone', 22)}</div><h3>پل پیامک و ایمیل</h3><p>ارسال انبوه یا خودکار از طریق سرویس‌دهندهٔ دلخواه شما؛ همراه صف ارسال و گزارش وضعیت.</p></div>
      <div class="card tone-o"><div class="ic-wrap">${icon('shield', 22)}</div><h3>گزارش مشکل با کد پیگیری</h3><p>هر کاربر می‌تواند مشکل را با کد رهگیری گزارش دهد؛ مدیر وضعیت آن را پیگیری می‌کند.</p></div>
    </div>
  </div>
</section>

<!-- ================= تب ۶: دسترسی‌ها ================= -->
<section class="tab" id="tab-roles" role="tabpanel">
  <div class="wrap section">
    <div class="sec-head">
      <span class="kicker">${icon('lock', 15)} مدل دسترسی و امنیت</span>
      <h2>هر کاربر فقط آن‌چیزی را می‌بیند که به او مربوط است</h2>
      <p>عدد داخل هر خانه، تعداد قابلیت‌های آن ماژول است که آن نقش به‌طور پیش‌فرض به آن‌ها دسترسی دارد (بر اساس تعریف نقش‌ها در خود سامانه). مدیر می‌تواند دسترسی‌ها را دقیق‌تر هم محدود کند.</p>
    </div>
    <div class="matrix-scroll">
      <table class="matrix">
        <thead>
          <tr><th>ماژول</th>${roleIds.map((r) => `<th>${esc(roles[r])}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${matrixRows}
          <tr>
            <th scope="row">جمع قابلیت‌ها</th>
            ${roleIds
              .map((r) => {
                const n = featureDefs.filter((f) => (f.roles || []).includes(r)).length;
                return `<td class="mx full"><span>${faNum(n)}</span></td>`;
              })
              .join('')}
          </tr>
        </tbody>
      </table>
    </div>
    <div class="legend">
      <span><i style="background:var(--green-soft)"></i>دسترسی گسترده</span>
      <span><i style="background:var(--orange-soft)"></i>دسترسی محدود و هدفمند</span>
      <span><i style="background:#f1f2f7"></i>بدون دسترسی</span>
    </div>

    <div class="gold-title">${icon('shield', 19)} لایه‌های امنیتی سامانه</div>
    <div class="grid-3">
      <div class="card tone-v"><div class="ic-wrap">${icon('lock', 22)}</div><h3>نقش‌محور و کلاس‌محور</h3><p>معلم فقط کلاس‌های خودش را می‌بیند، ولی فقط اطلاعات فرزندش را، دانش‌آموز فقط سوابق خودش را.</p></div>
      <div class="card tone-g"><div class="ic-wrap">${icon('shield', 22)}</div><h3>حفاظت از حساب‌ها</h3><p>رمزهای عبور رمزنگاری‌شده، نشست‌های امن با توکن نامرعی (HttpOnly)، الزام تغییر رمز در اولین ورود و محافظت CSRF.</p></div>
      <div class="card tone-b"><div class="ic-wrap">${icon('database', 22)}</div><h3>پشتیبان‌گیری و بازگردانی</h3><p>نسخهٔ پشتیبان کامل با یک کلیک و بازگردانی آزموده‌شده؛ خطر از‌دست‌رفتن اطلاعات تقریباً صفر است.</p></div>
      <div class="card tone-o"><div class="ic-wrap">${icon('file', 22)}</div><h3>گزارش کامل رویدادها</h3><p>چه کسی، چه چیزی و چه زمانی تغییر داده است؛ همه در «رویدادهای سامانه» ثبت می‌شود.</p></div>
      <div class="card tone-r"><div class="ic-wrap">${icon('lock', 22)}</div><h3>فایل‌های خصوصی</h3><p>دانلود فایل‌ها فقط با مجوز و برای کاربر مجاز؛ مسیرهای مخفی از دسترس عمومی خارج‌اند.</p></div>
      <div class="card tone-v"><div class="ic-wrap">${icon('settings', 22)}</div><h3>هستهٔ همیشه‌فعال</h3><p>قابلیت‌های حیاتی مدیریت سامانه را نمی‌توان خاموش کرد تا مدرسه هرگز قفل نشود.</p></div>
    </div>
  </div>
</section>

<!-- ================= تب ۷: قیمت ================= -->
<section class="tab" id="tab-pricing" role="tabpanel">
  <div class="wrap section">
    <div class="price-hero">
      <h2>${icon('wallet', 26)} فقط به‌اندازهٔ نیازتان بخرید — و برای همیشه مال شما باشد</h2>
      <p>قیمت‌گذاری مدرسه‌یار <b>ماژولار</b> است: یک پایهٔ مناسب + هر ماژولی که مدرسه‌تان لازم دارد. <b>هیچ اشتراک ماهانه یا سالانه‌ای وجود ندارد</b>؛ یک‌بار خرید، استفادهٔ دائمی.</p>
    </div>
    <div class="price-grid">
      ${packages
        .map(
          (p) => `<div class="price-card ${p.tone === 'best' ? 'best' : ''}">
        ${p.tone === 'best' ? '<span class="best-ribbon">بهترین انتخاب</span>' : ''}
        <h3>${esc(p.name)}</h3>
        <div class="price">${esc(p.price)}</div>
        <div class="note">${esc(p.note)}</div>
        <ul>${p.items.map((it) => `<li>${icon('check', 16)}<span>${esc(it)}</span></li>`).join('')}</ul>
        <a class="btn ${p.tone === 'best' ? 'btn-primary' : 'btn-ghost'}" href="https://disweb.ir" target="_blank" rel="noreferrer">درخواست خرید و مشاوره</a>
      </div>`,
        )
        .join('\n')}
    </div>

    <div class="gold-title">${icon('file', 19)} جدول کامل قیمت‌ها (بازه‌های پیشنهادی قابل تنظیم)</div>
    <div class="matrix-scroll">
      <table class="price-table">
        <thead><tr><th>مورد</th><th>قیمت پیشنهادی (تومان)</th><th>یادداشت</th></tr></thead>
        <tbody>
          ${priceTable
            .map(([a, b, c]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td>${esc(c)}</td></tr>`)
            .join('\n')}
        </tbody>
      </table>
    </div>

    <div class="gold-title">${icon('star', 19)} شرایطی که خیال شما را راحت می‌کند</div>
    <div class="terms">
      <div class="term">${icon('check', 18)}<span><b>مادام‌العمر یعنی:</b> نسخهٔ خریداری‌شده برای همیشه قابل استفاده است؛ بدون قفل‌شدن و بدون تمدید اجباری.</span></div>
      <div class="term">${icon('check', 18)}<span><b>بدون اشتراک:</b> هیچ پرداخت دوره‌ای وجود ندارد؛ پشتیبانی سالانه کاملاً اختیاری است.</span></div>
      <div class="term">${icon('check', 18)}<span><b>بدون هزینهٔ پنهان:</b> قیمت نصب، آموزش و ماژول‌ها شفاف اعلام می‌شود؛ هزینهٔ هاست و پیامک به عهدهٔ خود مدرسه است.</span></div>
      <div class="term">${icon('check', 18)}<span><b>لایسنس رسمی:</b> برای هر نصب، فایل لایسنس مخصوص مدرسه با سریال صادر می‌شود.</span></div>
      <div class="term">${icon('check', 18)}<span><b>ارتقای اختیاری:</b> افزودن ماژول جدید هر وقت بخواهید؛ ارتقای نسخه‌های بزرگ فقط اگر خودتان انتخاب کنید.</span></div>
      <div class="term">${icon('check', 18)}<span><b>امتحان قبل از خرید:</b> نسخهٔ نمایشی کامل در اختیارتان قرار می‌گیرد تا با اطمینان تصمیم بگیرید.</span></div>
    </div>
    <div class="final-cta">
      <h2>آماده‌اید مدرسه‌تان را متحول کنید؟</h2>
      <p>یک گفت‌وگوی کوتاه کافی است تا بر اساس تعداد دانش‌آموزان و نیازهای مدرسه‌تان، بهترین ترکیب ماژول‌ها و قیمت نهایی را پیشنهاد دهیم.</p>
      <a class="btn btn-primary" href="https://disweb.ir" target="_blank" rel="noreferrer">${icon('phone', 18)} تماس با شرکت دیس وب</a>
    </div>
  </div>
</section>

<!-- ================= تب ۸: نصب و پشتیبانی ================= -->
<section class="tab" id="tab-install" role="tabpanel">
  <div class="wrap section">
    <div class="sec-head">
      <span class="kicker">${icon('zap', 15)} نصب آسان، نگهداری آرام</span>
      <h2>نصب روی هاست معمولی cPanel در حدود ۱۵ دقیقه</h2>
      <p>برای راه‌اندازی مدرسه‌یار به سرور اختصاصی یا تیم فنی نیاز نیست؛ اگر هاست cPanel دارید، می‌توانید امروز نصب کنید.</p>
    </div>
    <div class="steps">
      <div class="step"><div><b>دریافت بسته و آپلود روی هاست</b><p>فایل ZIP را در File Manager آپلود و استخراج می‌کنید.</p></div></div>
      <div class="step"><div><b>ساخت اپلیکیشن Node در cPanel</b><p>چند فیلد ساده (مسیر برنامه، آدرس، فایل شروع app.cjs) و دکمهٔ نصب وابستگی‌ها.</p></div></div>
      <div class="step"><div><b>تنظیمات محیطی</b><p>یک فایل .env کوچک با راهنمای دقیق فارسی؛ مسیر داده‌ها و حالت استفاده را مشخص می‌کنید.</p></div></div>
      <div class="step"><div><b>ویزارد نصب و ورود اطلاعات</b><p>مشخصات مدرسه، حساب مدیر و ماژول‌ها را در چند مرحلهٔ ساده ثبت می‌کنید.</p></div></div>
      <div class="step"><div><b>شروع کار!</b><p>کاربران وارد می‌شوند و از همان روز اول، مدرسه با نظم تازه کار می‌کند.</p></div></div>
    </div>

    <div class="gold-title">${icon('shield', 19)} امنیت و مالکیت اطلاعات</div>
    <div class="grid-3">
      <div class="card tone-v"><div class="ic-wrap">${icon('database', 22)}</div><h3>داده‌ها روی هاست خود شما</h3><p>پایگاه‌داده و فایل‌ها روی هاست مدرسه ذخیره می‌شوند؛ وابستگی به سرورهای خارجی وجود ندارد.</p></div>
      <div class="card tone-g"><div class="ic-wrap">${icon('download', 22)}</div><h3>پشتیبان‌گیری منظم</h3><p>با یک کلیک نسخهٔ پشتیبان کامل بگیرید و هر زمان لازم بود، بازگردانی کنید.</p></div>
      <div class="card tone-b"><div class="ic-wrap">${icon('lock', 22)}</div><h3>بدون وابستگی خارجی</h3><p>فونت، رابط کاربری و همهٔ اجزا درون خود سامانه‌اند؛ نه درخواست مخفی به سرویس‌های بیرونی.</p></div>
    </div>

    <div class="gold-title">${icon('message', 19)} سؤالات متداول</div>
    <div class="faq">
      ${faq
        .map(
          ([q, a]) =>
            `<details><summary>${esc(q)}</summary><div class="ans">${esc(a)}</div></details>`,
        )
        .join('\n')}
    </div>

    <div class="final-cta">
      <h2>مدرسه‌یار، انتخابی که پشیمان نمی‌کند</h2>
      <p>کامل، فارسی، متعلق به خودتان و مادام‌العمر. برای دیدن نسخهٔ نمایشی یا دریافت مشاورهٔ رایگان، با شرکت دیس وب در تماس باشید.</p>
      <a class="btn btn-primary" href="https://disweb.ir" target="_blank" rel="noreferrer">${icon('phone', 18)} disweb.ir — شرکت دیس وب</a>
    </div>
  </div>
</section>
</main>

<footer>
  <div class="wrap cols">
    <div>
      <b>${icon('school', 20)} مدرسه‌یار — سامانهٔ مدیریت مدرسه</b>
      <small>ساخته، پشتیبانی و ارائه‌شده توسط <b style="color:#fff">شرکت دیس وب</b> — <a href="https://disweb.ir" target="_blank" rel="noreferrer">https://disweb.ir</a></small>
    </div>
    <div style="text-align:left">
      <b>نسخهٔ ${faNum('1.2.0')}</b>
      <small>${faNum(17)} ماژول · ${faNum(188)} قابلیت · ${faNum(33)} نوع پرونده · مادام‌العمر بدون اشتراک</small>
    </div>
  </div>
</footer>

<script>
(function () {
  document.documentElement.classList.remove('no-js');
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.tab-btn'));
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  function show(id, scroll) {
    tabs.forEach(function (t) { t.classList.toggle('active', t.id === 'tab-' + id); });
    buttons.forEach(function (b) { b.classList.toggle('active', b.dataset.tab === id); });
    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
    if (history.replaceState) history.replaceState(null, '', '#tab-' + id);
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () { show(b.dataset.tab, true); });
  });
  document.querySelectorAll('[data-goto]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      show(el.dataset.goto, true);
    });
  });
  var hash = (location.hash || '').replace('#tab-', '');
  if (hash && document.getElementById('tab-' + hash)) show(hash, false);
})();
</script>
</body>
</html>
`;
fs.writeFileSync(outPath, html);
console.log(`WROTE ${outPath} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
