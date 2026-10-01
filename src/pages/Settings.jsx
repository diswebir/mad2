import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { featureDefs, roles } from '../../shared/catalog';
import { useApp, useApi } from '../context';
import { api, dateFa, download, fa, query, today } from '../lib/api';
import {
  Avatar,
  Badge,
  Button,
  Confirm,
  Credentials,
  Empty,
  ErrorBox,
  Icon,
  IconButton,
  Loading,
  Modal,
  PageHeader,
  SearchInput,
  Switch,
} from '../components/ui';
import {
  ErrorReportsPanel,
  MessagingPanel,
  RestorePanel,
  StatusPanel,
} from '../components/SystemPanels';
import Resources from './Resources';
function SchoolSettings() {
  const { config, refreshConfig, toast } = useApp();
  const [values, setValues] = useState({ ...config.school }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const fields = [
    ['name', 'نام مدرسه'],
    ['principal', 'نام مدیر'],
    ['academic_year', 'سال تحصیلی'],
    ['city', 'شهر'],
    ['phone', 'شماره تماس'],
    ['email', 'ایمیل'],
    ['address', 'نشانی مدرسه'],
  ];
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/settings/school', { method: 'PATCH', body: values });
      await refreshConfig();
      toast('مشخصات مدرسه ذخیره شد.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel settings-school">
      <div className="panel-heading">
        <div>
          <h2>مشخصات مدرسه</h2>
          <p>اطلاعاتی که در پنل اعضای مدرسه نمایش داده می‌شود.</p>
        </div>
        <span className="small-icon tone-purple">
          <Icon name="School" size={22} />
        </span>
      </div>
      <form onSubmit={save}>
        <div className="panel-padding">
          {error && <ErrorBox error={error} />}
          <div className="school-settings-brand">
            <span className="settings-school-logo">
              <Icon name="School" size={37} />
            </span>
            <div>
              <h3>{values.name || 'مدرسه شما'}</h3>
              <p>اطلاعات درست، شروع یک ارتباط خوب</p>
            </div>
            <Badge tone="green" dot>
              مدرسه فعال
            </Badge>
          </div>
          <div className="form-grid">
            {fields.map(([key, label]) => (
              <label className={`form-field ${key === 'address' ? 'full-width' : ''}`} key={key}>
                {label}
                {['name', 'principal', 'academic_year'].includes(key) && (
                  <span className="required-star">*</span>
                )}
                {key === 'address' ? (
                  <textarea
                    value={values[key] || ''}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    rows={3}
                    maxLength={1000}
                  />
                ) : (
                  <input
                    required={['name', 'principal', 'academic_year'].includes(key)}
                    type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                    dir={['phone', 'email'].includes(key) ? 'ltr' : undefined}
                    value={values[key] || ''}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    maxLength={100}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
        <div className="settings-form-footer">
          <Button type="submit" icon="Check" loading={busy}>
            ذخیره تنظیمات
          </Button>
          <Button variant="secondary" onClick={() => setValues({ ...config.school })}>
            بازگردانی
          </Button>
        </div>
      </form>
    </section>
  );
}
function AddAccount({ onClose, onSaved }) {
  const { lookups } = useApp();
  const [values, setValues] = useState({
      username: '',
      full_name: '',
      role: 'parent',
      student_id: '',
      phone: '',
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const account = await api('/settings/accounts', {
        method: 'POST',
        body: {
          ...values,
          student_id: values.role === 'parent' ? Number(values.student_id) : null,
        },
      });
      await onSaved(account);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="افزودن حساب کاربری"
      subtitle="حساب معلم و دانش‌آموز از پرونده آن‌ها ساخته می‌شود."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="modal-body form-stack">
          {error && <ErrorBox error={error} />}
          <label>
            نام و نام خانوادگی
            <input
              required
              minLength={2}
              value={values.full_name}
              onChange={(e) => setValues((v) => ({ ...v, full_name: e.target.value }))}
            />
          </label>
          <label>
            نام کاربری (لاتین)
            <input
              required
              minLength={3}
              pattern="[a-zA-Z0-9_.@\-]+"
              dir="ltr"
              value={values.username}
              onChange={(e) => setValues((v) => ({ ...v, username: e.target.value }))}
            />
          </label>
          <label>
            نقش
            <select
              value={values.role}
              onChange={(e) => setValues((v) => ({ ...v, role: e.target.value }))}
            >
              <option value="parent">ولی دانش‌آموز</option>
              <option value="admin">مدیر مدرسه</option>
            </select>
          </label>
          {values.role === 'parent' && (
            <label>
              دانش‌آموز مرتبط
              <select
                required
                value={values.student_id}
                onChange={(e) => setValues((v) => ({ ...v, student_id: e.target.value }))}
              >
                <option value="">انتخاب دانش‌آموز</option>
                {lookups.students?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            شماره تماس
            <input
              type="tel"
              dir="ltr"
              value={values.phone}
              onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
            />
          </label>
          <div className="info-box">
            <Icon name="KeyRound" size={18} />
            <span>رمز موقت امن به‌صورت خودکار تولید می‌شود و فقط یک‌بار نمایش داده خواهد شد.</span>
          </div>
        </div>
        <footer className="modal-footer">
          <Button type="submit" loading={busy} icon="UserPlus">
            ساخت حساب
          </Button>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
function Accounts() {
  const { user, can, toast, refreshLookups } = useApp();
  const [search, setSearch] = useState(''),
    [debounced, setDebounced] = useState(''),
    [role, setRole] = useState(''),
    [page, setPage] = useState(1),
    [reset, setReset] = useState(null),
    [account, setAccount] = useState(null),
    [add, setAdd] = useState(false),
    [busy, setBusy] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const { data, loading, error, refresh } = useApi(
    `/settings/accounts?${query({ q: debounced, role, page })}`,
  );
  const toggle = async (row, active) => {
    setBusy(row.id);
    try {
      await api(`/settings/accounts/${row.id}`, { method: 'PATCH', body: { active } });
      refresh();
      toast(active ? 'حساب فعال شد.' : 'حساب غیرفعال و نشست‌های آن لغو شد.');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="panel">
      <div className="resource-toolbar">
        <div className="resource-toolbar-title">
          <h2>حساب‌های کاربری</h2>
          <Badge>{fa(data?.total)}</Badge>
        </div>
        <div className="resource-toolbar-controls">
          <SearchInput value={search} onChange={setSearch} placeholder="نام یا نام کاربری..." />
          <select
            className="select"
            aria-label="فیلتر نقش کاربر"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">همه نقش‌ها</option>
            {Object.entries(roles).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <Button icon="Plus" onClick={() => setAdd(true)}>
            حساب جدید
          </Button>
        </div>
      </div>
      {error ? (
        <div className="panel-padding">
          <ErrorBox error={error} onRetry={refresh} />
        </div>
      ) : loading && !data ? (
        <Loading rows={6} />
      ) : data?.rows.length ? (
        <div className="table-scroll">
          <table className="data-table accounts-table">
            <thead>
              <tr>
                <th>کاربر</th>
                <th>نام کاربری</th>
                <th>نقش</th>
                <th>امنیت رمز</th>
                <th>فعال</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="person-cell">
                      <Avatar name={row.full_name} id={row.id} size="sm" />
                      <span>
                        <strong>{row.full_name}</strong>
                        <small>{row.id === user.id ? 'حساب شما' : row.phone || '—'}</small>
                      </span>
                    </div>
                  </td>
                  <td dir="ltr" className="ltr-value">
                    {row.username}
                  </td>
                  <td>
                    <Badge
                      tone={
                        row.role === 'admin'
                          ? 'purple'
                          : row.role === 'teacher'
                            ? 'blue'
                            : 'neutral'
                      }
                    >
                      {roles[row.role]}
                    </Badge>
                  </td>
                  <td>
                    {row.must_change_password ? (
                      <Badge tone="orange">نیازمند تغییر رمز</Badge>
                    ) : (
                      <span className="secure-label">
                        <Icon name="ShieldCheck" size={15} />
                        تنظیم‌شده
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="account-switch">
                      <Switch
                        enabled={row.active}
                        disabled={row.id === user.id || busy === row.id}
                        label={`وضعیت حساب ${row.full_name}`}
                        onChange={(active) => toggle(row, active)}
                      />
                      {row.active && !row.access_active && (
                        <small className="muted">
                          ورود تا فعال‌شدن پرونده (
                          {row.record_status === 'inactive' ? 'غیرفعال' : 'بدون پرونده'}) مسدود است
                        </small>
                      )}
                    </span>
                  </td>
                  <td>
                    {can('settings.reset_password') && row.id !== user.id && (
                      <IconButton
                        name="KeyRound"
                        label={`بازنشانی رمز ${row.full_name}`}
                        onClick={() => setReset(row)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="کاربری پیدا نشد" icon="UsersRound" />
      )}
      {data && (
        <div className="pagination">
          <span>
            {fa(data.total)} حساب · صفحه {fa(page)} از {fa(data.pages || 1)}
          </span>
          <div>
            <IconButton
              name="ChevronRight"
              label="صفحه قبل"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            />
            <span className="page-number">{fa(page)}</span>
            <IconButton
              name="ChevronLeft"
              label="صفحه بعد"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            />
          </div>
        </div>
      )}
      {reset && (
        <Confirm
          title="بازنشانی رمز عبور"
          description={`برای ${reset.full_name} رمز موقت جدید ساخته شود؟ تمام نشست‌های فعال کاربر لغو می‌شوند و تغییر رمز در ورود بعدی الزامی است.`}
          confirmLabel="ساخت رمز موقت"
          onClose={() => setReset(null)}
          onConfirm={async () => {
            const a = await api(`/settings/accounts/${reset.id}/reset-password`, {
              method: 'POST',
              body: {},
            });
            setAccount(a);
            refresh();
          }}
        />
      )}
      {account && <Credentials account={account} onClose={() => setAccount(null)} />}{' '}
      {add && (
        <AddAccount
          onClose={() => setAdd(false)}
          onSaved={async (a) => {
            setAccount(a);
            refresh();
            await refreshLookups();
            toast('حساب جدید ساخته شد.');
          }}
        />
      )}
    </section>
  );
}
function Audit() {
  const { data, loading, error, refresh } = useApi('/settings/audit');
  const [search, setSearch] = useState('');
  const label = (action) =>
    featureDefs.find((f) => f.id === action)?.name ||
    {
      'auth.login': 'ورود به سامانه',
      'auth.login_failed': 'تلاش ناموفق ورود',
      'install.demo': 'آماده‌سازی داده دمو',
      'install.complete': 'تکمیل نصب',
      'files.upload': 'بارگذاری فایل',
      'profile.password': 'تغییر رمز عبور',
    }[action] ||
    action;
  const rows = (data || []).filter((r) =>
    `${r.actor_name || ''} ${label(r.action)} ${r.detail || ''}`.includes(search),
  );
  return (
    <section className="panel">
      <div className="resource-toolbar">
        <div className="resource-toolbar-title">
          <h2>ردپای فعالیت‌ها</h2>
          <Badge>۲۰۰ رویداد آخر</Badge>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="جست‌وجو در رویدادها..." />
      </div>
      {error ? (
        <ErrorBox error={error} onRetry={refresh} />
      ) : loading ? (
        <Loading />
      ) : (
        <div className="audit-list">
          {rows.map((r) => (
            <div key={r.id}>
              <span className="audit-icon">
                <Icon
                  name={
                    r.action.endsWith('delete')
                      ? 'Trash2'
                      : r.action.startsWith('auth')
                        ? 'KeyRound'
                        : r.action.includes('attendance')
                          ? 'CalendarCheck2'
                          : 'ClipboardList'
                  }
                  size={19}
                />
              </span>
              <div>
                <strong>{label(r.action)}</strong>
                <p>
                  {r.actor_name || 'سامانه'}
                  {r.entity ? ` · ${r.entity}` : ''}
                  {r.record_id ? ` · #${fa(r.record_id)}` : ''}
                </p>
                {r.detail && !r.detail.startsWith('{') && <small>{r.detail}</small>}
              </div>
              <span>
                {dateFa(r.created_at)}
                <small>{dateFa(r.created_at, { hour: '2-digit', minute: '2-digit' })}</small>
              </span>
            </div>
          ))}
          {!rows.length && <Empty title="رویدادی پیدا نشد" icon="ClipboardList" />}
        </div>
      )}
    </section>
  );
}
function Backup() {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await download('/settings/backup', `madresehyar-${today()}.sqlite`);
      toast('نسخه پشتیبان پایگاه‌داده دانلود شد.');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel backup-panel">
      <div className="backup-illustration">
        <Icon name="Database" size={70} />
        <span>
          <Icon name="ShieldCheck" size={30} />
        </span>
      </div>
      <h2>آرامش خاطر، با یک نسخه پشتیبان</h2>
      <p>یک کپی کامل از پایگاه‌داده مدرسه دریافت کنید و خارج از هاست نگه دارید.</p>
      <Button icon="Download" loading={busy} onClick={save}>
        دریافت پشتیبان SQLite
      </Button>
      <div className="backup-notes">
        <div>
          <Icon name="LockKeyhole" size={21} />
          <span>
            <strong>فایل محرمانه است</strong>اطلاعات تماس، پرونده‌ها و هش رمز کاربران در آن قرار
            دارند؛ آن را عمومی نکنید.
          </span>
        </div>
        <div>
          <Icon name="FolderOpen" size={21} />
          <span>
            <strong>پیوست‌ها را جداگانه نگه دارید</strong>پوشه data/uploads را هم از File Manager
            هاست دانلود کنید. پشتیبان بالا فقط پایگاه‌داده است.
          </span>
        </div>
        <div>
          <Icon name="RefreshCw" size={21} />
          <span>
            <strong>بازیابی با توقف برنامه</strong>برنامه را متوقف کنید، فایل school.sqlite و پوشه
            uploads را جایگزین و برنامه را دوباره اجرا کنید. راهنمای کامل در docs/CPANEL.md است.
          </span>
        </div>
      </div>
    </section>
  );
}
export default function Settings() {
  const { user, can } = useApp();
  const [params, setParams] = useSearchParams();
  if (user.role !== 'admin')
    return (
      <Empty
        title="دسترسی مدیریتی لازم است"
        description="تنظیمات سامانه فقط در اختیار مدیر مدرسه است."
        icon="ShieldCheck"
      />
    );
  const tabs = [
    ...(can('settings.school') ? [['school', 'مشخصات مدرسه', 'School']] : []),
    ...(can('settings.accounts') ? [['accounts', 'حساب‌های کاربری', 'UsersRound']] : []),
    ...(can('terms.view') ? [['terms', 'سال تحصیلی', 'CalendarRange']] : []),
    ...(can('settings.audit') ? [['audit', 'رویدادهای سامانه', 'ClipboardList']] : []),
    ...(can('settings.backup') ? [['backup', 'پشتیبان‌گیری', 'Database']] : []),
    ...(can('settings.restore') ? [['restore', 'بازگردانی پشتیبان', 'RefreshCw']] : []),
    ...(can('settings.messaging') ? [['messaging', 'پیامک و ایمیل', 'Send']] : []),
    ...(can('settings.status') ? [['status', 'وضعیت سرویس', 'Server']] : []),
    ...(can('settings.support') ? [['errors', 'گزارش خطاها', 'CircleHelp']] : []),
  ];
  const tab = tabs.some(([t]) => t === params.get('tab')) ? params.get('tab') : tabs[0]?.[0];
  return (
    <div className="settings-page page-enter">
      <PageHeader
        title="تنظیمات سامانه"
        description="جزئیات مدرسه، حساب‌ها و امنیت؛ همه در کنترل شما."
      >
        <Link className="btn btn-secondary" to="/install">
          <Icon name="Rocket" size={17} />
          ویزارد راه‌اندازی
        </Link>
      </PageHeader>
      <div className="tabs settings-tabs">
        {tabs.map(([t, l, i]) => (
          <button
            key={t}
            className={tab === t ? 'active' : ''}
            onClick={() => setParams({ tab: t })}
          >
            <Icon name={i} size={17} />
            {l}
          </button>
        ))}
      </div>
      {tab === 'school' ? (
        <SchoolSettings />
      ) : tab === 'accounts' ? (
        <Accounts />
      ) : tab === 'terms' ? (
        <Resources moduleId="settings" embedded />
      ) : tab === 'audit' ? (
        <Audit />
      ) : tab === 'backup' ? (
        <Backup />
      ) : tab === 'restore' ? (
        <RestorePanel />
      ) : tab === 'messaging' ? (
        <MessagingPanel />
      ) : tab === 'status' ? (
        <StatusPanel />
      ) : tab === 'errors' ? (
        <ErrorReportsPanel />
      ) : (
        <div className="panel">
          <Empty
            title="قابلیت‌های تنظیمات غیرفعال هستند"
            action={
              <Link className="btn btn-primary" to="/modules">
                مدیریت ماژول‌ها
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}
