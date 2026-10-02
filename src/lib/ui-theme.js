// ---------------------------------------------------------------------------
// تم و پالت رنگی سامانه — انتخاب مدیر مدرسه در تنظیمات «ظاهر برنامه».
// مقدار روی document.documentElement اعمال می‌شود (data-palette/data-font-scale)
// و در localStorage کش می‌شود تا صفحهٔ ورود هم قبل از دریافت /api/config رنگ
// درست داشته باشد.
// ---------------------------------------------------------------------------
export const PALETTES = [
  {
    id: 'violet',
    name: 'بنفش',
    hint: 'پیش‌فرض سامانه',
    swatch: ['#6d4ade', '#8b6ef0', '#ddd2ff'],
  },
  {
    id: 'sky',
    name: 'آسمانی',
    hint: 'آرام و رسمی',
    swatch: ['#1667d2', '#4b93f0', '#c4dcfc'],
  },
  {
    id: 'emerald',
    name: 'زمردی',
    hint: 'سبز و سرزنده',
    swatch: ['#0d7f5c', '#2fae83', '#b7e4d4'],
  },
  {
    id: 'rose',
    name: 'رز',
    hint: 'گرم و صمیمی',
    swatch: ['#c22a63', '#e2568b', '#f7c2d5'],
  },
  {
    id: 'amber',
    name: 'کهربایی',
    hint: 'پرانرژی',
    swatch: ['#b45c00', '#e08a2e', '#fed9ae'],
  },
  {
    id: 'ocean',
    name: 'اقیانوسی',
    hint: 'فیروزه‌ای عمیق',
    swatch: ['#0e7490', '#2a9fb8', '#b3dce9'],
  },
  {
    id: 'indigo',
    name: 'نیلی',
    hint: 'کلاسیک و باوقار',
    swatch: ['#4338ca', '#6f63e0', '#c8c5f5'],
  },
  {
    id: 'graphite',
    name: 'خاکستری',
    hint: 'خنثی و اداری',
    swatch: ['#475569', '#74839b', '#cdd6e2'],
  },
  {
    id: 'crimson',
    name: 'زرشکی',
    hint: 'رسمی و جسور',
    swatch: ['#b91c3c', '#e04b68', '#f6c2cb'],
  },
];
export const FONT_SCALES = [
  { id: 'small', name: 'کوچک', hint: 'اطلاعات بیشتر در صفحه' },
  { id: 'medium', name: 'میانه', hint: 'استاندارد' },
  { id: 'large', name: 'بزرگ', hint: 'خواناتر' },
  { id: 'xlarge', name: 'خیلی بزرگ', hint: 'مناسب نمایشگرهای لمسی' },
];
const KEY = 'madresehyar-ui';
export function applyUiTheme({ palette = 'violet', font_scale = 'medium' } = {}) {
  const root = document.documentElement;
  root.dataset.palette = PALETTES.some((p) => p.id === palette) ? palette : 'violet';
  root.dataset.fontScale = FONT_SCALES.some((f) => f.id === font_scale) ? font_scale : 'medium';
}
export function cacheUiTheme(ui) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ui));
  } catch {
    /* حالت خصوصی مرورگر */
  }
}
export function loadCachedUiTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) applyUiTheme(saved);
  } catch {
    /* مقدار خراب — همان پیش‌فرض */
  }
}
