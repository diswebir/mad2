// Jalali (Solar Hijri) ⇄ Gregorian conversion, no dependencies.
// The algorithm is the standard 33-year leap rule approximation used by jalaali-js,
// which stays exact for the supported range (1900–2100 Gregorian).
const breaks = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
  2456, 3178,
];
// Truncating division (~~), matching the reference Jalaali algorithm: for the negative
// month shifts in g2d/d2g, floor division would silently land a year off.
const div = (a, b) => Math.trunc(a / b);

function jalCal(jy) {
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(jump % 33, 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div((n % 33) + 3, 4);
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = (((n + 1) % 33) - 1) % 4;
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}
const isLeapJalaali = (jy) => jalCal(jy).leap === 0;
const daysInMonth = (jy, jm) => {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaali(jy) ? 30 : 29;
};
const mod = (a, b) => a - div(a, b) * b;
const g2d = (gy, gm, gd) => {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
};
const d2g = (jdn) => {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
};
const j2d = (jy, jm, jd) => {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
};

export function toJalali(isoDate) {
  const [gy, gm, gd] = String(isoDate).slice(0, 10).split('-').map(Number);
  if (!gy || !gm || !gd) return null;
  const jdn = g2d(gy, gm, gd);
  let jy = gy - 621;
  const r = jalCal(jy);
  const firstOfFarvardin = g2d(r.gy, 3, r.march);
  let k = jdn - firstOfFarvardin;
  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function toGregorian(jy, jm, jd) {
  const { gy, gm, gd } = d2g(j2d(jy, jm, jd));
  const pad = (n) => String(n).padStart(2, '0');
  return `${gy}-${pad(gm)}-${pad(gd)}`;
}

export const validJalali = (jy, jm, jd) =>
  Number.isInteger(jy) &&
  jy >= 1200 &&
  jy <= 1600 &&
  Number.isInteger(jm) &&
  jm >= 1 &&
  jm <= 12 &&
  Number.isInteger(jd) &&
  jd >= 1 &&
  jd <= daysInMonth(jy, jm);

export const jalaliParts = (isoDate) => toJalali(isoDate);
export const jalaliToIso = ({ jy, jm, jd }) =>
  validJalali(jy, jm, jd) ? toGregorian(jy, jm, jd) : null;
export { daysInMonth, isLeapJalaali };

export const jalaliMonths = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];
export const jalaliWeekdays = [
  'شنبه',
  'یک‌شنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
];

// Iranian weeks start on Saturday: map JS getUTCDay() (Sunday = 0) to that order.
export const jalaliWeekdayIndex = (isoDate) => {
  const [gy, gm, gd] = String(isoDate).slice(0, 10).split('-').map(Number);
  const day = new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay();
  return (day + 1) % 7;
};

export const formatJalali = (isoDate) => {
  const parts = toJalali(isoDate);
  if (!parts) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${parts.jy}/${pad(parts.jm)}/${pad(parts.jd)}`;
};
