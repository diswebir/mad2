import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp, useApi } from '../context';
import { moduleDefs, featureDefs } from '../../shared/catalog';
import { api, fa } from '../lib/api';
import {
  Badge,
  Button,
  ErrorBox,
  Icon,
  Loading,
  SchoolIllustration,
  Switch,
} from '../components/ui';
const steps = [
  ['بررسی آمادگی', 'Server'],
  ['مشخصات مدرسه', 'School'],
  ['حساب مدیر', 'ShieldCheck'],
  ['انتخاب امکانات', 'Boxes'],
  ['آماده استفاده', 'CheckCircle2'],
];
export default function Install() {
  const { config, user, session, acceptSession } = useApp(),
    navigate = useNavigate();
  const { data, loading, error, refresh } = useApi('/setup');
  const [step, setStep] = useState(0),
    [school, setSchool] = useState({
      ...{
        name: '',
        principal: '',
        city: '',
        phone: '',
        email: '',
        address: '',
        academic_year: '۱۴۰۵–۱۴۰۶',
      },
      ...config?.school,
    }),
    [admin, setAdmin] = useState({ username: user?.username || 'admin', password: '', token: '' }),
    [modules, setModules] = useState(
      config?.modules.filter((m) => m.enabled).map((m) => m.id) || moduleDefs.map((m) => m.id),
    ),
    [demoData, setDemoData] = useState(true),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(null);
  const installed = !!data?.installed;
  const enabledFeatures = featureDefs.filter((f) => modules.includes(f.module)).length;
  const next = (e) => {
    e.preventDefault();
    setFormError(null);
    setStep((s) => s + 1);
  };
  const install = async () => {
    if (installed) {
      setStep(4);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const result = await api('/setup', {
        method: 'POST',
        body: {
          token: admin.token,
          school,
          admin: { username: admin.username, password: admin.password },
          demo_data: demoData,
          enabled_modules: modules,
        },
      });
      await acceptSession(result, { ...session, installed: true, demo: false });
      setStep(4);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="install-page">
      <header className="install-topbar">
        <Link className="brand" to="/">
          <span className="brand-icon">
            <Icon name="GraduationCap" size={29} />
          </span>
          <div>
            <strong>
              مدرسه‌یار<span className="brand-dot">.</span>
            </strong>
            <span>مدیریت هوشمند مدرسه</span>
          </div>
        </Link>
        <span>
          <Icon name="LockKeyhole" size={16} />
          نصب امن و یک‌باره
        </span>
        <Link to={user ? '/' : '/login'} className="text-link">
          {user ? 'بازگشت به پنل' : 'ورود به حساب'}
          <Icon name="ArrowUpLeft" size={16} />
        </Link>
      </header>
      <main className="install-main">
        <aside className="install-sidebar">
          <Badge tone="purple">
            <Icon name="Sparkles" size={15} />
            شروعی ساده، برای مدرسه‌ای بهتر
          </Badge>
          <h1>
            مدرسه شما،
            <br />
            آماده یک <em>شروع تازه.</em>
          </h1>
          <p>چند قدم کوتاه تا یک فضای یکپارچه برای مدیریت و یادگیری.</p>
          <div className="install-steps">
            {steps.map(([label, icon], i) => (
              <div
                key={label}
                className={`${step === i ? 'active' : ''} ${step > i ? 'completed' : ''}`}
              >
                <span>
                  {step > i ? <Icon name="Check" size={20} /> : <Icon name={icon} size={20} />}
                </span>
                <div>
                  <small>مرحله {fa(i + 1)}</small>
                  <strong>{label}</strong>
                </div>
                {step > i && <Icon name="CheckCheck" size={16} />}
              </div>
            ))}
          </div>
          <SchoolIllustration className="install-illustration" />
          <small className="install-sidebar-note">
            <Icon name="Database" size={15} />
            بدون نیاز به سرویس پایگاه‌داده جداگانه
          </small>
        </aside>
        <section className="panel install-card">
          <div className="install-card-header">
            <span className="eyebrow">راه‌اندازی مدرسه‌یار</span>
            <h2>{step === 4 ? 'همه‌چیز آماده است!' : steps[step][0]}</h2>
            <p>
              {
                [
                  'اول مطمئن شویم همه‌چیز برای شروع آماده است.',
                  'اطلاعات اصلی مدرسه را وارد کنید.',
                  'حسابی امن برای مدیریت مدرسه بسازید.',
                  'فقط امکاناتی را انتخاب کنید که به آن‌ها نیاز دارید.',
                  'مدرسه‌یار، همراه روزهای بهتر مدرسه شماست.',
                ][step]
              }
            </p>
            <div className="wizard-progress">
              <span style={{ width: `${((step + 1) / 5) * 100}%` }} />
            </div>
          </div>
          <div className="install-card-body">
            {loading ? (
              <Loading rows={3} />
            ) : error ? (
              <ErrorBox error={error} onRetry={refresh} />
            ) : (
              <>
                {installed && step < 4 && (
                  <div className="info-box">
                    <Icon name="CheckCircle2" size={20} />
                    <span>
                      سامانه قبلاً نصب شده است. این مراحل فقط برای مرور راه‌اندازی هستند؛ تغییرات
                      واقعی را از تنظیمات انجام دهید.
                    </span>
                  </div>
                )}
                {formError && <ErrorBox error={formError} />}{' '}
                {step === 0 && (
                  <>
                    <div className="requirements-list">
                      {data.requirements.map((r) => (
                        <div key={r.name}>
                          <span className={`requirement-icon ${r.passed ? 'passed' : ''}`}>
                            <Icon name={r.passed ? 'CheckCircle2' : 'AlertCircle'} size={22} />
                          </span>
                          <div>
                            <strong>{r.name}</strong>
                            <span
                              dir={
                                r.value.includes('/') || r.value.includes('.') ? 'ltr' : undefined
                              }
                            >
                              {r.value}
                            </span>
                          </div>
                          <Badge tone={r.passed ? 'green' : 'red'}>
                            {r.passed ? 'آماده' : 'نیازمند بررسی'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                    <div className="cpanel-install-note">
                      <Icon name="Server" size={25} />
                      <div>
                        <h3>نصب روی cPanel</h3>
                        <p>
                          هاست باید قابلیت «Setup Node.js App» داشته باشد. فایل شروع app.cjs و
                          Node.js نسخه ۲۰.۱۹+ یا ۲۲.۱۲+ لازم است. مسیر برنامه و داده‌ها را خارج از
                          public_html قرار دهید.
                        </p>
                        <small>راهنمای گام‌به‌گام: docs/CPANEL.md</small>
                      </div>
                    </div>
                  </>
                )}
                {step === 1 && (
                  <form id="wizard-form" onSubmit={next}>
                    <div className="form-grid">
                      {[
                        ['name', 'نام مدرسه', true],
                        ['principal', 'نام مدیر', true],
                        ['academic_year', 'سال تحصیلی', true],
                        ['city', 'شهر', false],
                        ['phone', 'شماره تماس', false],
                        ['email', 'ایمیل', false],
                        ['address', 'نشانی مدرسه', false],
                      ].map(([key, label, required]) => (
                        <label
                          className={`form-field ${key === 'address' ? 'full-width' : ''}`}
                          key={key}
                        >
                          {label}
                          {required && <span className="required-star">*</span>}
                          {key === 'address' ? (
                            <textarea
                              rows={3}
                              disabled={installed}
                              value={school[key] || ''}
                              onChange={(e) => setSchool((s) => ({ ...s, [key]: e.target.value }))}
                              maxLength={1000}
                            />
                          ) : (
                            <input
                              required={required && !installed}
                              disabled={installed}
                              type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                              value={school[key] || ''}
                              onChange={(e) => setSchool((s) => ({ ...s, [key]: e.target.value }))}
                              maxLength={100}
                              dir={['email', 'phone'].includes(key) ? 'ltr' : undefined}
                            />
                          )}
                        </label>
                      ))}
                    </div>
                  </form>
                )}
                {step === 2 && (
                  <form id="wizard-form" onSubmit={next}>
                    <div className="form-stack">
                      <div className="info-box">
                        <Icon name="ShieldCheck" size={20} />
                        <span>
                          احراز هویت و مدیریت ماژول‌ها همیشه در دسترس می‌مانند تا حساب مدیر قفل
                          نشود.
                        </span>
                      </div>
                      <label>
                        نام کاربری مدیر (لاتین)
                        <input
                          required={!installed}
                          disabled={installed}
                          minLength={3}
                          maxLength={100}
                          dir="ltr"
                          value={admin.username}
                          onChange={(e) => setAdmin((a) => ({ ...a, username: e.target.value }))}
                        />
                      </label>
                      {!installed && (
                        <>
                          <label>
                            رمز عبور مدیر
                            <input
                              required
                              type="password"
                              autoComplete="new-password"
                              minLength={10}
                              maxLength={128}
                              dir="ltr"
                              value={admin.password}
                              onChange={(e) =>
                                setAdmin((a) => ({ ...a, password: e.target.value }))
                              }
                              placeholder="حداقل ۱۰ کاراکتر"
                            />
                          </label>
                          <label htmlFor="install-token">
                            توکن نصب
                            <input
                              required
                              type="password"
                              autoComplete="off"
                              minLength={24}
                              dir="ltr"
                              id="install-token"
                              aria-describedby="install-token-help"
                              value={admin.token}
                              onChange={(e) => setAdmin((a) => ({ ...a, token: e.target.value }))}
                            />
                          </label>
                          <small className="field-hint" id="install-token-help">
                            مقدار INSTALL_TOKEN در تنظیمات برنامه، یا محتوای فایل خصوصی
                            data/install.key. این توکن فقط برای نصب اولیه است.
                          </small>
                        </>
                      )}
                      {installed && (
                        <div className="installed-account">
                          <Icon name="ShieldCheck" size={36} />
                          <strong>حساب مدیر قبلاً ساخته شده است</strong>
                          <p>رمز عبور از بخش حساب کاربری قابل تغییر است.</p>
                        </div>
                      )}
                    </div>
                  </form>
                )}
                {step === 3 && (
                  <>
                    <div className="wizard-module-heading">
                      <span>
                        {fa(modules.length)} ماژول · {fa(enabledFeatures)} قابلیت
                      </span>
                      {!installed && (
                        <button onClick={() => setModules(moduleDefs.map((m) => m.id))}>
                          انتخاب همه
                        </button>
                      )}
                    </div>
                    <div className="wizard-modules">
                      {moduleDefs.map((m) => (
                        <div key={m.id}>
                          <Icon name={m.icon} size={20} />
                          <span>{m.name}</span>
                          <Switch
                            enabled={modules.includes(m.id)}
                            disabled={installed || m.locked}
                            label={`ماژول ${m.name}`}
                            onChange={(enabled) =>
                              setModules((list) =>
                                enabled ? [...list, m.id] : list.filter((id) => id !== m.id),
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <div className="wizard-demo-option">
                      <span className="small-icon tone-purple">
                        <Icon name="Sparkles" size={24} />
                      </span>
                      <div>
                        <strong>با داده‌های نمونه شروع کنیم</strong>
                        <p>
                          ۲۴۰ دانش‌آموز، ۱۲ کلاس و سوابق نمونه. در نصب واقعی، حساب‌های نمونه تا
                          فعال‌سازی و بازنشانی رمز توسط مدیر غیرفعال هستند.
                        </p>
                      </div>
                      <Switch
                        enabled={demoData}
                        disabled={installed}
                        label="ورود داده‌های نمونه"
                        onChange={setDemoData}
                      />
                    </div>
                  </>
                )}
                {step === 4 && (
                  <div className="install-success">
                    <div>
                      <Icon name="CheckCircle2" size={64} />
                    </div>
                    <h3>{school.name || config?.school.name || 'مدرسه شما'} آماده است</h3>
                    <p>
                      {installed
                        ? 'وضعیت راه‌اندازی بررسی شد. از پنل مدرسه، همه‌چیز را مدیریت کنید.'
                        : 'نصب با موفقیت تکمیل شد. حساب مدیر آماده است و می‌توانید کار را شروع کنید.'}
                    </p>
                    <div className="install-success-features">
                      <span>
                        <Icon name="Check" size={16} />
                        فونت وزیرمتن
                      </span>
                      <span>
                        <Icon name="Check" size={16} />
                        پنل راست‌به‌چپ
                      </span>
                      <span>
                        <Icon name="Check" size={16} />
                        دسترسی نقش‌محور
                      </span>
                      <span>
                        <Icon name="Check" size={16} />
                        ماژول‌های مستقل
                      </span>
                    </div>
                    <Button icon="ArrowLeft" onClick={() => navigate(user ? '/' : '/login')}>
                      {user ? 'ورود به پنل مدرسه' : 'ورود به حساب مدیر'}
                    </Button>
                    {user && (
                      <Link className="text-link" to="/settings">
                        تنظیمات مدرسه
                        <Icon name="ArrowUpLeft" size={15} />
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          {!loading && !error && step < 4 && (
            <footer className="install-card-footer">
              {step === 1 || step === 2 ? (
                <Button type="submit" form="wizard-form">
                  مرحله بعد
                  <Icon name="ArrowLeft" size={16} />
                </Button>
              ) : step === 3 ? (
                <Button loading={busy} icon={installed ? 'Check' : 'Rocket'} onClick={install}>
                  {installed ? 'پایان بررسی راه‌اندازی' : 'نصب و راه‌اندازی مدرسه'}
                </Button>
              ) : (
                <Button
                  disabled={data.requirements.some((r) => !r.passed)}
                  onClick={() => setStep(1)}
                >
                  شروع راه‌اندازی
                  <Icon name="ArrowLeft" size={16} />
                </Button>
              )}
              {step > 0 && (
                <Button
                  variant="secondary"
                  icon="ArrowRight"
                  disabled={busy}
                  onClick={() => {
                    setFormError(null);
                    setStep((s) => s - 1);
                  }}
                >
                  مرحله قبل
                </Button>
              )}
              <span>مرحله {fa(step + 1)} از ۵</span>
            </footer>
          )}
        </section>
      </main>
      <footer className="install-footer">
        مدرسه‌یار · ساده در نصب، کامل در مدیریت · نسخه ۱.۰.۰
      </footer>
    </div>
  );
}
