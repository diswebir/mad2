// CommonJS entry point compatible with cPanel / Passenger.
// پیش‌آزمون وابستگی‌ها: اگر node_modules ناقص باشد، به‌جای خطای گنگ یک راهنمای
// فینگیلیش چاپ می‌شود (خروجی ترمینال لاتین می‌ماند تا در cmd ویندوز به هم نریزد).
const { createRequire } = require('node:module');
const appRequire = createRequire(__filename);
const REQUIRED_PACKAGES = [
  'bcryptjs',
  'compression',
  'cookie-parser',
  'csv-parse',
  'dotenv',
  'express',
  'express-rate-limit',
  'fflate',
  'helmet',
  'multer',
  'sql.js',
  'zod',
];
const missing = REQUIRED_PACKAGES.filter((name) => {
  try {
    appRequire.resolve(name);
    return false;
  } catch {
    return true;
  }
});
if (missing.length > 0) {
  console.error('Application startup failed: missing npm packages: ' + missing.join(', '));
  console.error(
    'How to fix (Finglish): dar folder-e khode app in dastoor ra bezanid:  npm install --omit=dev',
  );
  console.error(
    'ya dar cPanel -> Setup Node.js App dokmeye "Run NPM Install" ra bezanid, bad Restart.',
  );
  console.error(
    'Agar baz ham kari nakard, package-e jadid ra (ke node_modules darad) dobare Upload konid.',
  );
  process.exit(1);
}
import('./server/index.js').catch((error) => {
  console.error('Application startup failed:', error);
  process.exit(1);
});
