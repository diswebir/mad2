import { format } from 'prettier';
import fs from 'node:fs';
import { featureDefs, moduleDefs, resourceDefs, roles } from '../shared/catalog.js';
const extraRoutes = {
  'dashboard.view': 'GET /api/dashboard',
  'dashboard.statistics': 'GET /api/dashboard → stats',
  'dashboard.chart': 'GET /api/dashboard?period=current|previous → chart',
  'dashboard.activities': 'GET /api/dashboard → activities',
  'students.profile': 'GET /api/students/:id/profile',
  'students.export': 'GET /api/entities/students/export',
  'students.import': 'POST /api/entities/students/import (multipart CSV)',
  'students.account': 'POST /api/settings/accounts/create/students/:id + auto on create',
  'teachers.account': 'POST /api/settings/accounts/create/teachers/:id + auto on create',
  'classes.roster': 'GET /api/classes/:id/roster',
  'attendance.view': 'GET /api/attendance?class_id=&date=',
  'attendance.record': 'POST /api/attendance',
  'attendance.bulk': 'POST /api/attendance (records > 1)',
  'attendance.export': 'GET /api/attendance/export',
  'attendance.history': 'GET /api/attendance/student/:id',
  'tickets.view': 'GET /api/tickets + GET /api/tickets/:id',
  'tickets.create': 'POST /api/tickets',
  'tickets.reply': 'POST /api/tickets/:id/messages',
  'tickets.manage': 'PATCH /api/tickets/:id',
  'tickets.attachments': 'POST /api/files?context=tickets + authorized GET /api/files/:id',
  'assignments.submit': 'POST /api/assignments/:id/submit',
  'assignments.review':
    'GET /api/assignments/:id/submissions + PATCH /api/assignments/:id/submissions/:submissionId',
  'reports.view': 'GET /api/reports',
  'reports.export': 'GET /api/reports/export',
  'notifications.view': 'GET /api/notifications',
  'notifications.read': 'PATCH /api/notifications/read',
  'profile.edit': 'PATCH /api/auth/profile',
  'profile.password': 'POST /api/auth/password',
  'settings.school': 'PATCH /api/settings/school',
  'settings.modules': 'PATCH /api/settings/modules/:id + PATCH /api/settings/features/:id',
  'settings.accounts': 'GET/POST /api/settings/accounts + PATCH /api/settings/accounts/:id',
  'settings.reset_password': 'POST /api/settings/accounts/:id/reset-password',
  'settings.backup': 'GET /api/settings/backup',
  'settings.audit': 'GET /api/settings/audit',
  'settings.restore': 'POST /api/settings/backup/restore + GET /api/settings/restore/history',
  'settings.messaging':
    'GET/PATCH /api/settings/messaging + POST /api/settings/messaging/test + GET /api/settings/outbox',
  'settings.status': 'GET /api/status',
  'settings.support': 'GET /api/support/reports + PATCH /api/support/reports/:id',
  'support.report': 'POST /api/support/report',
  'exports.xlsx': 'GET /api/entities/:resource/export?format=xlsx + report endpoints',
  'print.documents': 'UI /print/cards/:classId?student= + چاپ صورتحساب و گزارش حضور',
  'grades.bulk': 'POST /api/assignments/grades/bulk',
  'reports.report_card': 'GET /api/analysis/report-card/:studentId + /api/analysis/report-cards',
  'reports.trend': 'GET /api/analysis/trend/:studentId',
  'reports.debtors': 'GET /api/finance/debtors?format=csv|xlsx',
  'reports.ministerial': 'GET /api/analysis/ministerial?type=students|grades&format=csv|xlsx',
  'reports.promote': 'GET /api/analysis/promotion/preview + POST /api/analysis/promotion/apply',
  'student_years.view': 'GET /api/analysis/student-years',
  'finance.installments': 'POST /api/finance/installments',
  'finance.late_fee': 'POST /api/finance/invoices/:id/late-fee + GET /api/finance/debtors',
  'library.renew': 'POST /api/library/loans/:id/renew',
  'library.reserve': 'GET/POST /api/library/reservations + PATCH /api/library/reservations/:id',
  'library.fines': 'POST /api/library/loans/:id/fine + GET /api/library/overdue',
  'loans.edit': 'PATCH /api/entities/loans/:id + POST /api/library/loans/:id/return',
  'leaves.view': 'GET /api/leaves + UI /attendance?tab=leaves',
  'leaves.submit': 'POST /api/leaves + DELETE /api/leaves/:id',
  'leaves.approve': 'PATCH /api/leaves/:id/decision',
  'meetings.book': 'POST /api/meetings/book + PATCH /api/meetings/bookings/:id',
  'meetings.manage': 'POST/DELETE /api/meetings/slots',
  'meeting_slots.view': 'GET /api/meetings/slots + GET /api/meetings/bookings + UI /meetings',
  'reservations.view': 'GET /api/library/reservations + UI /library?tab=reservations',
  'staff_attendance.view': 'GET /api/entities/staff_attendance + UI /teachers?tab=staff_attendance',
  'staff_payroll.view': 'GET /api/entities/staff_payroll + UI /teachers?tab=staff_payroll',
  'staff.view': 'GET /api/entities/staff + UI /teachers?tab=staff',
  'leaves.create': 'POST /api/entities/leaves (مدیر)',
};
const ui = {
  dashboard: '/',
  students: '/students',
  teachers: '/teachers',
  classes: '/classes',
  attendance: '/attendance',
  education: '/education',
  tickets: '/tickets',
  announcements: '/announcements',
  calendar: '/calendar',
  finance: '/finance',
  library: '/library',
  services: '/services',
  meetings: '/meetings',
  reports: '/reports',
  notifications: '/notifications',
  profile: '/profile',
  settings: '/settings',
};
const crudRoute = (f) =>
  ({
    view: `GET /api/entities/${f.resource}`,
    create: `POST /api/entities/${f.resource}`,
    edit: `PATCH /api/entities/${f.resource}/:id`,
    delete: `DELETE /api/entities/${f.resource}/:id`,
  })[f.action];
const roleNames = (f) => {
  if (f.resource)
    return (f.action === 'view' ? resourceDefs[f.resource].read : resourceDefs[f.resource].write)
      .map((r) => roles[r])
      .join('، ');
  if (
    f.id.startsWith('settings.') ||
    ['students.import', 'students.account', 'teachers.account'].includes(f.id)
  )
    return roles.admin;
  if (['attendance.record', 'attendance.bulk', 'assignments.review'].includes(f.id))
    return `${roles.admin}، ${roles.teacher}`;
  if (f.id === 'assignments.submit') return roles.student;
  if (f.id === 'tickets.manage') return 'گیرندهٔ تیکت یا مدیر';
  return 'همه نقش‌ها با scope مجاز';
};
let text = `# فهرست دقیق ${featureDefs.length} قابلیت سامانه\n\nاین فهرست از \`shared/catalog.js\` با \`npm run features\` ساخته می‌شود. همهٔ موارد زیر endpoint یا بخش UI واقعی دارند؛ برنامه‌ریزی آینده در این شمارش نیست.\n\n**تعریف شمارش:** ${Object.keys(resourceDefs).length} نوع پرونده × چهار عملیات مستقل مشاهده/جست‌وجو/فیلتر/صفحه‌بندی، ثبت، ویرایش و حذف ایمن؛ به‌علاوهٔ workflow‌ها و کنترل‌های مستقل مانند کد پیگیری خطا، بازیابی پشتیبان، صف پیامک/ایمیل، ارتقای پایان سال و ویرایش گروهی. شمارش دقیق هر ماژول در سرصفحهٔ همان بخش آمده است.\n\nکلید ماژول و کلید قابلیت در UI و سرور اعمال می‌شوند. نقش و scope حتی پس از فعال‌بودن کلید لازم‌اند. قابلیت مدیریت کلیدها و ماژول پایهٔ تنظیمات برای جلوگیری از قفل مدیریت ضروری‌اند. «تغییر رمز اجباری» نیز با خاموش‌شدن تغییر رمز اختیاری از دسترس خارج نمی‌شود.\n\n`;
let index = 0;
for (const mod of moduleDefs) {
  const features = featureDefs.filter((f) => f.module === mod.id);
  text += `## ${mod.name} — ${new Intl.NumberFormat('fa-IR').format(features.length)} قابلیت\n\n${mod.description}\n\n| ردیف | قابلیت | کلید ثابت | دسترسی | وضعیت |\n| --- | --- | --- | --- | --- |\n`;
  for (const f of features) {
    const route = f.resource ? crudRoute(f) : extraRoutes[f.id];
    if (!route) throw new Error(`Missing implementation mapping: ${f.id}`);
    text += `| ${++index} | ${f.name} | \`${f.id}\` | ${roleNames(f)} | ${f.locked ? 'هستهٔ ضروری' : 'پیاده‌سازی‌شده'} |\n`;
  }
  text += `\n**محل استفاده:** \`${ui[mod.id]}\`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.\n\n`;
  for (const f of features)
    text += `- **${f.id}**: \`${f.resource ? crudRoute(f) : extraRoutes[f.id]}\`\n`;
  text += '\n';
}
text +=
  '## ابزارهای تکمیلی خارج از شمارش\n\nویزارد نصب توکن‌دار، جست‌وجوی سراسری مجاز، فونت محلی وزیرمتن، رابط کامل RTL، تقویم و انتخاب‌گر تاریخ جلالی، مرتب‌سازی ستون‌ها، عملیات گروهی ردیف‌ها، چاپ کارنامه و صورتحساب، خروجی xlsx، صفحهٔ وضعیت سرویس، گزارش خطای کاربران با کد پیگیری، بستهٔ cPanel و نصب در زیرپوشه (BASE_PATH) وجود دارند ولی دوباره در شمارش ماژول‌ها تکرار نشده‌اند.\n\n## وضعیت نسخهٔ ۱.۱\n\nنسخهٔ نخست SMS/ایمیل خودکار، اتصال سناد/شاد، کارنامهٔ رسمی، درگاه پرداخت آنلاین، MFA و آزمون آنلاین سؤالی نداشت. در نسخهٔ ۱.۱ این موارد اضافه شد: پل پیامک/ایمیل با صف ارسال و تلاش دوباره، خروجی استاندارد وزارتی (CSV و XLSX)، کارنامهٔ دوره با چاپ و بایگانی سالانه، ثبت گروهی نمره، اقساط و جریمهٔ دیرکرد با گزارش بدهکاران، مرخصی با گردش تأیید، ملاقات اولیا با نوبت‌دهی، کتابخانه با رزرو/تمدید/جریمه، کارکنان و حضور کارکنان، بازیابی پشتیبان، صفحهٔ وضعیت و گزارش خطا، و نصب در زیرپوشه.\n\nدرگاه پرداخت آنلاین، MFA و آزمون آنلاین سؤالی همچنان در نقشهٔ راه است. درگاه بانکی در نسخهٔ ۱.۱ فقط به‌صورت ثبت رسید واریز کار می‌کند.\n\n## آزمون\n\n`tests/api.test.js` همهٔ عملیات عمومی CRUD را روی ${Object.keys(resourceDefs).length} نوع پرونده اجرا می‌کند و مجوز، خاموش‌شدن ماژول/قابلیت، تراکنش، حضور، تیکت، فایل، تکلیف، پرداخت، ورود اجباری رمز، نصب یک‌باره و دوام/قفل بانک را نیز بررسی می‌کند. `tests/round3.test.js` قابلیت‌های نسخهٔ ۱.۱ (تقویم جلالی، xlsx، مالی، مرخصی، ملاقات، کتابخانه، تحلیل و ارتقا، عملیات گروهی، وضعیت سرویس، پیام‌رسانی و بازیابی پشتیبان) را پوشش می‌دهد. تست مرورگر در `tests/ui.spec.js` است و نصب زیرپوشه در `tests/deploy.test.js` بررسی می‌شود.\n';
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/FEATURES.md', await format(text, { parser: 'markdown', printWidth: 100 }));
console.log(`Generated docs/FEATURES.md: ${index} features / ${moduleDefs.length} modules.`);
