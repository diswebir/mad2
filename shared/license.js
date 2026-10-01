import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { moduleDefs, featureDefs } from './catalog.js';

// ---------------------------------------------------------------------------
// فروش ماژولار: هر مشتری یک «لایسنس» امضاشده می‌گیرد که فهرست ماژول‌های خریده‌شده
// را مشخص می‌کند. لایسنس با کلید خصوصی فروشنده (Ed25519) امضا می‌شود و روی سرور
// مدرسه فقط با کلید عمومی بررسی می‌گردد؛ بنابراین نیازی به تماس با سرور فروشنده
// (اینترنت/تلفن‌خانه) نیست و مدرسه بدون اتصال هم کار می‌کند.
//
// حالت‌ها (متغیر محیطی LICENSE_MODE):
//   off  (پیش‌فرض) → همهٔ ماژول‌ها در دسترس‌اند؛ برای توسعه، دمو و نسخهٔ خودمیزبان.
//   on            → فقط ماژول‌های داخل لایسنس فعال می‌شوند؛ بدون لایسنس معتبر،
//                   فقط ماژول‌های پایه کار می‌کنند و مدیر پیام روشن می‌بیند.
// ---------------------------------------------------------------------------

export const ALL_MODULES = moduleDefs.map((m) => m.id);

// حداقل ماژول‌هایی که بدون آن‌ها سامانه قابل استفاده نیست. اگر لایسنس نباشد یا
// نامعتبر باشد، فقط همین‌ها بالا می‌آیند تا مدرسه قفل نشود.
export const BASE_MODULES = [
  'dashboard',
  'students',
  'teachers',
  'classes',
  'attendance',
  'education',
  'tickets',
  'announcements',
  'calendar',
  'notifications',
  'profile',
  'settings',
];

// بسته‌های آمادهٔ فروش. فروشنده می‌تواند با `--modules` ترکیب دلخواه بسازد.
export const EDITION_PRESETS = {
  base: { label: 'پایه', modules: BASE_MODULES },
  standard: { label: 'استاندارد', modules: [...BASE_MODULES, 'finance', 'library', 'reports'] },
  complete: { label: 'کامل', modules: ALL_MODULES },
};

const MODULE_BY_ID = new Map(moduleDefs.map((m) => [m.id, m]));
const FEATURE_BY_ID = new Map(featureDefs.map((f) => [f.id, f]));

export const moduleLabel = (id) => MODULE_BY_ID.get(id)?.name || id;
export const capabilityCount = (id) => featureDefs.filter((f) => f.module === id).length;

// ترتیب کلیدها یکسان می‌شود تا امضا در همهٔ نسخه‌های Node یکسان محاسبه شود.
export function stableSerialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
}

const signaturePayload = (payload) => Buffer.from(stableSerialize(payload), 'utf8');

export function signLicense(payload, privateKeyPem) {
  const key = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign(null, signaturePayload(payload), key);
  return { alg: 'ed25519', payload, signature: signature.toString('base64') };
}

export function verifyLicense(doc, publicKeyPem) {
  if (!doc || typeof doc !== 'object' || !doc.payload || !doc.signature)
    return { valid: false, reason: 'LICENSE_MALFORMED' };
  if (doc.alg && doc.alg !== 'ed25519') return { valid: false, reason: 'LICENSE_ALGORITHM' };
  let key;
  try {
    key = crypto.createPublicKey(publicKeyPem);
  } catch {
    return { valid: false, reason: 'PUBLIC_KEY_MISSING' };
  }
  let ok = false;
  try {
    ok = crypto.verify(
      null,
      signaturePayload(doc.payload),
      key,
      Buffer.from(String(doc.signature), 'base64'),
    );
  } catch {
    ok = false;
  }
  if (!ok) return { valid: false, reason: 'LICENSE_SIGNATURE' };
  const expires = String(doc.payload.expires || '').trim();
  if (
    expires &&
    /^\d{4}-\d{2}-\d{2}$/.test(expires) &&
    expires < new Date().toISOString().slice(0, 10)
  )
    return { valid: false, reason: 'LICENSE_EXPIRED', payload: doc.payload };
  return { valid: true, reason: 'OK', payload: doc.payload };
}

// یک لایسنس معتبر به فهرست ماژول/قابلیت مجاز تبدیل می‌شود.
export function resolveEntitlement({ mode = 'off', doc = null, publicKey = '' } = {}) {
  const wanted = String(mode || 'off').toLowerCase();
  const enforced = ['on', 'enforced', 'true', '1'].includes(wanted);
  const allowAll = {
    mode: 'off',
    enforced: false,
    valid: true,
    reason: 'LICENSE_MODE_OFF',
    payload: null,
    modules: [...ALL_MODULES],
    features: null,
  };
  if (!enforced) return allowAll;
  const fallback = (reason, payload = null) => ({
    mode: 'on',
    enforced: true,
    valid: false,
    reason,
    payload,
    modules: [...BASE_MODULES],
    features: null,
  });
  if (!doc) return fallback('LICENSE_MISSING');
  const checked = verifyLicense(doc, publicKey);
  if (!checked.valid) return fallback(checked.reason, checked.payload || null);
  const payload = checked.payload;
  const bought = Array.isArray(payload.modules)
    ? payload.modules.filter((id) => MODULE_BY_ID.has(id))
    : [];
  // ماژول‌های پایه همیشه با هر لایسنسی می‌آیند تا مدرسه با لایسنس ناقص قفل نشود؛
  // فهرست داخل لایسنس، ماژول‌های افزودنی خریداری‌شده است.
  const modules = Array.from(new Set([...BASE_MODULES, ...bought]));
  const features =
    Array.isArray(payload.features) && payload.features.length
      ? payload.features.filter((id) => FEATURE_BY_ID.has(id))
      : null;
  if (!bought.length && !features) return fallback('LICENSE_EMPTY', payload);
  return {
    mode: 'on',
    enforced: true,
    valid: true,
    reason: 'OK',
    payload,
    modules,
    features,
  };
}

export const moduleEntitled = (entitlement, moduleId) =>
  !entitlement || !entitlement.enforced || entitlement.modules.includes(moduleId);

export const featureEntitled = (entitlement, featureId) => {
  if (!entitlement || !entitlement.enforced) return true;
  const def = FEATURE_BY_ID.get(featureId);
  if (!def) return false;
  if (!entitlement.modules.includes(def.module)) return false;
  if (entitlement.features && !entitlement.features.includes(featureId)) return false;
  return true;
};

export const entitlementSummary = (entitlement) => ({
  mode: entitlement.mode,
  valid: entitlement.valid,
  reason: entitlement.reason,
  edition: entitlement.payload?.edition || (entitlement.enforced ? 'base' : 'complete'),
  customer: entitlement.payload?.customer || '',
  school: entitlement.payload?.school || '',
  license_id: entitlement.payload?.id || '',
  issued: entitlement.payload?.issued || '',
  expires: entitlement.payload?.expires || '',
  note: entitlement.payload?.note || '',
  modules: entitlement.modules,
});

const readKeyFile = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
};

// ترتیب اولویت کلید عمومی: متغیر محیطی → فایل → کلید ثابت داخل این ماژول.
export function resolvePublicKey(env = process.env) {
  const inline = String(env.LICENSE_PUBLIC_KEY || '')
    .replace(/\\n/g, '\n')
    .trim();
  if (inline) return inline;
  if (env.LICENSE_PUBLIC_KEY_PATH) {
    const fromFile = readKeyFile(env.LICENSE_PUBLIC_KEY_PATH);
    if (fromFile) return fromFile;
  }
  return VENDOR_PUBLIC_KEY.trim();
}

export function parseLicenseDocument(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const candidates = [text];
  try {
    candidates.push(Buffer.from(text, 'base64').toString('utf8'));
  } catch {
    /* not base64 */
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed?.payload && parsed?.signature) return parsed;
    } catch {
      /* try next */
    }
  }
  return null;
}

export function loadLicenseDocument({ dir, env = process.env } = {}) {
  if (env.LICENSE_KEY) return parseLicenseDocument(env.LICENSE_KEY);
  if (env.LICENSE_FILE) return parseLicenseDocument(readKeyFile(env.LICENSE_FILE));
  if (dir) {
    for (const name of ['license.json', 'license.key']) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) return parseLicenseDocument(readKeyFile(file));
    }
  }
  return null;
}

export function loadEntitlement({ dir, env = process.env, mode } = {}) {
  const resolvedMode = mode ?? env.LICENSE_MODE;
  const enforced = ['on', 'enforced', 'true', '1'].includes(
    String(resolvedMode || 'off').toLowerCase(),
  );
  const entitlement = resolveEntitlement({
    mode: resolvedMode,
    doc: enforced ? loadLicenseDocument({ dir, env }) : null,
    publicKey: resolvePublicKey(env),
  });
  // نشانی کلید عمومی هم برگردانده می‌شود تا فایل لایسنس بدون کلید، خطای روشن بدهد.
  if (enforced && !entitlement.valid && entitlement.reason === 'PUBLIC_KEY_MISSING')
    entitlement.reason = 'PUBLIC_KEY_MISSING';
  return entitlement;
}

// فروشنده پس از `npm run license:keygen` کلید عمومی خود را اینجا جای‌گذاری می‌کند
// (یا در .env روی هاست با LICENSE_PUBLIC_KEY تنظیم می‌کند).
export const VENDOR_PUBLIC_KEY = '';

export const LICENSE_REASON_LABELS = {
  OK: 'لایسنس معتبر است.',
  LICENSE_MODE_OFF: 'حالت لایسنس خاموش است؛ همهٔ ماژول‌ها در دسترس‌اند.',
  LICENSE_MISSING: 'لایسنس روی سرور پیدا نشد؛ فقط ماژول‌های پایه فعال هستند.',
  LICENSE_MALFORMED: 'فایل لایسنس خوانده نشد یا ساختار درستی ندارد.',
  LICENSE_ALGORITHM: 'الگوریتم امضای لایسنس پشتیبانی نمی‌شود.',
  LICENSE_SIGNATURE: 'امضای لایسنس با کلید فروشنده مطابقت ندارد.',
  LICENSE_EXPIRED: 'مهلت این لایسنس تمام شده است.',
  LICENSE_EMPTY: 'لایسنس هیچ ماژول معتبری ندارد.',
  PUBLIC_KEY_MISSING: 'کلید عمومی فروشنده روی سرور تنظیم نشده است.',
};

export const licenseReasonLabel = (reason) =>
  LICENSE_REASON_LABELS[reason] || 'وضعیت لایسنس نامشخص است.';
