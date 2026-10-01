import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, today } from '../lib/api';
import { daysInMonth, jalaliMonths, jalaliParts, jalaliToIso } from '../../shared/jalali';
import {
  LayoutDashboard,
  GraduationCap,
  UsersRound,
  School,
  CalendarCheck2,
  BookOpen,
  MessagesSquare,
  Megaphone,
  CalendarDays,
  Wallet,
  Library,
  Boxes,
  ChartNoAxesCombined,
  Bell,
  CircleUserRound,
  Settings2,
  CalendarRange,
  NotebookPen,
  ClipboardList,
  Award,
  ReceiptText,
  CreditCard,
  Banknote,
  BookCopy,
  Bus,
  HeartHandshake,
  BadgeCheck,
  HeartPulse,
  FolderOpen,
  HandCoins,
  ContactRound,
  Building2,
  Search,
  Plus,
  X,
  Check,
  Clock3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUpLeft,
  ArrowLeft,
  ArrowRight,
  Download,
  Upload,
  Filter,
  Ellipsis,
  Pencil,
  Trash2,
  Eye,
  LayoutGrid,
  List,
  LogOut,
  ShieldCheck,
  Menu,
  CircleHelp,
  Sparkles,
  ArrowUpRight,
  Send,
  Paperclip,
  CheckCheck,
  FileText,
  LockKeyhole,
  KeyRound,
  Copy,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  RefreshCw,
  Circle,
  ExternalLink,
  Rocket,
  Database,
  Server,
  CircleOff,
  Save,
  Phone,
  Mail,
  MapPin,
  SlidersHorizontal,
  PanelRightClose,
  CalendarClock,
  MessageCircle,
  Info,
  Target,
  CircleArrowUp,
  ArrowDownToLine,
  ChevronUp,
  UserPlus,
  ListChecks,
  PlaneTakeoff,
  CalendarCheck,
  History,
  Bookmark,
  BookMarked,
  IdCard,
  UserCheck,
  WalletCards,
} from 'lucide-react';
const icons = {
  LayoutDashboard,
  GraduationCap,
  UsersRound,
  School,
  CalendarCheck2,
  BookOpen,
  MessagesSquare,
  Megaphone,
  CalendarDays,
  Wallet,
  Library,
  Boxes,
  ChartNoAxesCombined,
  Bell,
  CircleUserRound,
  Settings2,
  CalendarRange,
  NotebookPen,
  ClipboardList,
  Award,
  ReceiptText,
  CreditCard,
  Banknote,
  BookCopy,
  Bus,
  HeartHandshake,
  BadgeCheck,
  HeartPulse,
  FolderOpen,
  HandCoins,
  ContactRound,
  Building2,
  Search,
  Plus,
  X,
  Check,
  Clock3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUpLeft,
  ArrowLeft,
  ArrowRight,
  Download,
  Upload,
  Filter,
  Ellipsis,
  Pencil,
  Trash2,
  Eye,
  LayoutGrid,
  List,
  LogOut,
  ShieldCheck,
  Menu,
  CircleHelp,
  Sparkles,
  ArrowUpRight,
  Send,
  Paperclip,
  CheckCheck,
  FileText,
  LockKeyhole,
  KeyRound,
  Copy,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  RefreshCw,
  Circle,
  ExternalLink,
  Rocket,
  Database,
  Server,
  CircleOff,
  Save,
  Phone,
  Mail,
  MapPin,
  SlidersHorizontal,
  PanelRightClose,
  CalendarClock,
  MessageCircle,
  Info,
  Target,
  CircleArrowUp,
  ArrowDownToLine,
  ChevronUp,
  UserPlus,
  ListChecks,
  PlaneTakeoff,
  CalendarCheck,
  History,
  Bookmark,
  BookMarked,
  IdCard,
  UserCheck,
  WalletCards,
};
export function Icon({ name, size = 20, ...props }) {
  const Component = icons[name] || Circle;
  return <Component size={size} strokeWidth={1.75} aria-hidden="true" {...props} />;
}
export function Button({ children, variant = 'primary', icon, loading, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${className}`}
      {...props}
      disabled={props.disabled || loading}
    >
      {loading ? (
        <Icon name="LoaderCircle" size={17} className="spin" />
      ) : icon ? (
        <Icon name={icon} size={17} />
      ) : null}
      {children}
    </button>
  );
}
export function IconButton({ name, label, className = '', ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`icon-button ${className}`}
      {...props}
    >
      <Icon name={name} size={18} />
    </button>
  );
}
export function Avatar({ name = '', id = 0, size = 'md', className = '' }) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join('');
  return (
    <span
      aria-hidden="true"
      className={`avatar avatar-${size} avatar-c${Number(id) % 6} ${className}`}
    >
      {letters || 'م'}
    </span>
  );
}
export function Badge({ children, tone = 'neutral', dot = false, className = '' }) {
  return (
    <span className={`badge badge-${tone} ${className}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}
export const statusTone = (status) =>
  ['present', 'active', 'paid', 'good', 'positive', 'completed', 'resolved', 'published'].includes(
    status,
  )
    ? 'green'
    : ['absent', 'high', 'incident', 'unpaid'].includes(status)
      ? 'red'
      : ['late', 'partial', 'warning', 'pending', 'in_progress', 'repair'].includes(status)
        ? 'orange'
        : ['open', 'planned', 'excused'].includes(status)
          ? 'purple'
          : 'neutral';
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  className = '',
  dismissible = true,
}) {
  const dialog = useRef(null),
    id = useId();
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className={`modal ${wide ? 'modal-wide' : ''} ${className}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current && dismissible) onClose();
      }}
    >
      <div className="modal-inner">
        <header className="modal-header">
          <div>
            <h2 id={id}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {dismissible && <IconButton name="X" label="بستن پنجره" onClick={onClose} />}
        </header>
        {children}
      </div>
    </dialog>,
    document.body,
  );
}
export function Confirm({
  title,
  description,
  onConfirm,
  onClose,
  danger = false,
  confirmLabel = 'تأیید',
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body">
        <div className={`confirm-icon ${danger ? 'danger' : ''}`}>
          <Icon name={danger ? 'Trash2' : 'Info'} size={28} />
        </div>
        <p className="confirm-description">{description}</p>
        {error && <ErrorBox error={error} />}
      </div>
      <footer className="modal-footer">
        <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={confirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          انصراف
        </Button>
      </footer>
    </Modal>
  );
}
export function Switch({ enabled, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      className={`switch ${enabled ? 'on' : ''}`}
      onClick={() => onChange(!enabled)}
    >
      <span />
    </button>
  );
}
export function ErrorBox({ error, onRetry }) {
  return (
    <div role="alert" className="error-box">
      <Icon name="AlertCircle" size={20} />
      <span>{typeof error === 'string' ? error : error?.message || 'مشکلی رخ داد.'}</span>
      {onRetry && (typeof error === 'string' || !error?.status || error.status >= 500) && (
        <Button variant="ghost" icon="RefreshCw" onClick={onRetry}>
          تلاش دوباره
        </Button>
      )}
    </div>
  );
}
export function Empty({
  title = 'هنوز موردی ثبت نشده',
  description = 'با ثبت اولین مورد، این بخش را شروع کنید.',
  icon = 'FolderOpen',
  action,
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name={icon} size={31} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading({ rows = 4 }) {
  return (
    <div className="loading-skeleton" role="status" aria-label="در حال دریافت اطلاعات">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton circle" />
          <div className="skeleton" />
          <div className="skeleton short" />
        </div>
      ))}
    </div>
  );
}
export function PageHeader({ title, description, children, eyebrow }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </header>
  );
}
export function SearchInput({ value, onChange, placeholder = 'جست‌وجو...', className = '' }) {
  return (
    <div className={`search-input ${className}`}>
      <Icon name="Search" size={18} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && <IconButton name="X" label="پاک کردن جست‌وجو" onClick={() => onChange('')} />}
    </div>
  );
}
export function Credentials({ account, onClose }) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `نام کاربری: ${account.username}\nرمز عبور موقت: ${account.temporary_password}`,
      );
      setCopied(true);
    } catch {
      setError('مرورگر اجازه کپی نداد؛ اطلاعات را دستی کپی کنید.');
    }
  };
  return (
    <Modal
      title="اطلاعات ورود آماده است"
      subtitle="این رمز موقت فقط همین‌بار نمایش داده می‌شود."
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="credentials-box">
          <Icon name="ShieldCheck" size={28} />
          <p>کاربر در اولین ورود باید رمز عبور خود را تغییر دهد.</p>
          <label>
            نام کاربری<strong dir="ltr">{account.username}</strong>
          </label>
          <label>
            رمز عبور موقت<strong dir="ltr">{account.temporary_password}</strong>
          </label>
        </div>
        {error && <ErrorBox error={error} />}
      </div>
      <footer className="modal-footer">
        <Button icon={copied ? 'Check' : 'Copy'} onClick={copy}>
          {copied ? 'کپی شد' : 'کپی اطلاعات ورود'}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          متوجه شدم
        </Button>
      </footer>
    </Modal>
  );
}
// Jalali (Solar Hijri) date picker: the stored value stays ISO, the interface is Persian.
export function JalaliDateField({ id, value, onChange, disabled, label = 'تاریخ' }) {
  const parts = value ? jalaliParts(value) : null;
  const [draft, setDraft] = useState({
    jy: parts?.jy || '',
    jm: parts?.jm || '',
    jd: parts?.jd || '',
  });
  useEffect(() => {
    const next = value ? jalaliParts(value) : null;
    setDraft({ jy: next?.jy || '', jm: next?.jm || '', jd: next?.jd || '' });
  }, [value]);
  const thisYear = jalaliParts(today())?.jy || 1405;
  const years = Array.from({ length: 12 }, (_, i) => thisYear - 6 + i);
  const maxDay = draft.jy && draft.jm ? daysInMonth(Number(draft.jy), Number(draft.jm)) : 31;
  const update = (next) => {
    setDraft(next);
    if (next.jy && next.jm && next.jd)
      onChange(
        jalaliToIso({ ...next, jy: Number(next.jy), jm: Number(next.jm), jd: Number(next.jd) }) ||
          '',
      );
  };
  return (
    <div className="jalali-date-field">
      <select
        id={`${id}-year`}
        aria-label={`سال ${label}`}
        disabled={disabled}
        value={draft.jy}
        onChange={(e) => update({ ...draft, jy: e.target.value })}
      >
        <option value="">سال</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y.toLocaleString('fa-IR', { useGrouping: false })}
          </option>
        ))}
      </select>
      <select
        id={`${id}-month`}
        aria-label={`ماه ${label}`}
        disabled={disabled}
        value={draft.jm}
        onChange={(e) => update({ ...draft, jm: e.target.value })}
      >
        <option value="">ماه</option>
        {jalaliMonths.map((name, index) => (
          <option key={name} value={index + 1}>
            {name}
          </option>
        ))}
      </select>
      <select
        id={`${id}-day`}
        aria-label={`روز ${label}`}
        disabled={disabled}
        value={draft.jd}
        onChange={(e) => update({ ...draft, jd: e.target.value })}
      >
        <option value="">روز</option>
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d.toLocaleString('fa-IR', { useGrouping: false })}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="jalali-today"
        disabled={disabled}
        onClick={() => update({ ...(jalaliParts(today()) || {}) })}
      >
        امروز
      </button>
      {value && (
        <button
          type="button"
          className="jalali-clear"
          disabled={disabled}
          onClick={() => onChange('')}
        >
          پاک کردن
        </button>
      )}
      {value && <small className="field-hint">میلادی: {value}</small>}
    </div>
  );
}
export function ErrorReportButton() {
  const [open, setOpen] = useState(false),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState(null),
    [error, setError] = useState(null);
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await api('/support/report', {
        method: 'POST',
        body: {
          message,
          url: window.location.pathname,
          stack: String(window.__madresehyarLastError || ''),
        },
      });
      setResult(response.code);
      setMessage('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="support-button" onClick={() => setOpen(true)}>
        <Icon name="CircleHelp" size={17} />
        گزارش مشکل
      </button>
      {open && (
        <Modal
          title="گزارش مشکل به پشتیبانی"
          subtitle="توضیح کوتاه بنویسید؛ یک کد پیگیری دریافت می‌کنید."
          onClose={() => {
            setOpen(false);
            setResult(null);
          }}
        >
          <div className="modal-body">
            {result ? (
              <div className="confirm-icon">
                <Icon name="CheckCircle2" size={28} />
                <p>
                  گزارش ثبت شد. کد پیگیری: <strong dir="ltr">{result}</strong>
                </p>
              </div>
            ) : (
              <>
                <label className="form-field full-width">
                  شرح مشکل
                  <textarea
                    rows={4}
                    value={message}
                    maxLength={1000}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="چه اتفاقی افتاد و انتظار داشتید چه شود؟"
                  />
                </label>
                {error && <ErrorBox error={error} />}
              </>
            )}
          </div>
          <footer className="modal-footer">
            {!result && (
              <Button
                loading={busy}
                disabled={message.trim().length < 4}
                onClick={send}
                icon="Send"
              >
                ارسال گزارش
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setResult(null);
              }}
            >
              بستن
            </Button>
          </footer>
        </Modal>
      )}
    </>
  );
}
export function Toasts({ toasts, dismiss }) {
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <Icon name={t.type === 'error' ? 'AlertCircle' : 'CheckCircle2'} size={21} />
          <span>{t.message}</span>
          <IconButton name="X" label="بستن اعلان" onClick={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}
export function SchoolIllustration({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 420 218"
      role="img"
      aria-label="تصویر مدرسه و ابزار یادگیری"
    >
      <defs>
        <linearGradient id="schoolRoof" x2="0" y2="1">
          <stop stopColor="#9b83f3" />
          <stop offset="1" stopColor="#7861d8" />
        </linearGradient>
        <linearGradient id="schoolWall" x2="0" y2="1">
          <stop stopColor="#faf8ff" />
          <stop offset="1" stopColor="#e5dcfb" />
        </linearGradient>
      </defs>
      <ellipse cx="222" cy="194" rx="163" ry="15" fill="#ded5fa" opacity=".6" />
      <circle cx="251" cy="105" r="83" fill="#e6dffa" opacity=".65" />
      <path
        d="M100 170c-11-11-15-29-11-41 9 2 17 14 17 31-1-19 7-33 18-39 5 17 1 34-12 48"
        fill="#91bba5"
      />
      <path d="M103 157v35" stroke="#6e9b85" strokeWidth="3" />
      <path
        d="M342 168c-9-19-7-45 3-59 13 15 14 33 8 51 8-14 19-18 27-16-3 19-13 32-29 34"
        fill="#b6ccb4"
      />
      <path d="m350 143-3 47" stroke="#91a991" strokeWidth="3" />
      <rect x="133" y="91" width="180" height="99" rx="3" fill="url(#schoolWall)" />
      <rect x="180" y="61" width="90" height="129" fill="#f5f0ff" />
      <path d="m124 91 56-42h90l54 42Z" fill="url(#schoolRoof)" />
      <path d="m168 63 57-43 57 43Z" fill="#8065d6" />
      <path d="m168 63 57-35 57 35" stroke="#b7a1f2" strokeWidth="5" fill="none" />
      <rect x="196" y="109" width="57" height="81" rx="28" fill="#d6c7f4" />
      <rect x="203" y="122" width="43" height="68" rx="21" fill="#7962ce" />
      <path d="M225 141v49" stroke="#d4c4f7" strokeWidth="2" />
      <circle cx="225" cy="79" r="16" fill="white" stroke="#d0c0f3" strokeWidth="4" />
      <path
        d="M225 69v10l8 4"
        fill="none"
        stroke="#8e72dc"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <g fill="#c8b5ee">
        <rect x="143" y="112" width="22" height="28" rx="3" />
        <rect x="143" y="151" width="22" height="28" rx="3" />
        <rect x="284" y="112" width="22" height="28" rx="3" />
        <rect x="284" y="151" width="22" height="28" rx="3" />
      </g>
      <g stroke="#fdfbff" strokeWidth="2">
        <path d="M154 112v28m-11-14h22m-11 25v28m-11-14h22m130-53v28m-11-14h22m-11 25v28m-11-14h22" />
      </g>
      <path d="M183 190h83l10 8h-103Z" fill="#b4a0df" />
      <rect x="224" y="4" width="2" height="23" fill="#a58adf" />
      <path d="m226 4 23 4-23 9" fill="#eaab69" />
      <g transform="rotate(-13 76 61)">
        <path d="m35 44 42-18 45 18-44 19Z" fill="#9479df" />
        <path d="M51 56v15c14 12 30 12 44 0V56L78 67Z" fill="#baa3ed" />
        <path d="M116 49v26" stroke="#9479df" strokeWidth="3" />
        <circle cx="116" cy="77" r="4" fill="#9479df" />
      </g>
      <g transform="rotate(12 353 65)">
        <rect x="326" y="42" width="46" height="58" rx="5" fill="#f1c483" />
        <rect x="320" y="39" width="46" height="56" rx="5" fill="#ffdfa7" />
        <path d="M327 40v54" stroke="#e5b878" strokeWidth="3" />
        <path
          d="M337 55h20m-20 9h15m-15 9h20"
          stroke="#d9a76c"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
      <g fill="#a991e1">
        <path d="m142 26 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" />
        <path d="m303 19 1.5 4.5L309 25l-4.5 1.5L303 31l-1.5-4.5L297 25l4.5-1.5Z" />
        <circle cx="61" cy="118" r="4" />
        <circle cx="390" cy="122" r="3" />
        <circle cx="311" cy="61" r="3" />
      </g>
      <path d="m65 184 22-7 27 10-21 8Z" fill="#a590e2" />
      <path d="m65 180 22-7 27 10-21 8Z" fill="#d6c8f5" />
      <path d="m66 180 22 8v7" stroke="#8e75cc" strokeWidth="2" />
      <path d="m87 173 27 10" stroke="#eee7fc" strokeWidth="3" />
    </svg>
  );
}
