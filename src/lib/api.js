import { schoolDate } from '../../shared/dates';
// Vite bakes BASE_URL from BASE_PATH at build time; every request follows the mount point.
export const baseUrl = import.meta.env.BASE_URL || '/';
const withBase = (path) => `${baseUrl.replace(/\/$/, '')}${path}`;
let csrfToken = null;
export const setCsrf = (value) => {
  csrfToken = value;
};
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function api(path, options = {}) {
  const { body, ...rest } = options;
  const headers = {
    ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...options.headers,
  };
  const response = await fetch(withBase(`/api${path}`), {
    credentials: 'same-origin',
    ...rest,
    headers,
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(data.error || 'ارتباط با سامانه برقرار نشد.', response.status, data.code);
  return data;
}
export async function download(path, filename) {
  const response = await fetch(withBase(`/api${path}`), { credentials: 'same-origin' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || 'دانلود ناموفق بود.', response.status);
  }
  const blob = await response.blob(),
    url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function upload(file, context) {
  const body = new FormData();
  body.append('file', file);
  return api(`/files?context=${context}`, { method: 'POST', body });
}
export const fa = (value) =>
  new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(value ?? 0);
export const money = (value) => `${fa(value)} تومان`;
export const today = schoolDate;
export const describeError = (error) =>
  error?.code === 'STALE_RECORD'
    ? `${error.message} اطلاعات تازه بارگذاری شد؛ تغییر خود را دوباره بررسی و ثبت کنید.`
    : error?.code === 'AUTH_REQUIRED'
      ? 'نشست شما پایان یافته است؛ دوباره وارد شوید.'
      : error?.message || 'مشکلی رخ داد.';
const asDate = (value) =>
  value instanceof Date
    ? value
    : new Date(value?.length === 19 && value.includes(' ') ? value.replace(' ', 'T') + 'Z' : value);
export const dateFa = (value, options = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  value ? new Intl.DateTimeFormat('fa-IR', options).format(asDate(value)) : '—';
export const timeFa = (value) =>
  value
    ? new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(asDate(value))
    : '—';
export const absoluteUrl = (path) => withBase(path);
export const query = (object) =>
  new URLSearchParams(
    Object.fromEntries(
      Object.entries(object).filter(([, v]) => v !== '' && v !== null && v !== undefined),
    ),
  ).toString();
export const labelMap = {
  active: 'فعال',
  inactive: 'غیرفعال',
  graduated: 'فارغ‌التحصیل',
  present: 'حاضر',
  absent: 'غایب',
  late: 'تأخیر',
  excused: 'غیبت موجه',
  open: 'باز',
  in_progress: 'در حال بررسی',
  resolved: 'پاسخ داده‌شده',
  closed: 'بسته',
  normal: 'عادی',
  high: 'فوری',
  low: 'کم',
  unpaid: 'پرداخت‌نشده',
  partial: 'پرداخت جزئی',
  paid: 'تسویه‌شده',
  published: 'منتشرشده',
  planned: 'برنامه‌ریزی‌شده',
  completed: 'انجام‌شده',
  pending: 'در انتظار',
  good: 'سالم',
  repair: 'نیاز به تعمیر',
  retired: 'اسقاط',
  positive: 'تشویق',
  warning: 'تذکر',
  incident: 'رخداد',
};
export function relativeDate(value) {
  const days = Math.floor((Date.now() - asDate(value).getTime()) / 86400000);
  if (days < 1) return 'امروز';
  if (days === 1) return 'دیروز';
  return `${fa(days)} روز پیش`;
}
