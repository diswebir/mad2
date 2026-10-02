import React, { useState } from 'react';
import { api, dateFa, describeError, download, fa, today } from '../lib/api';
import { useApi, useApp } from '../context';
import { Badge, Button, Empty, ErrorBox, Icon, Loading, Modal, statusTone } from './ui';

const eventLabels = {
  absence: 'غیبت دانش‌آموز',
  grade: 'ثبت نمره',
  invoice: 'صورتحساب و بدهی',
  homework: 'تکلیف و تمرین',
  ticket: 'پاسخ تیکت',
  announcement: 'اطلاعیه مدرسه',
};

export function MessagingPanel() {
  const { toast } = useApp();
  const { data, loading, error, refresh } = useApi('/settings/messaging');
  const [values, setValues] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error2, setError2] = useState(null);
  React.useEffect(() => {
    if (data) setValues(data);
  }, [data]);
  const values_ = values || data;
  const save = async () => {
    setBusy(true);
    setError2(null);
    try {
      const saved = await api('/settings/messaging', { method: 'PATCH', body: values });
      toast('تنظیمات پیام‌رسانی ذخیره شد.');
    } catch (e) {
      setError2(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  const test = async (channel) => {
    setBusy(true);
    setError2(null);
    try {
      const result = await api('/settings/messaging/test', { method: 'POST', body: { channel } });
      toast(result.message);
    } catch (e) {
      setError2(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  if (error) return <ErrorBox error={error} onRetry={refresh} />;
  if ((loading && !values_) || !values_) return <Loading rows={5} />;
  const messages = values_;
  const update = (patch) => setValues((current) => ({ ...(current || data), ...patch }));
  return (
    <section className="panel messaging-panel">
      <div className="panel-heading">
        <div>
          <h2>پل پیامک و ایمیل</h2>
          <p className="muted small-text">
            اعلان‌های مهم (غیبت، شهریه، تکالیف) علاوه بر پنل، برای خانواده پیامک یا ایمیل می‌شوند.
          </p>
        </div>
        <Badge tone={messages.enabled ? 'green' : 'neutral'} dot>
          {messages.enabled ? 'فعال' : 'غیرفعال'}
        </Badge>
      </div>
      <label className="switch-row">
        <span>
          <strong>ارسال پیام بیرون از سامانه</strong>
          <small>با خاموش‌بودن این گزینه، اعلان‌ها فقط در پنل ثبت می‌شوند.</small>
        </span>
        <input
          type="checkbox"
          checked={!!messages.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
      </label>
      <div className="channel-grid">
        <div className="channel-card">
          <header>
            <Icon name="Phone" size={20} />
            <strong>پیامک</strong>
            <input
              type="checkbox"
              aria-label="فعال‌بودن پیامک"
              checked={!!messages.sms.enabled}
              onChange={(e) => update({ sms: { ...messages.sms, enabled: e.target.checked } })}
            />
          </header>
          <div className="form-field">
            <label htmlFor="sms-provider">سرویس‌دهنده</label>
            <select
              id="sms-provider"
              value={messages.sms.provider}
              onChange={(e) => update({ sms: { ...messages.sms, provider: e.target.value } })}
            >
              <option value="console">ثبت آزمایشی (بدون ارسال واقعی)</option>
              <option value="kavenegar">کاوه‌نگار</option>
              <option value="webhook">وب‌هوک سازمانی</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="sms-key">کلید API</label>
            <input
              id="sms-key"
              dir="ltr"
              value={messages.sms.api_key || ''}
              onChange={(e) => update({ sms: { ...messages.sms, api_key: e.target.value } })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="sms-sender">شماره فرستنده</label>
            <input
              id="sms-sender"
              dir="ltr"
              value={messages.sms.sender || ''}
              onChange={(e) => update({ sms: { ...messages.sms, sender: e.target.value } })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="sms-url">آدرس وب‌هوک</label>
            <input
              id="sms-url"
              dir="ltr"
              value={messages.sms.url || ''}
              onChange={(e) => update({ sms: { ...messages.sms, url: e.target.value } })}
            />
          </div>
          <Button variant="secondary" icon="Send" loading={busy} onClick={() => test('sms')}>
            ارسال آزمایشی پیامک
          </Button>
        </div>
        <div className="channel-card">
          <header>
            <Icon name="Mail" size={20} />
            <strong>ایمیل</strong>
            <input
              type="checkbox"
              aria-label="فعال‌بودن ایمیل"
              checked={!!messages.email.enabled}
              onChange={(e) => update({ email: { ...messages.email, enabled: e.target.checked } })}
            />
          </header>
          <div className="form-field">
            <label htmlFor="email-provider">سرویس‌دهنده</label>
            <select
              id="email-provider"
              value={messages.email.provider}
              onChange={(e) => update({ email: { ...messages.email, provider: e.target.value } })}
            >
              <option value="console">ثبت آزمایشی (بدون ارسال واقعی)</option>
              <option value="webhook">وب‌هوک سازمانی</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="email-from">فرستنده</label>
            <input
              id="email-from"
              dir="ltr"
              value={messages.email.from || ''}
              onChange={(e) => update({ email: { ...messages.email, from: e.target.value } })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="email-url">آدرس وب‌هوک</label>
            <input
              id="email-url"
              dir="ltr"
              value={messages.email.url || ''}
              onChange={(e) => update({ email: { ...messages.email, url: e.target.value } })}
            />
          </div>
          <Button variant="secondary" icon="Send" loading={busy} onClick={() => test('email')}>
            ارسال آزمایشی ایمیل
          </Button>
        </div>
      </div>
      <h3 className="section-title">رویدادهایی که پیام می‌فرستند</h3>
      <div className="event-toggle-grid">
        {Object.entries(eventLabels).map(([key, label]) => (
          <label key={key} className="event-toggle">
            <input
              type="checkbox"
              checked={!!messages.events?.[key]}
              onChange={(e) => update({ events: { ...messages.events, [key]: e.target.checked } })}
            />
            {label}
          </label>
        ))}
      </div>
      {error2 && <ErrorBox error={error2} />}
      <footer className="panel-footer">
        <Button icon="Save" loading={busy} onClick={save}>
          ذخیره تنظیمات پیام‌رسانی
        </Button>
        <OutboxList />
      </footer>
    </section>
  );
}

function OutboxList() {
  const { toast } = useApp();
  const { data, loading, error, refresh } = useApi('/settings/outbox');
  if (error) return null;
  if (loading && !data) return null;
  if (!data?.rows?.length) return <span className="muted small-text">صف ارسال خالی است.</span>;
  return (
    <div className="outbox">
      <strong>صف ارسال</strong>
      {data.rows.slice(0, 5).map((row) => (
        <div className="outbox-row" key={row.id}>
          <Badge
            tone={statusTone(
              row.status === 'sent' ? 'paid' : row.status === 'failed' ? 'unpaid' : 'pending',
            )}
            dot
          >
            {row.status === 'sent' ? 'ارسال‌شده' : row.status === 'failed' ? 'ناموفق' : 'در صف'}
          </Badge>
          <span>{row.title}</span>
          <small dir="ltr">{row.target || ''}</small>
          {row.status === 'failed' && (
            <Button
              variant="ghost"
              icon="RefreshCw"
              onClick={async () => {
                await api(`/settings/outbox/${row.id}/retry`, { method: 'POST', body: {} });
                toast('تلاش دوباره ثبت شد.');
                refresh();
              }}
            >
              تلاش دوباره
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

export function StatusPanel() {
  const { data, loading, error, refresh } = useApi('/status');
  if (error) return <ErrorBox error={error} onRetry={refresh} />;
  if (loading && !data) return <Loading rows={5} />;
  return (
    <section className="panel status-panel">
      <div className="panel-heading">
        <div>
          <h2>وضعیت سرویس</h2>
          <p className="muted small-text">
            سلامتی پایگاه‌داده، صف پیام‌ها و گزارش‌های خطا در یک نگاه.
          </p>
        </div>
        <Badge tone={data.checks.every((c) => c.ok) ? 'green' : 'red'} dot>
          {data.checks.every((c) => c.ok) ? 'همه‌چیز سالم' : 'نیاز به بررسی'}
        </Badge>
      </div>
      <div className="status-grid">
        <div className="status-card">
          <Icon name="Server" size={22} />
          <strong dir="ltr">{data.node}</strong>
          <span>Node.js · نسخه {data.version}</span>
        </div>
        <div className="status-card">
          <Icon name="Database" size={22} />
          <strong>{fa(Math.round((data.database_bytes || 0) / 1024))} کیلوبایت</strong>
          <span>حجم پایگاه‌داده · طرح v{data.schema_version}</span>
        </div>
        <div className="status-card">
          <Icon name="Clock3" size={22} />
          <strong>{fa(Math.floor((data.uptime_seconds || 0) / 60))} دقیقه</strong>
          <span>زمان اجرا</span>
        </div>
        <div className="status-card">
          <Icon name="Send" size={22} />
          <strong>
            {fa(data.pending_outbox)} در صف · {fa(data.failed_outbox)} ناموفق
          </strong>
          <span>صف پیام‌ها</span>
        </div>
        <div className="status-card">
          <Icon name="AlertCircle" size={22} />
          <strong>{fa(data.open_error_reports)}</strong>
          <span>گزارش خطای باز</span>
        </div>
        <div className="status-card">
          <Icon name="ShieldCheck" size={22} />
          <strong>{fa(data.features_disabled)}</strong>
          <span>قابلیت خاموش‌شده</span>
        </div>
        {data.license && data.license.mode === 'on' && (
          <div className="status-card">
            <Icon name={data.license.valid ? 'BadgeCheck' : 'AlertTriangle'} size={22} />
            <strong>
              {data.license.valid ? data.license.customer || 'لایسنس فعال' : 'بدون لایسنس'}
            </strong>
            <span>
              {data.license.valid
                ? `سریال ${data.license.license_id || '—'} · ${fa(data.license.modules.length)} ماژول`
                : data.license.reason_label}
            </span>
          </div>
        )}
      </div>
      <ul className="check-list">
        {data.checks.map((check) => (
          <li key={check.name}>
            <Icon name={check.ok ? 'CheckCircle2' : 'AlertCircle'} size={18} />
            <span>{check.name}</span>
            {check.detail && <small>{check.detail}</small>}
          </li>
        ))}
      </ul>
      <div className="status-footer">
        <div>
          {data.vendor && (
            <p className="muted small-text vendor-line">
              <Icon name="BadgeCheck" size={15} />
              سازنده: <strong>{data.vendor.name}</strong>
              <a href={data.vendor.url} target="_blank" rel="noreferrer" dir="ltr">
                {data.vendor.url}
              </a>
            </p>
          )}
          <p className="muted small-text">
            آخرین پشتیبان‌گیری: {data.last_backup_at ? dateFa(data.last_backup_at) : 'ثبت نشده'} ·
            آخرین رویداد: {data.last_audit_at ? dateFa(data.last_audit_at) : '—'}
          </p>
        </div>
        <Button variant="secondary" icon="RefreshCw" onClick={refresh}>
          بررسی دوباره
        </Button>
      </div>
    </section>
  );
}

export function ErrorReportsPanel() {
  const { toast } = useApp();
  const [status, setStatus] = useState('new');
  const { data, loading, error, refresh } = useApi(`/support/reports?status=${status}`);
  const update = async (row, nextStatus) => {
    try {
      await api(`/support/reports/${row.id}`, {
        method: 'PATCH',
        body: { status: nextStatus, note: row.note || '' },
      });
      toast('وضعیت گزارش به‌روزرسانی شد.');
      refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>گزارش خطاهای کاربران</h2>
          <p className="muted small-text">
            گزارش‌هایی که کاربران از دکمه «گزارش مشکل» می‌فرستند، همراه کد پیگیری.
          </p>
        </div>
        <select aria-label="فیلتر وضعیت" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="new">جدید</option>
          <option value="seen">دیده‌شده</option>
          <option value="resolved">حل‌شده</option>
        </select>
      </div>
      {error ? (
        <div className="panel-padding">
          <ErrorBox error={error} onRetry={refresh} />
        </div>
      ) : loading && !data ? (
        <Loading rows={4} />
      ) : data?.rows?.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>کد</th>
                <th>کاربر</th>
                <th>شرح</th>
                <th>مسیر</th>
                <th>زمان</th>
                <th className="actions-column">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td dir="ltr">{row.code}</td>
                  <td>{row.actor_name || 'مهمان'}</td>
                  <td className="wrap-cell">{row.message}</td>
                  <td dir="ltr">{row.url || '—'}</td>
                  <td>{dateFa(row.created_at)}</td>
                  <td>
                    <div className="row-actions">
                      {row.status === 'new' && (
                        <Button variant="ghost" icon="Eye" onClick={() => update(row, 'seen')}>
                          دیدم
                        </Button>
                      )}
                      {row.status !== 'resolved' && (
                        <Button
                          variant="ghost"
                          icon="Check"
                          onClick={() => update(row, 'resolved')}
                        >
                          حل شد
                        </Button>
                      )}
                      {row.status === 'resolved' && (
                        <Badge tone="green" dot>
                          حل‌شده
                        </Badge>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="گزارشی در این وضعیت نیست" icon="CircleHelp" />
      )}
    </section>
  );
}

export function RestorePanel() {
  const { toast } = useApp();
  const { data: history, refresh } = useApi('/settings/restore/history');
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('password', password);
      const response = await api('/settings/backup/restore', { method: 'POST', body });
      setResult(response);
      setConfirming(false);
      setFile(null);
      setPassword('');
      refresh();
      toast('پشتیبان بازیابی شد؛ لطفاً دوباره وارد شوید.');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel restore-panel">
      <div className="panel-heading">
        <div>
          <h2>بازگردانی پشتیبان</h2>
          <p className="muted small-text">
            فایل SQLite پشتیبان را بارگذاری کنید. پیش از بازگردانی، از وضعیت فعلی نسخه امنیتی گرفته
            می‌شود.
          </p>
        </div>
        <Button
          variant="secondary"
          icon="Download"
          onClick={() => download('/settings/backup', `madresehyar-${today()}.sqlite`)}
        >
          دریافت پشتیبان تازه
        </Button>
      </div>
      <div className="restore-form">
        <div className="form-field">
          <label htmlFor="restore-file">فایل پشتیبان (sqlite.)</label>
          <input
            id="restore-file"
            type="file"
            accept=".sqlite,.db"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="restore-password">رمز عبور مدیر</label>
          <input
            id="restore-password"
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button
          variant="danger"
          icon="Database"
          disabled={!file || password.length < 4}
          onClick={() => setConfirming(true)}
        >
          بازگردانی پایگاه‌داده
        </Button>
      </div>
      {error && <ErrorBox error={error} />}
      {result && (
        <div className="restore-result">
          <Icon name="CheckCircle2" size={22} />
          <div>
            <strong>{result.message}</strong>
            <span>
              {fa(result.students)} دانش‌آموز و {fa(result.users)} کاربر بازیابی شد · کپی امنیتی:{' '}
              <span dir="ltr">{result.safety_copy}</span>
            </span>
          </div>
        </div>
      )}
      <h3 className="section-title">کپی‌های امنیتی موجود</h3>
      {history?.files?.length ? (
        <ul className="backup-list">
          {history.files.map((item) => (
            <li key={item.name}>
              <Icon name="Database" size={17} />
              <span dir="ltr">{item.name}</span>
              <small>
                {fa(Math.round(item.bytes / 1024))} کیلوبایت · {dateFa(item.created_at)}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small-text">هنوز نسخه امنیتی ذخیره نشده است.</p>
      )}
      {confirming && (
        <Modal
          title="تأیید بازگردانی"
          subtitle="این عملیات پایگاه‌داده فعلی را جایگزین می‌کند و همه کاربران باید دوباره وارد شوند."
          onClose={() => setConfirming(false)}
        >
          <div className="modal-body">
            <div className="confirm-icon danger">
              <Icon name="Database" size={28} />
            </div>
            <p className="confirm-description">
              آیا مطمئن هستید؟ پیش از جایگزینی، یک کپی کامل از وضعیت فعلی در پوشه backups ذخیره
              می‌شود.
            </p>
            {error && <ErrorBox error={error} />}
          </div>
          <footer className="modal-footer">
            <Button variant="danger" loading={busy} onClick={restore}>
              بله، بازگردانی کن
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              انصراف
            </Button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
