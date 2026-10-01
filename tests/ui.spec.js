import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/database.js';
import { moduleGroups, resourceDefs } from '../shared/catalog.js';
import { createApp } from '../server/app.js';

const browserErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) || []).toEqual([]);
});

async function dashboard(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'داشبورد مدرسه', exact: true })).toBeVisible();
  await expect(page.locator('.stat-card')).toHaveCount(4);
}
async function closeCredentials(page) {
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: 'اطلاعات ورود آماده است' }) });
  await expect(dialog.getByRole('heading', { name: 'اطلاعات ورود آماده است' })).toBeVisible();
  const values = await dialog.locator('strong[dir="ltr"]').allTextContents();
  await dialog.getByRole('button', { name: 'متوجه شدم', exact: true }).click();
  return { username: values[0], password: values[1] };
}
async function logout(page) {
  await page.locator('.profile-button').click();
  await page.getByRole('button', { name: 'خروج از حساب', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'خوش آمدید!' })).toBeVisible();
}
async function loginAndRotate(page, account, password) {
  await page.getByLabel('نام کاربری', { exact: true }).fill(account.username);
  await page.getByLabel('رمز عبور', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'ورود به حساب', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('heading', { name: 'یک قدم تا ورود امن' })).toBeVisible();
  await modal.getByLabel('رمز موقت فعلی', { exact: true }).fill(account.password);
  await modal.getByLabel('رمز عبور جدید', { exact: true }).fill(password);
  await modal.getByLabel('تکرار رمز جدید', { exact: true }).fill(password);
  await modal.getByRole('button', { name: 'تغییر رمز و ورود به پنل', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'داشبورد مدرسه' })).toBeVisible();
}

test('dashboard, local font, scoped global search and student grade file', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await dashboard(page);
  await expect(page.locator('.stat-value').first()).toContainText('۲۴۰');
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain(
    'Vazirmatn',
  );
  expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('نام یا عنوان را بنویسید...').fill('آراد حسینی');
  await page.locator('.search-results button').first().click();
  const profile = page.getByRole('dialog');
  await expect(profile.locator('.student-profile-hero')).toContainText('آراد حسینی');
  await profile.getByRole('button', { name: 'نمرات', exact: true }).click();
  await expect(profile.locator('tbody tr')).toHaveCount(5);
  await profile.getByRole('button', { name: 'اولیا و تماس', exact: true }).click();
  await expect(profile).toContainText('09121000000');
  await profile.getByRole('button', { name: 'بستن پنجره', exact: true }).click();
  expect(errors).toEqual([]);
});

test('manager creates teacher, classroom, student; first logins rotate passwords and private ticket works', async ({
  page,
}) => {
  await dashboard(page);
  await page.goto('/teachers');
  await page.getByRole('button', { name: 'افزودن معلم', exact: true }).click();
  await page.locator('#field-teachers-first_name').fill('لیلا');
  await page.locator('#field-teachers-last_name').fill('آزمایش');
  await page.locator('#field-teachers-national_id').fill('2999999918');
  await page.locator('#field-teachers-specialty').fill('فیزیک');
  await page.locator('#field-teachers-phone').fill('09120000555');
  await page.getByRole('button', { name: 'ثبت معلم', exact: true }).click();
  const teacher = await closeCredentials(page);
  await page.goto('/classes');
  await page.getByRole('button', { name: 'افزودن کلاس', exact: true }).click();
  await page.locator('#field-classes-name').fill('کلاس آزمایشی');
  await page.locator('#field-classes-grade').selectOption('1');
  await page.locator('#field-classes-teacher_id').selectOption({ label: 'لیلا آزمایش' });
  await page.locator('#field-classes-room').fill('۲۰۱');
  await page.getByRole('button', { name: 'ثبت کلاس', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.class-card').first()).toContainText('کلاس آزمایشی');
  await page.goto('/students');
  await page.getByRole('button', { name: 'افزودن دانش‌آموز', exact: true }).click();
  await page.locator('#field-students-first_name').fill('سینا');
  await page.locator('#field-students-last_name').fill('آزمایش');
  await page.locator('#field-students-national_id').fill('1999999917');
  await page.locator('#field-students-class_id').selectOption({ label: 'کلاس آزمایشی' });
  await page.locator('#field-students-guardian_name').fill('رضا آزمایش');
  await page.locator('#field-students-guardian_phone').fill('09121234560');
  await page.getByRole('button', { name: 'ثبت دانش‌آموز', exact: true }).click();
  const student = await closeCredentials(page);
  await expect(page.locator('.resource-table tbody tr').first()).toContainText('سینا آزمایش');
  await logout(page);
  await loginAndRotate(page, student, 'StudentNewSecure123!');
  await expect(page.locator('.stat-value').first()).toContainText('۱');
  await page.goto('/tickets');
  await page.getByRole('button', { name: 'تیکت جدید', exact: true }).click();
  const ticket = page.getByRole('dialog');
  await ticket.getByLabel(/موضوع تیکت/).fill('پیگیری آزمایشی');
  await ticket.getByLabel(/گیرنده/).selectOption({ label: 'لیلا آزمایش · معلم' });
  await ticket.getByLabel(/متن پیام/).fill('سلام، برای تمرین فیزیک راهنمایی می‌خواهم.');
  await ticket.getByRole('button', { name: 'ارسال تیکت', exact: true }).click();
  await expect(page.locator('.conversation-header')).toContainText('پیگیری آزمایشی');
  await expect(page.locator('.message-bubble')).toContainText('راهنمایی می‌خواهم');
  await logout(page);
  await loginAndRotate(page, teacher, 'TeacherNewSecure123!');
  await expect(page.locator('.stat-value').first()).toContainText('۱');
  await page.goto('/tickets');
  await expect(page.locator('.conversation-header')).toContainText('پیگیری آزمایشی');
  await page.getByLabel('متن پاسخ تیکت').fill('حتماً، تمرین را در کلاس بررسی می‌کنیم.');
  await page.getByRole('button', { name: 'ارسال پاسخ', exact: true }).click();
  await expect(page.locator('.message-bubble')).toHaveCount(2);
});

test('attendance saves edits, bulk presence and downloadable CSV', async ({ page }) => {
  await dashboard(page);
  await page.goto('/attendance');
  await expect(page.locator('.attendance-table tbody tr')).toHaveCount(20);
  const first = page.locator('.attendance-table tbody tr').first();
  await first.getByRole('button', { name: 'غایب', exact: true }).click();
  await first.locator('.attendance-note-input').fill('پیگیری تست مرورگر');
  await page.getByRole('button', { name: /ذخیره تغییرات/ }).click();
  await expect(page.locator('.toast-container')).toContainText('ذخیره شد');
  await expect(first.locator('.attendance-note-input')).toHaveValue('پیگیری تست مرورگر');
  await page.getByRole('button', { name: 'همه حاضر', exact: true }).click();
  await page.getByRole('button', { name: /ذخیره تغییرات/ }).click();
  await expect(page.locator('.attendance-summary-card').first()).toContainText('۲۰');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'دریافت گزارش', exact: true }).click();
  const file = await event;
  expect(file.suggestedFilename()).toMatch(/\.csv$/);
});

test('module and individual switches change the UI and block the corresponding API', async ({
  page,
}) => {
  await dashboard(page);
  await page.goto('/modules');
  const library = page
    .locator('.module-card')
    .filter({ has: page.getByRole('heading', { name: 'کتابخانه', exact: true }) });
  await library.getByRole('switch').click();
  await page.getByRole('dialog').getByRole('button', { name: 'غیرفعال شود', exact: true }).click();
  await expect(library).toHaveClass(/module-disabled/);
  expect((await page.request.get('/api/entities/books')).status()).toBe(403);
  await library.getByRole('switch').click();
  await expect(library).not.toHaveClass(/module-disabled/);
  const students = page
    .locator('.module-card')
    .filter({ has: page.getByRole('heading', { name: 'دانش‌آموزان', exact: true }) });
  await students.getByRole('button', { name: 'مدیریت قابلیت‌ها', exact: true }).click();
  await page.getByRole('switch', { name: 'غیرفعال کردن ثبت دانش‌آموز', exact: true }).click();
  await expect(
    page.getByRole('switch', { name: 'فعال کردن ثبت دانش‌آموز', exact: true }),
  ).toHaveAttribute('aria-checked', 'false');
  const { csrf } = await (await page.request.get('/api/auth/me')).json();
  const denied = await page.request.post('/api/entities/students', {
    data: {},
    headers: { 'X-CSRF-Token': csrf },
  });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error).toContain('قابلیت');
  await page.getByRole('switch', { name: 'فعال کردن ثبت دانش‌آموز', exact: true }).click();
  await expect(
    page.getByRole('switch', { name: 'غیرفعال کردن ثبت دانش‌آموز', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
});

test('teacher, student and parent panels have their own scoped content', async ({ page }) => {
  await dashboard(page);
  for (const [role, count, name] of [
    ['معلم', '۲۰', 'سارا محمدی'],
    ['دانش‌آموز', '۱', 'آراد حسینی'],
    ['ولی دانش‌آموز', '۱', 'رضا حسینی'],
  ]) {
    await page.locator('.profile-button').click();
    await page.getByRole('button', { name: role, exact: true }).click();
    await expect(page.locator('.profile-button')).toContainText(name);
    await expect(page.locator('.stat-value').first()).toContainText(count);
    const list = await (await page.request.get('/api/entities/students')).json();
    expect(list.total).toBe(role === 'معلم' ? 20 : 1); // Text uses Persian digits; the API count is numeric.
  }
});

test('mobile menu and data table do not overflow the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await dashboard(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'باز کردن منو', exact: true }).click();
  await expect(page.locator('.sidebar')).toHaveClass(/is-open/);
  await page.locator('.sidebar').getByRole('link', { name: 'دانش‌آموزان', exact: true }).click();
  await expect(page.locator('.resource-table tbody tr').first()).toBeVisible();
  await expect(page.locator('.sidebar')).not.toHaveClass(/is-open/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('five-step wizard installs a fresh school with secure inactive sample accounts', async ({
  page,
}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'madresehyar-install-ui-'));
  const db = await openDatabase({ dataDir: dir, memory: true });
  const token = 'only-for-install-ui-test-1234567890';
  const server = createApp(db, { demo: false, installToken: token }).listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await expect(page.getByRole('heading', { name: 'بررسی آمادگی', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'شروع راه‌اندازی', exact: true }).click();
    await page.getByLabel(/نام مدرسه/).fill('مدرسه آزمون نصب');
    await page.getByLabel(/نام مدیر/).fill('مدیر آزمون');
    await page.getByRole('button', { name: 'مرحله بعد', exact: true }).click();
    await page.getByLabel(/نام کاربری مدیر/).fill('principal');
    await page.getByLabel('رمز عبور مدیر', { exact: true }).fill('InstalledSecurePass123!');
    await page.getByLabel('توکن نصب', { exact: true }).fill(token);
    await page.getByRole('button', { name: 'مرحله بعد', exact: true }).click();
    await expect(page.locator('.wizard-modules')).toBeVisible();
    await page.getByRole('button', { name: 'نصب و راه‌اندازی مدرسه', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'همه‌چیز آماده است!', exact: true }),
    ).toBeVisible();
    expect(db.setting('installed')).toBe(true);
    expect(db.get("SELECT COUNT(*) n FROM users WHERE role!='admin' AND active=1").n).toBe(0);
    await page.getByRole('button', { name: 'ورود به پنل مدرسه', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'داشبورد مدرسه' })).toBeVisible();
    await expect(page.locator('.profile-button')).toContainText('مدیر آزمون');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function switchRole(page, role) {
  await page.locator('.profile-button').click();
  await page.getByRole('button', { name: role, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'داشبورد مدرسه', exact: true })).toBeVisible();
}

test('calendar creates an event and nested invoice form records an actual receipt', async ({
  page,
}) => {
  await dashboard(page);
  await page.goto('/calendar');
  await page.getByRole('button', { name: 'رویداد جدید', exact: true }).click();
  await page.locator('#field-events-title').fill('جلسه آزمایشی اولیا');
  await page.locator('#field-events-location').fill('سالن اجتماعات');
  await page.getByRole('button', { name: 'ثبت رویداد', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.calendar-agenda')).toContainText('جلسه آزمایشی اولیا');
  await page.goto('/finance');
  await page.locator('.resource-table tbody tr .table-title-button').first().click();
  await page.getByRole('button', { name: 'ثبت پرداخت', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(2);
  await page.locator('#field-payments-amount').fill('10000');
  await page.locator('#field-payments-reference').fill('UI-RECEIPT-001');
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'ثبت پرداخت', exact: true })
    .click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(page.locator('dialog[open] tbody')).toContainText('UI-RECEIPT-001');
});

test('student uploads a Persian-named assignment and teacher reviews it in a nested modal', async ({
  page,
}) => {
  await dashboard(page);
  await switchRole(page, 'دانش‌آموز');
  await page.goto('/education?tab=assignments');
  await page.locator('.resource-table tbody tr .table-title-button').first().click();
  await page.getByLabel('متن پاسخ', { exact: true }).fill('پاسخ آزمایشی مرورگر با راه‌حل کامل.');
  await page.locator('.assignment-submit-form input[type=file]').setInputFiles({
    name: 'تمرین-آزمایشی.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('پاسخ تمرین در فایل متنی'),
  });
  await page.getByRole('button', { name: 'ارسال مجدد پاسخ', exact: true }).click();
  await expect(page.locator('.submission-card')).toContainText('پاسخ آزمایشی مرورگر');
  await expect(page.locator('.submission-card .file-link')).toContainText('تمرین-آزمایشی.txt');
  await page.getByRole('button', { name: 'بستن پنجره', exact: true }).click();
  await switchRole(page, 'معلم');
  await page.goto('/education?tab=assignments');
  await page.locator('.resource-table tbody tr .table-title-button').first().click();
  await page.getByRole('button', { name: 'ارزیابی پاسخ', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(2);
  await page.getByLabel(/نمره از/).fill('19');
  await page.getByLabel('بازخورد معلم', { exact: true }).fill('راه‌حل درست و مرتب است.');
  await page.getByRole('button', { name: 'ثبت ارزیابی', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(page.locator('.teacher-feedback')).toContainText('راه‌حل درست و مرتب است.');
  await expect(page.locator('.submission-card')).toContainText('نمره ۱۹');
});

test('existing teacher can receive an account later, with no duplicate-creation button', async ({
  page,
}) => {
  await dashboard(page);
  const { csrf } = await (await page.request.get('/api/auth/me')).json();
  const headers = { 'X-CSRF-Token': csrf };
  await page.request.patch('/api/settings/features/teachers.account', {
    data: { enabled: false },
    headers,
  });
  await page.goto('/teachers');
  await page.getByRole('button', { name: 'افزودن معلم', exact: true }).click();
  for (const [key, value] of Object.entries({
    first_name: 'بهار',
    last_name: 'پژوهش',
    national_id: '2999999919',
    specialty: 'علوم',
    phone: '09120000556',
  }))
    await page.locator(`#field-teachers-${key}`).fill(value);
  await page.getByRole('button', { name: 'ثبت معلم', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.request.patch('/api/settings/features/teachers.account', {
    data: { enabled: true },
    headers,
  });
  await page.reload();
  await page.locator('.resource-table tbody tr .person-cell').first().click();
  await page.getByRole('button', { name: 'ساخت حساب کاربری', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(2);
  const account = await closeCredentials(page);
  expect(account.username).toBe('t2999999919');
  await expect(page.getByRole('button', { name: 'ساخت حساب کاربری', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'بستن پنجره', exact: true }).click();
  await page.locator('.resource-table tbody tr .person-cell').first().click();
  await expect(page.getByRole('button', { name: 'ساخت حساب کاربری', exact: true })).toHaveCount(0);
});

test('all generic resource screens, reports, notifications, profile and settings tabs render', async ({
  page,
}) => {
  test.setTimeout(90000);
  await dashboard(page);
  for (const [module, resources] of Object.entries(moduleGroups)) {
    if (module === 'calendar') continue;
    for (const resource of resources) {
      await page.goto(`/${module}?tab=${resource}`);
      await expect(page.locator('.resource-table tbody tr,.resource-card').first()).toBeVisible();
      await expect(page.locator('.error-box')).toHaveCount(0);
    }
  }
  for (const route of [
    '/reports',
    '/notifications',
    '/profile',
    '/settings?tab=accounts',
    '/settings?tab=audit',
    '/settings?tab=backup',
  ]) {
    await page.goto(route);
    await expect(page.locator('.page-header h1')).toBeVisible();
    await expect(page.locator('.error-box')).toHaveCount(0);
  }
});

test('disabled read capability redirects instead of breaking the page and hides aggregate data', async ({
  page,
}) => {
  await dashboard(page);
  const { csrf } = await (await page.request.get('/api/auth/me')).json();
  const headers = { 'X-CSRF-Token': csrf };
  await page.request.patch('/api/settings/features/students.view', {
    data: { enabled: false },
    headers,
  });
  try {
    await page.goto('/students');
    await expect(page.getByRole('heading', { name: 'داشبورد مدرسه', exact: true })).toBeVisible();
    await expect(page.locator('.stat-card').first()).toBeVisible();
    await switchRole(page, 'دانش‌آموز');
    await page.goto('/students');
    await expect(page.getByRole('heading', { name: 'داشبورد مدرسه', exact: true })).toBeVisible();
    await expect(page.locator('.error-box')).toHaveCount(0);
    await page.goto('/reports');
    await expect(page.locator('.report-stat').first()).toBeVisible();
  } finally {
    // The switch happened on the student session; return to the manager session before restoring.
    await switchRole(page, 'مدیر مدرسه');
    const fresh = await (await page.request.get('/api/auth/me')).json();
    await page.request.patch('/api/settings/features/students.view', {
      data: { enabled: true },
      headers: { 'X-CSRF-Token': fresh.csrf },
    });
  }
});

test('a stale edit is reported with a conflict message instead of silently overwriting', async ({
  page,
}) => {
  await dashboard(page);
  const latest = await (await page.request.get('/api/entities/students?limit=1')).json();
  const target = latest.rows[0];
  await page.goto('/students?tab=students');
  await page.locator('.resource-table tbody tr .person-cell').first().click();
  const profile = page.getByRole('dialog');
  await profile.getByRole('button', { name: 'ویرایش پرونده', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.locator('#field-students-address').fill('نشانی ویرایش‌شده در مرورگر');
  const { csrf } = await (await page.request.get('/api/auth/me')).json();
  await page.request.patch(`/api/entities/students/${target.id}`, {
    data: { address: 'تغییر هم‌زمان مدیر دیگر', revision: target.revision },
    headers: { 'X-CSRF-Token': csrf },
  });
  await form.getByRole('button', { name: 'ذخیره تغییرات', exact: true }).click();
  await expect(form.locator('.error-box')).toContainText('دوباره دریافت کنید');
  await page.reload();
  await expect(page.locator('.error-box')).toHaveCount(0);
});

test('a graded assignment is locked for the student until the teacher reopens it', async ({
  page,
}) => {
  await dashboard(page);
  const { csrf } = await (await page.request.get('/api/auth/me')).json();
  const headers = { 'X-CSRF-Token': csrf };
  const assignment = await (await page.request.get('/api/entities/assignments/1')).json();
  const submissions = await (await page.request.get('/api/assignments/1/submissions')).json();
  const submission = submissions.find((row) => row.student_id === 1);
  await page.request.patch(`/api/assignments/1/submissions/${submission.id}`, {
    data: {
      score: 18,
      feedback: 'ارزیابی نهایی',
      allow_resubmit: false,
      revision: submission.revision,
    },
    headers,
  });
  expect(assignment.id).toBe(1);
  await switchRole(page, 'دانش‌آموز');
  await page.goto('/education?tab=assignments');
  await page.locator('.resource-table tbody tr .table-title-button').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('قفل‌شده');
  await expect(dialog.getByRole('button', { name: 'ارسال مجدد پاسخ', exact: true })).toBeDisabled();
});

test('notifications are opened one by one and the unread counter follows', async ({ page }) => {
  await dashboard(page);
  await switchRole(page, 'دانش‌آموز');
  const before = await (await page.request.get('/api/notifications?paginated=1')).json();
  expect(before.unread).toBeGreaterThan(0);
  await page.goto('/notifications');
  await page.locator('.full-notification-item').first().click();
  await expect(page.locator('.page-header h1')).toBeVisible();
  await page.goto('/notifications');
  const after = await (await page.request.get('/api/notifications?paginated=1')).json();
  expect(after.unread).toBe(before.unread - 1);
  await page.getByRole('button', { name: 'خواندن همه اعلان‌ها', exact: true }).click();
  await expect(page.locator('.badge', { hasText: 'خوانده‌نشده' })).toContainText('۰');
});

test('attendance keeps guardian numbers private from members and fits small screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await dashboard(page);
  await page.goto('/attendance');
  await expect(page.locator('.attendance-table tbody tr').first()).toBeVisible();
  await expect(page.locator('.attendance-table')).toContainText('0912');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await switchRole(page, 'دانش‌آموز');
  await page.goto('/attendance');
  await expect(page.locator('.attendance-table tbody tr').first()).toBeVisible();
  await expect(page.locator('.attendance-table')).not.toContainText('تماس ولی');
  await expect(page.locator('.attendance-table')).not.toContainText('0912');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
